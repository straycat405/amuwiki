import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeConcept } from "@/lib/markdown/slug";
import type { RecentSearch, SearchResult } from "@/features/search/types";

type SearchDocumentsRow = {
  document_id: string;
  slug: string;
  title: string;
  summary: string;
  matched_alias: string | null;
};

export async function searchDocuments(
  supabase: SupabaseClient,
  query: string,
  limit = 20,
): Promise<SearchResult[]> {
  const normalized = normalizeConcept(query);
  if (!normalized) return [];

  const { data, error } = await supabase.rpc("search_documents", {
    p_normalized_query: normalized,
    p_limit: limit,
  });
  if (error || !data) return [];

  return (data as SearchDocumentsRow[]).map((row) => ({
    documentId: row.document_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    matchedAlias: row.matched_alias,
  }));
}

export async function recordSearch(
  supabase: SupabaseClient,
  displayQuery: string,
): Promise<void> {
  const normalized = normalizeConcept(displayQuery);
  if (!normalized) return;

  await supabase.rpc("record_search", {
    p_display_query: displayQuery.trim(),
    p_normalized_query: normalized,
  });
}

export async function listRecentSearches(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 20,
): Promise<RecentSearch[]> {
  const { data, error } = await supabase
    .from("recent_searches")
    .select("normalized_query, display_query, last_searched_at")
    .eq("user_id", ownerId)
    .order("last_searched_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => ({
    normalizedQuery: row.normalized_query,
    displayQuery: row.display_query,
    lastSearchedAt: row.last_searched_at,
  }));
}

export async function deleteRecentSearch(
  supabase: SupabaseClient,
  ownerId: string,
  normalizedQuery: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("recent_searches")
    .delete()
    .eq("user_id", ownerId)
    .eq("normalized_query", normalizedQuery);
  return !error;
}

export async function clearRecentSearches(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("recent_searches")
    .delete()
    .eq("user_id", ownerId);
  return !error;
}
