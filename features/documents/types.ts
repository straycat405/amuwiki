export type DocumentListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: "draft" | "active" | "archived";
  updated_at: string;
};

export type WikiDocument = DocumentListItem & {
  body_markdown: string;
  frontmatter: Record<string, unknown>;
  version: number;
  created_at: string;
};
