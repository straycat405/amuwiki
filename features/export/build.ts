import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import * as yazl from "yazl";

import { listAttachmentsForDocuments, type ExportableAttachment } from "@/features/attachments/data";
import {
  listAllAliasesByOwner,
  listDocumentsForExport,
  type ExportableDocument,
} from "@/features/documents/data";
import { stringifyFrontmatter } from "@/lib/markdown/frontmatter";

const ATTACHMENTS_BUCKET = "attachments";
const ATTACHMENT_URL_PATTERN = /\/api\/attachments\/([0-9a-fA-F-]{36})/g;

export function sanitizeFileNameSegment(name: string): string {
  const cleaned = name.replace(/[\\/]+/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 150) || "file";
}

/** Picks a unique attachments/{slug}/{name} path, appending "-2", "-3", … on collision. */
export function attachmentZipPath(documentSlug: string, originalName: string, usedPaths: Set<string>): string {
  const base = sanitizeFileNameSegment(originalName);
  const dot = base.lastIndexOf(".");
  const stem = dot === -1 ? base : base.slice(0, dot);
  const ext = dot === -1 ? "" : base.slice(dot);

  let candidate = `attachments/${documentSlug}/${base}`;
  let attempt = 2;
  while (usedPaths.has(candidate)) {
    candidate = `attachments/${documentSlug}/${stem}-${attempt}${ext}`;
    attempt += 1;
  }
  usedPaths.add(candidate);
  return candidate;
}

/** Rewrites live `/api/attachments/{id}` references to the attachment's path inside the export ZIP. */
export function relinkForExport(bodyMarkdown: string, zipPathById: Map<string, string>): string {
  return bodyMarkdown.replace(ATTACHMENT_URL_PATTERN, (match, id: string) => {
    const zipPath = zipPathById.get(id);
    return zipPath ? `../${zipPath}` : match;
  });
}

type ManifestDocument = {
  id: string;
  slug: string;
  title: string;
  aliases: string[];
  path: string;
  createdAt: string;
  updatedAt: string;
  sha256: string;
};

type ManifestAttachment = {
  id: string;
  documentId: string;
  path: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

function buildIndexMarkdown(documents: ManifestDocument[]): string {
  const lines = ["# 아무위키 내보내기", "", `내보낸 시각: ${new Date().toISOString()}`, "", "## 문서 목록", ""];
  for (const doc of documents) {
    lines.push(`- [${doc.title}](${doc.path})`);
  }
  return lines.join("\n") + "\n";
}

function buildDocumentMarkdown(document: ExportableDocument, aliases: string[], relinkedBody: string): string {
  const frontmatter: Record<string, unknown> = { ...document.frontmatter, title: document.title };
  if (aliases.length > 0) frontmatter.aliases = aliases;
  return stringifyFrontmatter(frontmatter, relinkedBody);
}

export type ExportStats = {
  documentCount: number;
  attachmentCount: number;
  totalBytes: number;
};

export async function getExportStats(supabase: SupabaseClient, ownerId: string): Promise<ExportStats> {
  const documents = await listDocumentsForExport(supabase, ownerId);
  const attachments = await listAttachmentsForDocuments(
    supabase,
    ownerId,
    documents.map((doc) => doc.id),
  );
  const totalBytes = attachments.reduce((sum, a) => sum + a.sizeBytes, 0);
  return { documentCount: documents.length, attachmentCount: attachments.length, totalBytes };
}

/**
 * Builds a full, portable export ZIP: one Markdown file per active document (with title,
 * aliases and preserved custom frontmatter), attachments copied under attachments/{slug}/,
 * relative-path image references rewritten to match, plus manifest.json (ids, checksums,
 * timestamps) and an index.md for browsing without the app.
 */
export async function buildExportZip(supabase: SupabaseClient, ownerId: string): Promise<Buffer> {
  const [documents, aliasesByDocument] = await Promise.all([
    listDocumentsForExport(supabase, ownerId),
    listAllAliasesByOwner(supabase, ownerId),
  ]);
  const attachments = await listAttachmentsForDocuments(
    supabase,
    ownerId,
    documents.map((doc) => doc.id),
  );

  const documentById = new Map(documents.map((doc) => [doc.id, doc]));
  const attachmentsByDocument = new Map<string, ExportableAttachment[]>();
  for (const attachment of attachments) {
    const list = attachmentsByDocument.get(attachment.documentId) ?? [];
    list.push(attachment);
    attachmentsByDocument.set(attachment.documentId, list);
  }

  const usedAttachmentPaths = new Set<string>();
  const zipPathByAttachmentId = new Map<string, string>();
  const manifestAttachments: ManifestAttachment[] = [];
  const attachmentBuffers = new Map<string, Buffer>();

  for (const attachment of attachments) {
    const document = documentById.get(attachment.documentId);
    if (!document) continue;

    const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(attachment.storagePath);
    if (error || !data) continue;
    const bytes = Buffer.from(await data.arrayBuffer());

    const zipPath = attachmentZipPath(document.slug, attachment.originalName, usedAttachmentPaths);
    zipPathByAttachmentId.set(attachment.id, zipPath);
    attachmentBuffers.set(zipPath, bytes);
    manifestAttachments.push({
      id: attachment.id,
      documentId: attachment.documentId,
      path: zipPath,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      sha256: attachment.sha256,
    });
  }

  const manifestDocuments: ManifestDocument[] = [];
  const documentBuffers = new Map<string, Buffer>();

  for (const document of documents) {
    const aliases = aliasesByDocument.get(document.id) ?? [];
    const relinkedBody = relinkForExport(document.bodyMarkdown, zipPathByAttachmentId);
    const markdown = buildDocumentMarkdown(document, aliases, relinkedBody);
    const path = `documents/${document.slug}.md`;
    const buffer = Buffer.from(markdown, "utf8");

    documentBuffers.set(path, buffer);
    manifestDocuments.push({
      id: document.id,
      slug: document.slug,
      title: document.title,
      aliases,
      path,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      sha256: createHash("sha256").update(buffer).digest("hex"),
    });
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    documents: manifestDocuments,
    attachments: manifestAttachments,
  };

  const zipfile = new yazl.ZipFile();
  zipfile.addBuffer(Buffer.from(buildIndexMarkdown(manifestDocuments), "utf8"), "index.md");
  zipfile.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), "utf8"), "manifest.json");
  for (const [path, buffer] of documentBuffers) zipfile.addBuffer(buffer, path);
  for (const [path, buffer] of attachmentBuffers) zipfile.addBuffer(buffer, path);
  zipfile.end();

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    zipfile.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zipfile.outputStream.on("end", () => resolve());
    zipfile.outputStream.on("error", reject);
  });
  return Buffer.concat(chunks);
}
