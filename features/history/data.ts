import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecentView } from "@/features/history/types";

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

export async function listRecentViews(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 20,
): Promise<RecentView[]> {
  const { data, error } = await supabase
    .from("recent_views")
    .select("last_viewed_at, documents!inner(id, slug, title, summary, deleted_at)")
    .eq("user_id", ownerId)
    .is("hidden_at", null)
    .is("documents.deleted_at", null)
    .order("last_viewed_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as RecentViewRow[])
    .filter((row) => row.documents)
    .map((row) => ({
      documentId: row.documents!.id,
      slug: row.documents!.slug,
      title: row.documents!.title,
      summary: row.documents!.summary,
      lastViewedAt: row.last_viewed_at,
    }));
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
