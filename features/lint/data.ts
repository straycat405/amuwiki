import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getDocumentById,
  linkTargetsForStorage,
  updateDocument,
} from "@/features/documents/data";
import type { Suggestion, SuggestionActionResult, SuggestionKind } from "@/features/lint/types";
import { deriveSummary } from "@/lib/markdown/summary";

type SuggestionRow = {
  id: string;
  kind: SuggestionKind;
  document_id: string;
  target_key: string;
  payload: Record<string, unknown>;
  created_at: string;
  documents: { slug: string; title: string } | null;
};

const kindOrder: Record<SuggestionKind, number> = {
  forward_link: 0,
  ai_summary: 1,
  fill_summary: 2,
  broken_link: 3,
  orphan: 4,
};

export async function refreshSuggestions(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("refresh_lint_suggestions");
  if (error || typeof data !== "number") throw new Error("정리 제안을 갱신하지 못했습니다.");
  return data;
}

/** Re-resolves every active document's wiki links against current titles and aliases. */
export async function reindexAllDocuments(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, body_markdown")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .is("deleted_at", null);
  if (error) throw new Error("문서를 불러오지 못했습니다.");

  for (const row of data ?? []) {
    const { error: rpcError } = await supabase.rpc("reindex_document_links", {
      p_document_id: row.id,
      p_link_targets: linkTargetsForStorage(row.body_markdown),
    });
    if (rpcError) throw new Error("링크를 다시 색인하지 못했습니다.");
  }
  return (data ?? []).length;
}

export async function listPendingSuggestions(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Suggestion[]> {
  const { data, error } = await supabase
    .from("document_suggestions")
    .select("id, kind, document_id, target_key, payload, created_at, documents!inner(slug, title)")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error("정리 제안을 불러오지 못했습니다.");

  const allRows = (data ?? []) as unknown as SuggestionRow[];
  // An AI summary supersedes the derived-summary row for the same document.
  const aiSummarized = new Set(allRows.filter((row) => row.kind === "ai_summary").map((row) => row.document_id));
  const rows = allRows.filter((row) => row.kind !== "fill_summary" || !aiSummarized.has(row.document_id));
  const summaryTargets = rows.filter((row) => row.kind === "fill_summary").map((row) => row.document_id);
  const proposedSummaries = await deriveSummaries(supabase, ownerId, summaryTargets);

  return rows
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      documentId: row.document_id,
      documentSlug: row.documents?.slug ?? "",
      documentTitle: row.documents?.title ?? "",
      targetKey: row.target_key,
      payload: row.payload ?? {},
      ...(row.kind === "fill_summary"
        ? { proposedSummary: proposedSummaries.get(row.document_id) ?? "" }
        : {}),
      createdAt: row.created_at,
    }))
    .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.documentTitle.localeCompare(b.documentTitle, "ko"));
}

async function deriveSummaries(
  supabase: SupabaseClient,
  ownerId: string,
  documentIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (documentIds.length === 0) return result;
  const { data, error } = await supabase
    .from("documents")
    .select("id, body_markdown")
    .eq("owner_id", ownerId)
    .in("id", documentIds);
  if (error) throw new Error("문서 본문을 불러오지 못했습니다.");
  for (const row of data ?? []) result.set(row.id, deriveSummary(row.body_markdown));
  return result;
}

function normalizeStoredSummary(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
}

async function getPendingSuggestion(
  supabase: SupabaseClient,
  ownerId: string,
  suggestionId: string,
): Promise<{ kind: SuggestionKind; documentId: string; payload: Record<string, unknown> } | null> {
  const { data, error } = await supabase
    .from("document_suggestions")
    .select("kind, document_id, payload")
    .eq("owner_id", ownerId)
    .eq("id", suggestionId)
    .eq("status", "pending")
    .maybeSingle();
  if (error) throw new Error("정리 제안을 불러오지 못했습니다.");
  return data ? { kind: data.kind, documentId: data.document_id, payload: data.payload ?? {} } : null;
}

async function markSuggestion(
  supabase: SupabaseClient,
  ownerId: string,
  suggestionId: string,
  status: "applied" | "dismissed",
): Promise<boolean> {
  const { data, error } = await supabase
    .from("document_suggestions")
    .update({ status, resolved_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("id", suggestionId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error("정리 제안 상태를 바꾸지 못했습니다.");
  return (data ?? []).length > 0;
}

export async function dismissSuggestion(
  supabase: SupabaseClient,
  ownerId: string,
  suggestionId: string,
): Promise<SuggestionActionResult> {
  const changed = await markSuggestion(supabase, ownerId, suggestionId, "dismissed");
  return changed ? { ok: true } : { ok: false, reason: "not-found" };
}

export async function applySuggestion(
  supabase: SupabaseClient,
  ownerId: string,
  suggestionId: string,
): Promise<SuggestionActionResult> {
  const suggestion = await getPendingSuggestion(supabase, ownerId, suggestionId);
  if (!suggestion) return { ok: false, reason: "not-found" };

  const document = await getDocumentById(supabase, ownerId, suggestion.documentId);
  if (!document) return { ok: false, reason: "not-found" };

  if (suggestion.kind === "forward_link") {
    const { error } = await supabase.rpc("reindex_document_links", {
      p_document_id: document.id,
      p_link_targets: linkTargetsForStorage(document.body_markdown),
    });
    if (error?.code === "P0002") return { ok: false, reason: "not-found" };
    if (error) return { ok: false, reason: "unknown" };
  } else if (suggestion.kind === "fill_summary" || suggestion.kind === "ai_summary") {
    const summary =
      suggestion.kind === "ai_summary"
        ? normalizeStoredSummary(suggestion.payload.summary)
        : deriveSummary(document.body_markdown);
    if (!summary) return { ok: false, reason: "empty" };
    const saved = await updateDocument(
      supabase,
      document.id,
      {
        title: document.title,
        summary,
        bodyMarkdown: document.body_markdown,
        version: document.version,
      },
      document.frontmatter,
    );
    if (!saved.ok) {
      return { ok: false, reason: saved.reason === "conflict" ? "conflict" : "unknown" };
    }
  } else {
    return { ok: false, reason: "unsupported" };
  }

  await markSuggestion(supabase, ownerId, suggestionId, "applied");
  return { ok: true };
}
