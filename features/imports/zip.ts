import * as yauzl from "yauzl";

import { isAllowedImportFile } from "@/features/imports/parse";
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_ZIP_MAX_ATTACHMENT_BYTES,
  IMPORT_ZIP_MAX_ENTRIES,
  IMPORT_ZIP_MAX_RATIO,
  IMPORT_ZIP_MAX_TOTAL_BYTES,
} from "@/features/imports/types";

const IGNORED_PATH_PREFIXES = [".obsidian/", "__macosx/"];
const IGNORED_FILE_NAMES = new Set([".ds_store", "thumbs.db"]);

const ATTACHMENT_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const ATTACHMENT_EXTENSIONS = new Set(Object.keys(ATTACHMENT_MIME_BY_EXTENSION));

export function attachmentMimeType(relativePath: string): string | null {
  const dot = relativePath.lastIndexOf(".");
  if (dot === -1) return null;
  return ATTACHMENT_MIME_BY_EXTENSION[relativePath.slice(dot).toLowerCase()] ?? null;
}

export type ZipEntryKind = "document" | "attachment";

export type ExtractedZipEntry = {
  relativePath: string;
  kind: ZipEntryKind;
  content: Buffer;
};

export type ZipExtractionResult = {
  entries: ExtractedZipEntry[];
  ignoredCount: number;
  rejectedCount: number;
};

export class ZipSafetyError extends Error {}

/** Normalizes zip-internal separators and rejects zip-slip / absolute / drive-letter paths. */
export function safeRelativePath(rawName: string): string | null {
  const name = rawName.replace(/\\/g, "/");
  if (name.startsWith("/") || /^[a-zA-Z]:/.test(name)) return null;
  const segments = name.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === "..")) return null;
  if (segments.length === 0) return null;
  return segments.join("/");
}

function isSymlink(entry: yauzl.Entry): boolean {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xf000;
  return unixMode === 0xa000;
}

function isIgnoredPath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  if (IGNORED_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix) || lower.includes(`/${prefix}`))) {
    return true;
  }
  const segments = lower.split("/");
  if (segments.some((segment) => segment.startsWith("."))) return true;
  const fileName = segments[segments.length - 1] ?? "";
  return IGNORED_FILE_NAMES.has(fileName);
}

function classify(relativePath: string): ZipEntryKind | null {
  if (isAllowedImportFile(relativePath)) return "document";
  const dot = relativePath.lastIndexOf(".");
  const extension = dot === -1 ? "" : relativePath.slice(dot).toLowerCase();
  if (ATTACHMENT_EXTENSIONS.has(extension)) return "attachment";
  return null;
}

async function readEntryBuffer(
  zipfile: yauzl.ZipFile,
  entry: yauzl.Entry,
  maxBytes: number,
): Promise<Buffer> {
  const stream = await zipfile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > maxBytes) {
      stream.destroy();
      throw new ZipSafetyError(`entry_too_large:${entry.fileName}`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Safely extracts markdown and image entries from an uploaded ZIP (plain Markdown
 * folder or Obsidian vault export). Rejects zip-slip paths, symlinks and entries whose
 * declared size or compression ratio suggests a zip bomb; `validateEntrySizes` makes
 * yauzl itself error out if actual decompressed bytes disagree with the central
 * directory's declared size.
 */
export async function extractZipEntries(buffer: Buffer): Promise<ZipExtractionResult> {
  if (buffer.byteLength > IMPORT_ZIP_MAX_TOTAL_BYTES) {
    throw new ZipSafetyError("zip_too_large");
  }

  const zipfile = await yauzl.fromBufferPromise(buffer, {
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
  });

  const entries: ExtractedZipEntry[] = [];
  let ignoredCount = 0;
  let rejectedCount = 0;
  let entryCount = 0;
  let totalUncompressedBytes = 0;

  try {
    for await (const entry of zipfile.eachEntry()) {
      entryCount += 1;
      if (entryCount > IMPORT_ZIP_MAX_ENTRIES) {
        throw new ZipSafetyError("too_many_entries");
      }

      const isDirectory = /\/$/.test(entry.fileName);
      if (isDirectory) continue;

      const relativePath = safeRelativePath(entry.fileName);
      if (!relativePath || isSymlink(entry)) {
        rejectedCount += 1;
        continue;
      }
      if (isIgnoredPath(relativePath)) {
        ignoredCount += 1;
        continue;
      }

      const kind = classify(relativePath);
      if (!kind) {
        ignoredCount += 1;
        continue;
      }

      if (
        entry.compressedSize > 0 &&
        entry.uncompressedSize / entry.compressedSize > IMPORT_ZIP_MAX_RATIO
      ) {
        throw new ZipSafetyError(`compression_ratio:${relativePath}`);
      }

      const maxBytes = kind === "document" ? IMPORT_MAX_FILE_BYTES : IMPORT_ZIP_MAX_ATTACHMENT_BYTES;
      if (entry.uncompressedSize > maxBytes) {
        rejectedCount += 1;
        continue;
      }

      totalUncompressedBytes += entry.uncompressedSize;
      if (totalUncompressedBytes > IMPORT_ZIP_MAX_TOTAL_BYTES) {
        throw new ZipSafetyError("zip_bomb_suspected");
      }

      const content = await readEntryBuffer(zipfile, entry, maxBytes);
      entries.push({ relativePath, kind, content });
    }
  } finally {
    zipfile.close();
  }

  return { entries, ignoredCount, rejectedCount };
}
