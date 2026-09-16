import { createHash, randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { listNormalizedTitleSet } from "@/features/documents/data";
import {
  IMPORTS_BUCKET,
  createImportJob,
  insertImportItems,
  storageKeyFor,
  updateImportJobStatus,
  type NewImportItem,
} from "@/features/imports/data";
import { isAllowedImportFile, parseImportFile } from "@/features/imports/parse";
import {
  IMPORT_MAX_FILES,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_SAMPLE_LIMIT,
  IMPORT_ZIP_MAX_TOTAL_BYTES,
  type ImportAnalysis,
  type ImportItemStatus,
  type ImportSourceKind,
} from "@/features/imports/types";
import { ZipSafetyError, attachmentMimeType, extractZipEntries } from "@/features/imports/zip";
import { normalizeConcept } from "@/lib/markdown/slug";
import { requireApiUser } from "@/lib/auth/api-auth";

/** A document or image entry pulled from either the multi-file picker or a ZIP, before upload. */
type CandidateFile = {
  relativePath: string;
  kind: "document" | "attachment";
  bytes: Buffer;
  mimeType: string;
};

const ZIP_ERROR_MESSAGES: Record<string, string> = {
  zip_too_large: "ZIP 파일이 250MB를 넘을 수 없습니다.",
  too_many_entries: "ZIP 안의 파일이 5,000개를 넘을 수 없습니다.",
  zip_bomb_suspected: "ZIP을 풀었을 때 예상 용량이 너무 큽니다.",
};

function zipErrorMessage(error: ZipSafetyError): string {
  const code = error.message.split(":")[0] ?? error.message;
  if (code === "compression_ratio") return "ZIP 안에 비정상적으로 압축된 파일이 있습니다.";
  if (code === "entry_too_large") return "ZIP 안의 파일이 너무 큽니다.";
  return ZIP_ERROR_MESSAGES[code] ?? "ZIP 파일을 처리하지 못했습니다.";
}

async function candidatesFromFiles(files: File[]): Promise<{
  candidates: CandidateFile[];
  failedItems: { relativePath: string; warningCodes: string[] }[];
}> {
  const candidates: CandidateFile[] = [];
  const failedItems: { relativePath: string; warningCodes: string[] }[] = [];

  for (const file of files) {
    if (!isAllowedImportFile(file.name)) {
      failedItems.push({ relativePath: file.name, warningCodes: ["unsupported_extension"] });
      continue;
    }
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      failedItems.push({ relativePath: file.name, warningCodes: ["file_too_large"] });
      continue;
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    candidates.push({ relativePath: file.name, kind: "document", bytes, mimeType: "text/plain; charset=utf-8" });
  }

  return { candidates, failedItems };
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const zipFile = formData.get("zip");
  const sourceKindField = formData.get("sourceKind");

  let candidates: CandidateFile[];
  let failedItems: { relativePath: string; warningCodes: string[] }[];
  let ignoredCount = 0;
  let sourceKind: ImportSourceKind = "markdown-files";

  if (zipFile instanceof File) {
    if (!zipFile.name.toLowerCase().endsWith(".zip")) {
      return NextResponse.json({ message: "ZIP 파일만 올릴 수 있습니다." }, { status: 400 });
    }
    if (zipFile.size > IMPORT_ZIP_MAX_TOTAL_BYTES) {
      return NextResponse.json({ message: "ZIP 파일이 250MB를 넘을 수 없습니다." }, { status: 400 });
    }
    sourceKind = sourceKindField === "obsidian-vault" ? "obsidian-vault" : "markdown-zip";

    try {
      const buffer = Buffer.from(await zipFile.arrayBuffer());
      const result = await extractZipEntries(buffer);
      ignoredCount = result.ignoredCount + result.rejectedCount;
      candidates = result.entries.map((entry) => ({
        relativePath: entry.relativePath,
        kind: entry.kind,
        bytes: entry.content,
        mimeType:
          entry.kind === "attachment"
            ? (attachmentMimeType(entry.relativePath) ?? "application/octet-stream")
            : "text/plain; charset=utf-8",
      }));
      failedItems = [];
    } catch (cause) {
      const message = cause instanceof ZipSafetyError ? zipErrorMessage(cause) : "ZIP 파일을 처리하지 못했습니다.";
      return NextResponse.json({ message }, { status: 400 });
    }
  } else {
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ message: "가져올 파일을 선택해주세요." }, { status: 400 });
    }
    if (files.length > IMPORT_MAX_FILES) {
      return NextResponse.json(
        { message: `한 번에 최대 ${IMPORT_MAX_FILES}개까지 가져올 수 있습니다.` },
        { status: 400 },
      );
    }
    const result = await candidatesFromFiles(files);
    candidates = result.candidates;
    failedItems = result.failedItems;
  }

  const storagePath = `${user.id}/${randomUUID()}`;
  const job = await createImportJob(supabase, user.id, storagePath, sourceKind);
  if (!job) {
    return NextResponse.json({ message: "가져오기 작업을 만들지 못했습니다." }, { status: 500 });
  }

  const existingTitles = await listNormalizedTitleSet(supabase, user.id);
  const seenInBatch = new Set<string>();

  const itemsToInsert: NewImportItem[] = failedItems.map((item) => ({
    relativePath: item.relativePath,
    contentSha256: "",
    itemKind: "document",
    detectedTitle: item.relativePath,
    status: "failed" as ImportItemStatus,
    warningCodes: item.warningCodes,
  }));
  const samples: ImportAnalysis["samples"] = [];
  let readyCount = 0;
  let failedCount = failedItems.length;
  let duplicateInBatchCount = 0;
  let conflictWithExistingCount = 0;
  let attachmentCount = 0;

  for (const candidate of candidates) {
    const sha256 = createHash("sha256").update(candidate.bytes).digest("hex");
    const warningCodes: string[] = [];

    let detectedTitle = candidate.relativePath;
    let parsedContent: string | null = null;
    if (candidate.kind === "document") {
      const parsed = parseImportFile(candidate.relativePath, candidate.bytes.toString("utf8"));
      detectedTitle = parsed.title;
      parsedContent = parsed.content;
      const normalizedTitle = normalizeConcept(parsed.title);

      if (seenInBatch.has(normalizedTitle)) {
        warningCodes.push("duplicate_title_in_batch");
        duplicateInBatchCount += 1;
      }
      seenInBatch.add(normalizedTitle);
      if (existingTitles.has(normalizedTitle)) {
        warningCodes.push("duplicate_title_existing");
        conflictWithExistingCount += 1;
      }
    }

    const { error: uploadError } = await supabase.storage
      .from(IMPORTS_BUCKET)
      .upload(`${storagePath}/${storageKeyFor(candidate.relativePath)}`, candidate.bytes, {
        contentType: candidate.mimeType,
        upsert: true,
      });
    if (uploadError) {
      failedCount += 1;
      itemsToInsert.push({
        relativePath: candidate.relativePath,
        contentSha256: sha256,
        itemKind: candidate.kind,
        detectedTitle,
        status: "failed",
        warningCodes: [...warningCodes, "upload_failed"],
      });
      continue;
    }

    readyCount += 1;
    if (candidate.kind === "attachment") attachmentCount += 1;
    itemsToInsert.push({
      relativePath: candidate.relativePath,
      contentSha256: sha256,
      itemKind: candidate.kind,
      detectedTitle,
      status: "ready",
      warningCodes,
    });
    if (parsedContent !== null && samples.length < IMPORT_SAMPLE_LIMIT) {
      samples.push({ relativePath: candidate.relativePath, title: detectedTitle, bodyMarkdown: parsedContent });
    }
  }

  const insertedItems = await insertImportItems(supabase, job.id, itemsToInsert);
  const items = itemsToInsert.map((item, index) => ({
    id: insertedItems[index]?.id ?? "",
    relativePath: item.relativePath,
    detectedTitle: item.detectedTitle,
    status: item.status,
    warningCodes: item.warningCodes,
  }));

  await updateImportJobStatus(supabase, job.id, "ready", {
    totalFiles: candidates.length + failedItems.length,
    readyCount,
    failedCount,
    duplicateInBatchCount,
    conflictWithExistingCount,
    attachmentCount,
  });

  const analysis: ImportAnalysis = {
    jobId: job.id,
    totalFiles: candidates.length + failedItems.length,
    readyCount,
    failedCount,
    duplicateInBatchCount,
    conflictWithExistingCount,
    attachmentCount,
    ignoredCount,
    items,
    samples,
  };
  return NextResponse.json(analysis);
}
