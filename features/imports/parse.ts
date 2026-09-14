import { frontmatterTitle, parseFrontmatter } from "@/lib/markdown/frontmatter";
import { IMPORT_ALLOWED_EXTENSIONS } from "@/features/imports/types";
import { normalizeConcept } from "@/lib/markdown/slug";

export function isAllowedImportFile(name: string): boolean {
  const lower = name.toLowerCase();
  return IMPORT_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function stripKnownExtension(name: string): string {
  return name.replace(/\.(md|markdown|txt)$/i, "");
}

/**
 * Drops a leading "# Title" line when it just repeats the document's title,
 * which is already shown separately above the body — otherwise imported
 * documents show the title twice (once as the page heading, once in the body).
 */
export function stripLeadingTitleHeading(content: string, title: string): string {
  const lines = content.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i]?.trim() === "") i++;
  const match = lines[i]?.match(/^#\s+(.+?)\s*$/);
  const headingText = match?.[1];
  if (!headingText) return content;
  if (normalizeConcept(headingText) !== normalizeConcept(title)) return content;

  let end = i + 1;
  if (lines[end]?.trim() === "") end++;
  return lines.slice(end).join("\n");
}

export function parseImportFile(fileName: string, raw: string) {
  const isMarkdown = /\.(md|markdown)$/i.test(fileName);
  const { data, content: stripped } = isMarkdown
    ? parseFrontmatter(raw)
    : { data: {}, content: raw };
  const fallback = stripKnownExtension(fileName) || fileName;
  const title = (frontmatterTitle(data) ?? fallback).slice(0, 200) || fallback;
  const content = stripLeadingTitleHeading(stripped, title);
  return { title, content, data };
}
