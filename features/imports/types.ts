export const IMPORT_ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
// Vercel Hobby caps a function at 60s. The commit route creates documents in a
// sequential loop (each depends on the previous batch's title-dedup decisions),
// so document *count* drives wall time, not byte size. 239 documents measured
// in production needed 4 retries to finish within that limit (see
// docs/tracking/status.md, commit d90731a). 150 leaves headroom under that
// measured failure point; recalibrate if Supabase latency or plan tier changes.
export const IMPORT_MAX_FILES = 150;
export const IMPORT_SAMPLE_LIMIT = 10;

/** ZIP-specific limits (plain Markdown folder or Obsidian vault export). */
// Lowered from 250MB: raw ZIP size wasn't what caused the production timeout
// (see IMPORT_MAX_FILES comment above) but a smaller cap still bounds worst-case
// attachment-download time in the commit route's phase 2.
export const IMPORT_ZIP_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
export const IMPORT_ZIP_MAX_ENTRIES = 5000;
/** Document-kind entries only (attachments don't hit the slow sequential-create loop). */
export const IMPORT_ZIP_MAX_DOCUMENTS = IMPORT_MAX_FILES;
export const IMPORT_ZIP_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Reject an entry whose declared uncompressed:compressed ratio suggests a zip bomb. */
export const IMPORT_ZIP_MAX_RATIO = 100;

export type ImportSourceKind = "markdown-files" | "markdown-zip" | "obsidian-vault";
export type ImportItemKind = "document" | "attachment";

export type ImportItemStatus =
  | "pending"
  | "ready"
  | "imported"
  | "skipped"
  | "failed";

export type AnalyzedItem = {
  id: string;
  relativePath: string;
  detectedTitle: string;
  status: ImportItemStatus;
  warningCodes: string[];
};

export type ImportSample = {
  relativePath: string;
  title: string;
  bodyMarkdown: string;
};

export type ImportAnalysis = {
  jobId: string;
  totalFiles: number;
  readyCount: number;
  failedCount: number;
  duplicateInBatchCount: number;
  conflictWithExistingCount: number;
  attachmentCount: number;
  ignoredCount: number;
  items: AnalyzedItem[];
  samples: ImportSample[];
};

export type ImportResultItem = {
  relativePath: string;
  title: string;
  status: ImportItemStatus;
  slug?: string;
};

export type ImportCommitResult = {
  imported: number;
  skipped: number;
  failed: number;
  attached: number;
  items: ImportResultItem[];
};
