import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecentView, RecentViewsPage } from "@/features/history/types";

type RecentViewRow = {
  last_viewed_at: string;
  documents: {
    id: string;
    slug: string;
    title: string;
    summary: string;
  } | null;
};

export async function recordDocumentView(
  supabase: SupabaseClient,
  documentId: string,
): Promise<void> {
  await supabase.rpc("record_document_view", { p_document_id: documentId });
}

/**
 * Fetches one page of recent views, ordered newest first. Pass the last loaded item's
 * `lastViewedAt` as `before` to keyset-paginate the next page — fetches limit+1 rows to
 * know whether more remain without a separate count query.
 */
export async function listRecentViewsPage(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 20,
  before?: string,
): Promise<RecentViewsPage> {
  let query = supabase
    .from("recent_views")
    .select("last_viewed_at, documents!inner(id, slug, title, summary, deleted_at)")
    .eq("user_id", ownerId)
    .is("hidden_at", null)
    .is("documents.deleted_at", null)
    .order("last_viewed_at", { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt("last_viewed_at", before);

  const { data, error } = await query;
  if (error || !data) return { views: [], hasMore: false };

  const rows = (data as unknown as RecentViewRow[]).filter((row) => row.documents);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    views: page.map((row) => ({
      documentId: row.documents!.id,
      slug: row.documents!.slug,
      title: row.documents!.title,
      summary: row.documents!.summary,
      lastViewedAt: row.last_viewed_at,
    })),
    hasMore,
  };
}

export async function listRecentViews(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 20,
): Promise<RecentView[]> {
  const { views } = await listRecentViewsPage(supabase, ownerId, limit);
  return views;
}

export async function hideRecentView(
  supabase: SupabaseClient,
  ownerId: string,
  documentId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("recent_views")
    .update({ hidden_at: new Date().toISOString() })
    .eq("user_id", ownerId)
    .eq("document_id", documentId);
  return !error;
}
