/**
 * The stable, readable text used by annotation anchors. This deliberately
 * removes Markdown punctuation but retains the text a reader sees.
 */
export function markdownToAnchorText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_all, title, label) => label?.trim() || title.trim())
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*(?:[-*+] |\d+[.)] )/gm, "")
    .replace(/(`+)(.*?)\1/g, "$2")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .normalize("NFC");
}

export type TextAnchor = {
  start: number;
  end: number;
  exact: string;
  prefix: string;
  suffix: string;
};

const CONTEXT_LENGTH = 64;

export function createTextAnchor(
  text: string,
  exact: string,
  approximateStart = 0,
): TextAnchor | null {
  const quote = exact.normalize("NFC");
  if (!quote) return null;
  const matches: number[] = [];
  let cursor = text.indexOf(quote);
  while (cursor >= 0) {
    matches.push(cursor);
    cursor = text.indexOf(quote, cursor + 1);
  }
  if (matches.length === 0) return null;
  const start = matches.reduce((closest, candidate) =>
    Math.abs(candidate - approximateStart) < Math.abs(closest - approximateStart)
      ? candidate
      : closest,
  );
  const end = start + quote.length;
  return {
    start,
    end,
    exact: quote,
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + CONTEXT_LENGTH),
  };
}

export type StoredAnchor = TextAnchor & { id: string; status: "active" | "resolved" | "orphaned" };

/** Resolves by exact quote, then matching context, then nearest old position. */
export function reconnectAnchor(text: string, anchor: StoredAnchor): StoredAnchor {
  if (anchor.status === "orphaned") return anchor;
  const candidates: number[] = [];
  let cursor = text.indexOf(anchor.exact);
  while (cursor >= 0) {
    candidates.push(cursor);
    cursor = text.indexOf(anchor.exact, cursor + 1);
  }
  if (!candidates.length) return { ...anchor, status: "orphaned" };
  const score = (start: number) => {
    const prefix = text.slice(Math.max(0, start - anchor.prefix.length), start);
    const end = start + anchor.exact.length;
    const suffix = text.slice(end, end + anchor.suffix.length);
    const context = Number(prefix === anchor.prefix) * 2 + Number(suffix === anchor.suffix) * 2;
    return context * 1_000_000 - Math.abs(start - anchor.start);
  };
  const start = candidates.reduce((best, candidate) => score(candidate) > score(best) ? candidate : best);
  const end = start + anchor.exact.length;
  return {
    ...anchor,
    start,
    end,
    prefix: text.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: text.slice(end, end + CONTEXT_LENGTH),
  };
}
