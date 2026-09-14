import { createHash, randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { listNormalizedTitleSet } from "@/features/documents/data";
import {
  IMPORTS_BUCKET,
  createImportJob,
  insertImportItems,
  storageKeyFor,
  updateImportJobStatus,
} from "@/features/imports/data";
import { isAllowedImportFile, parseImportFile } from "@/features/imports/parse";
import {
  IMPORT_MAX_FILES,
  IMPORT_MAX_FILE_BYTES,
  IMPORT_SAMPLE_LIMIT,
  type ImportAnalysis,
  type ImportItemStatus,
} from "@/features/imports/types";
import { normalizeConcept } from "@/lib/markdown/slug";
import { requireApiUser } from "@/lib/auth/api-auth";

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
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

  const storagePath = `${user.id}/${randomUUID()}`;
  const job = await createImportJob(supabase, user.id, storagePath);
  if (!job) {
    return NextResponse.json({ message: "가져오기 작업을 만들지 못했습니다." }, { status: 500 });
  }

  const existingTitles = await listNormalizedTitleSet(supabase, user.id);
  const seenInBatch = new Set<string>();

  const itemsToInsert: {
    relativePath: string;
    contentSha256: string;
    detectedTitle: string;
    status: ImportItemStatus;
    warningCodes: string[];
  }[] = [];
  const samples: ImportAnalysis["samples"] = [];
  let readyCount = 0;
  let failedCount = 0;
  let duplicateInBatchCount = 0;
  let conflictWithExistingCount = 0;

  for (const file of files) {
    const warningCodes: string[] = [];

    if (!isAllowedImportFile(file.name)) {
      failedCount += 1;
      itemsToInsert.push({
        relativePath: file.name,
        contentSha256: "",
        detectedTitle: file.name,
        status: "failed",
        warningCodes: ["unsupported_extension"],
      });
      continue;
    }
    if (file.size > IMPORT_MAX_FILE_BYTES) {
      failedCount += 1;
      itemsToInsert.push({
        relativePath: file.name,
        contentSha256: "",
        detectedTitle: file.name,
        status: "failed",
        warningCodes: ["file_too_large"],
      });
      continue;
    }

    const raw = await file.text();
    const sha256 = createHash("sha256").update(raw, "utf8").digest("hex");
    const { title, content } = parseImportFile(file.name, raw);
    const normalizedTitle = normalizeConcept(title);

    if (seenInBatch.has(normalizedTitle)) {
      warningCodes.push("duplicate_title_in_batch");
      duplicateInBatchCount += 1;
    }
    seenInBatch.add(normalizedTitle);
    if (existingTitles.has(normalizedTitle)) {
      warningCodes.push("duplicate_title_existing");
      conflictWithExistingCount += 1;
    }

    const { error: uploadError } = await supabase.storage
      .from(IMPORTS_BUCKET)
      .upload(`${storagePath}/${storageKeyFor(file.name)}`, raw, {
        contentType: "text/plain; charset=utf-8",
        upsert: true,
      });
    if (uploadError) {
      failedCount += 1;
      itemsToInsert.push({
        relativePath: file.name,
        contentSha256: sha256,
        detectedTitle: title,
        status: "failed",
        warningCodes: [...warningCodes, "upload_failed"],
      });
      continue;
    }

    readyCount += 1;
    itemsToInsert.push({
      relativePath: file.name,
      contentSha256: sha256,
      detectedTitle: title,
      status: "ready",
      warningCodes,
    });
    if (samples.length < IMPORT_SAMPLE_LIMIT) {
      samples.push({ relativePath: file.name, title, bodyMarkdown: content });
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
    totalFiles: files.length,
    readyCount,
    failedCount,
    duplicateInBatchCount,
    conflictWithExistingCount,
  });

  const analysis: ImportAnalysis = {
    jobId: job.id,
    totalFiles: files.length,
    readyCount,
    failedCount,
    duplicateInBatchCount,
    conflictWithExistingCount,
    items,
    samples,
  };
  return NextResponse.json(analysis);
}
