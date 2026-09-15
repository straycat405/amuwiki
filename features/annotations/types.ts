export type AnnotationStatus = "active" | "resolved" | "orphaned";
export type AnnotationColor = "yellow" | "blue" | "green" | "red";

export type Annotation = {
  id: string;
  document_id: string;
  document_revision: number;
  body_markdown: string;
  color_key: AnnotationColor;
  status: AnnotationStatus;
  anchor_start: number;
  anchor_end: number;
  quote_exact: string;
  quote_prefix: string;
  quote_suffix: string;
  anchor_version: number;
  created_at: string;
  updated_at: string;
};
