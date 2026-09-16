import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { findAttachmentByStoragePath, insertAttachment } from "@/features/attachments/data";
import {
  addDocumentAlias,
  createDocument,
  updateDocumentBodyMarkdown,
} from "@/features/documents/data";
import {
  IMPORTS_BUCKET,
  getImportJob,
  listImportItems,
  storageKeyFor,
  updateImportItem,
  updateImportJobStatus,
} from "@/features/imports/data";
import { parseImportFile } from "@/features/imports/parse";
import {
  applyAttachmentReplacements,
  findAttachmentReferences,
} from "@/features/imports/relink-attachments";
import { attachmentMimeType } from "@/features/imports/zip";
import { reindexAllDocuments } from "@/features/lint/data";
import {
  frontmatterAliases,
  frontmatterUnknownFields,
} from "@/lib/markdown/frontmatter";
import type { ImportCommitResult, ImportResultItem } from "@/features/imports/types";
import { requireApiUser } from "@/lib/auth/api-auth";
import { slugifyDocumentTitle } from "@/lib/markdown/slug";

const MAX_RENAME_ATTEMPTS = 20;
const ATTACHMENTS_BUCKET = "attachments";

type CreatedDocument = {
  itemId: string;
  relativePath: string;
  documentId: string;
  title: string;
  originalBody: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ message: "인증이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    conflictPolicy?: string;
  } | null;
  const conflictPolicy = body?.conflictPolicy === "rename" ? "rename" : "skip";

  const job = await getImportJob(supabase, user.id, jobId);
  if (!job) {
    return NextResponse.json({ message: "가져오기 작업을 찾을 수 없습니다." }, { status: 404 });
  }

  await updateImportJobStatus(supabase, jobId, "importing");

  const items = await listImportItems(supabase, jobId);
  const resultItems: ImportResultItem[] = [];
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let attached = 0;

  // Attachment bytes are re-downloaded once up front so phase 2 can look them up per document
  // without re-fetching Storage on every reference; size is already bounded by the analyze-time
  // ZIP limits, so holding this batch in memory is the same trade-off the analyze step already made.
  const attachmentBytesByPath = new Map<string, Buffer>();
  for (const item of items) {
    if (item.itemKind !== "attachment" || item.status !== "ready") continue;
    const { data: fileData } = await supabase.storage
      .from(IMPORTS_BUCKET)
      .download(`${job.storagePath}/${storageKeyFor(item.relativePath)}`);
    if (!fileData) continue;
    attachmentBytesByPath.set(item.relativePath, Buffer.from(await fileData.arrayBuffer()));
  }
  const usedAttachmentPaths = new Set<string>();

  // Phase 1: create every ready document with its original (un-relinked) body.
  const created: CreatedDocument[] = [];
  for (const item of items) {
    if (item.itemKind !== "document") continue;
    if (item.status === "failed") {
      failed += 1;
      resultItems.push({ relativePath: item.relativePath, title: item.detectedTitle, status: "failed" });
      continue;
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(IMPORTS_BUCKET)
      .download(`${job.storagePath}/${storageKeyFor(item.relativePath)}`);
    if (downloadError || !fileData) {
      failed += 1;
      await updateImportItem(supabase, item.id, { status: "failed" });
      resultItems.push({ relativePath: item.relativePath, title: item.detectedTitle, status: "failed" });
      continue;
    }

    const raw = await fileData.text();
    const { title, content, data } = parseImportFile(item.relativePath, raw);
    const aliases = frontmatterAliases(data);
    const frontmatter = frontmatterUnknownFields(data);

    let attemptTitle = title;
    let outcome: Awaited<ReturnType<typeof createDocument>> | null = null;
    let attempts = 0;
    do {
      outcome = await createDocument(supabase, {
        title: attemptTitle,
        summary: "",
        bodyMarkdown: content,
      }, frontmatter);
      attempts += 1;
      if (outcome.ok || outcome.reason !== "duplicate" || conflictPolicy !== "rename") {
        break;
      }
      attemptTitle = `${title} (${attempts + 1})`;
    } while (attempts < MAX_RENAME_ATTEMPTS);

    if (outcome.ok && outcome.id) {
      imported += 1;
      for (const alias of aliases) {
        await addDocumentAlias(supabase, user.id, outcome.id, alias);
      }
      await updateImportItem(supabase, item.id, { status: "imported", targetDocumentId: outcome.id });
      resultItems.push({
        relativePath: item.relativePath,
        title: attemptTitle,
        status: "imported",
        slug: slugifyDocumentTitle(attemptTitle),
      });
      created.push({
        itemId: item.id,
        relativePath: item.relativePath,
        documentId: outcome.id,
        title: attemptTitle,
        originalBody: content,
      });
    } else if (!outcome.ok && outcome.reason === "duplicate") {
      skipped += 1;
      await updateImportItem(supabase, item.id, { status: "skipped" });
      resultItems.push({ relativePath: item.relativePath, title, status: "skipped" });
    } else {
      failed += 1;
      await updateImportItem(supabase, item.id, { status: "failed" });
      resultItems.push({ relativePath: item.relativePath, title, status: "failed" });
    }
  }

  // Phase 2: for each created document, copy any relative-path attachments it references
  // (that were actually in the ZIP) into private Storage and rewrite the reference to point at it.
  for (const doc of created) {
    if (attachmentBytesByPath.size === 0) continue;
    const references = findAttachmentReferences(doc.originalBody, doc.relativePath);
    const inZip = references.filter((ref) => attachmentBytesByPath.has(ref.resolvedPath));
    if (inZip.length === 0) continue;

    const urlByResolvedPath = new Map<string, string>();
    for (const { resolvedPath } of inZip) {
      if (urlByResolvedPath.has(resolvedPath)) continue;
      const bytes = attachmentBytesByPath.get(resolvedPath);
      if (!bytes) continue;

      const mimeType = attachmentMimeType(resolvedPath) ?? "application/octet-stream";
      const extension = resolvedPath.slice(resolvedPath.lastIndexOf(".") + 1) || "bin";
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const storagePath = `${user.id}/${doc.documentId}/${sha256}.${extension}`;

      const existing = await findAttachmentByStoragePath(supabase, user.id, storagePath);
      let attachmentId = existing?.id;
      if (!attachmentId) {
        const { error: uploadError } = await supabase.storage
          .from(ATTACHMENTS_BUCKET)
          .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
        if (uploadError) continue;

        const attachment = await insertAttachment(supabase, user.id, {
          documentId: doc.documentId,
          storagePath,
          originalName: resolvedPath.split("/").pop() ?? resolvedPath,
          mimeType,
          sizeBytes: bytes.byteLength,
          sha256,
        });
        if (!attachment) continue;
        attachmentId = attachment.id;
      }

      urlByResolvedPath.set(resolvedPath, `/api/attachments/${attachmentId}`);
      usedAttachmentPaths.add(resolvedPath);
      attached += 1;
    }

    if (urlByResolvedPath.size > 0) {
      const rewritten = applyAttachmentReplacements(doc.originalBody, doc.relativePath, urlByResolvedPath);
      await updateDocumentBodyMarkdown(supabase, user.id, doc.documentId, rewritten);
    }
  }

  for (const item of items) {
    if (item.itemKind !== "attachment" || item.status !== "ready") continue;
    await updateImportItem(supabase, item.id, {
      status: usedAttachmentPaths.has(item.relativePath) ? "imported" : "skipped",
    });
  }

  // Phase 3: re-resolve wiki links now that every document in the batch (and its final,
  // relinked body) exists — fixes forward references a document earlier in the batch made
  // to one created later, which create_document's own resolution can't see yet.
  if (created.length > 0) {
    await reindexAllDocuments(supabase, user.id);
  }

  const finalStatus = failed === 0 ? "completed" : imported > 0 ? "partial" : "failed";
  await updateImportJobStatus(supabase, jobId, finalStatus, { imported, skipped, failed, attached });

  if (imported > 0) revalidatePath("/");

  const result: ImportCommitResult = { imported, skipped, failed, attached, items: resultItems };
  return NextResponse.json(result);
}
