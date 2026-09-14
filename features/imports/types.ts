export const IMPORT_ALLOWED_EXTENSIONS = [".md", ".markdown", ".txt"] as const;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_FILES = 200;
export const IMPORT_SAMPLE_LIMIT = 10;

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
  items: ImportResultItem[];
};
