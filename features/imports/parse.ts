import { frontmatterTitle, parseFrontmatter } from "@/lib/markdown/frontmatter";
import { IMPORT_ALLOWED_EXTENSIONS } from "@/features/imports/types";

export function isAllowedImportFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMPORT_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function stripKnownExtension(name: string): string {
  return name.replace(/\.(md|markdown|txt)$/i, "");
}

export function parseImportFile(fileName: string, raw: string) {
  const isMarkdown = /\.(md|markdown)$/i.test(fileName);
  const { data, content } = isMarkdown
    ? parseFrontmatter(raw)
    : { data: {}, content: raw };
  const fallback = stripKnownExtension(fileName) || fileName;
  const title = (frontmatterTitle(data) ?? fallback).slice(0, 200) || fallback;
  return { title, content, data };
}
