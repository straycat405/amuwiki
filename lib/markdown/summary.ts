import { parseFrontmatter } from "@/lib/markdown/frontmatter";

export const SUMMARY_MAX_LENGTH = 300;

const fencedCodePattern = /^(```|~~~)[\s\S]*?^\1[ \t]*$/gm;
const skippableBlockPattern = /^(#{1,6}\s|\||[-*_]{3,}\s*$|<)/;
const imageOnlyPattern = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const lineMarkerPattern = /^(?:>\s?|[-*+]\s+|\d+[.)]\s+)+/;

function stripInlineMarkup(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) =>
      (label ?? target).trim(),
    )
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string): string {
  if (text.length <= SUMMARY_MAX_LENGTH) return text;
  return `${text.slice(0, SUMMARY_MAX_LENGTH - 1).trimEnd()}…`;
}

function frontmatterSummary(data: Record<string, unknown>): string | null {
  for (const key of ["summary", "description"]) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return truncate(stripInlineMarkup(value));
  }
  return null;
}

/** First meaningful paragraph of a document, or its frontmatter summary, capped at 300 characters. */
export function deriveSummary(markdown: string): string {
  const { data, content } = parseFrontmatter(markdown);
  const explicit = frontmatterSummary(data);
  if (explicit) return explicit;

  const blocks = content.replace(fencedCodePattern, "").split(/\n[ \t]*\n/);
  for (const block of blocks) {
    const lines = block
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !skippableBlockPattern.test(line) && !imageOnlyPattern.test(line))
      .map((line) => line.replace(lineMarkerPattern, ""));
    if (lines.length === 0) continue;
    const text = stripInlineMarkup(lines.join(" "));
    if (text) return truncate(text);
  }
  return "";
}
