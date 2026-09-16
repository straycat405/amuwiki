export const IMPORT_ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_FILES = 200;
export const IMPORT_SAMPLE_LIMIT = 10;

/** ZIP-specific limits (plain Markdown folder or Obsidian vault export). */
export const IMPORT_ZIP_MAX_TOTAL_BYTES = 250 * 1024 * 1024;
export const IMPORT_ZIP_MAX_ENTRIES = 5000;
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
