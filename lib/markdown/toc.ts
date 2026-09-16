import { slugifyHeading } from "@/lib/markdown/slug";

export type TocEntry = {
  level: number;
  text: string;
  slug: string;
};

const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*$/;
const INLINE_MARKUP_PATTERN = /[*_`]/g;

function isFenceLine(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

/**
 * Table of contents from ATX headings in `minLevel..maxLevel` (default: h2–h4, since the
 * document title itself already renders as the page h1). Skips fenced code blocks. Slugs
 * match remarkHeadingIds exactly, so entries link to real ids in the rendered body.
 */
export function extractToc(markdown: string, minLevel = 2, maxLevel = 4): TocEntry[] {
  const entries: TocEntry[] = [];
  let inFence = false;

  for (const line of markdown.split("\n")) {
    if (isFenceLine(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = HEADING_PATTERN.exec(line);
    if (!match) continue;
    const level = match[1]!.length;
    if (level < minLevel || level > maxLevel) continue;

    const text = match[2]!.replace(INLINE_MARKUP_PATTERN, "").trim();
    if (!text) continue;

    entries.push({ level, text, slug: slugifyHeading(text) });
  }

  return entries;
}
