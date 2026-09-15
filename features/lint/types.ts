export const suggestionKinds = ["orphan", "broken_link", "forward_link", "fill_summary", "ai_summary"] as const;

export type SuggestionKind = (typeof suggestionKinds)[number];

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  documentId: string;
  documentSlug: string;
  documentTitle: string;
  targetKey: string;
  payload: Record<string, unknown>;
  /** Only for `fill_summary`: the summary that applying would save. Empty when nothing can be derived. */
  proposedSummary?: string;
  createdAt: string;
};

export type SuggestionActionResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "conflict" | "empty" | "unsupported" | "unknown" };
