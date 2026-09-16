import matter from "gray-matter";

export type ParsedFrontmatter = {
  data: Record<string, unknown>;
  content: string;
};

/** Splits YAML frontmatter from a Markdown file's content. Invalid YAML is treated as no frontmatter. */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  try {
    const { data, content } = matter(raw);
    return { data: data ?? {}, content };
  } catch {
    return { data: {}, content: raw };
  }
}

export function frontmatterAliases(data: Record<string, unknown>): string[] {
  const raw = data.aliases;
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === "string");
  }
  if (typeof raw === "string") return [raw];
  return [];
}

export function frontmatterUnknownFields(data: Record<string, unknown>): Record<string, unknown> {
  const unknownFields = { ...data };
  delete unknownFields.title;
  delete unknownFields.aliases;
  return unknownFields;
}

export function frontmatterTitle(data: Record<string, unknown>): string | null {
  const title = data.title;
  return typeof title === "string" && title.trim() ? title.trim() : null;
}

/** Inverse of parseFrontmatter — reuses gray-matter's writer so re-parsing round-trips. */
export function stringifyFrontmatter(data: Record<string, unknown>, content: string): string {
  if (Object.keys(data).length === 0) return content;
  return matter.stringify(content, data);
}
