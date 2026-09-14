"use server";

import { revalidatePath } from "next/cache";

import { hideRecentView, listRecentViews } from "@/features/history/data";
import {
  clearRecentSearches,
  deleteRecentSearch,
  listRecentSearches,
  recordSearch,
  searchDocuments,
} from "@/features/search/data";
import type { RecentSearch, SearchResult } from "@/features/search/types";
import type { RecentView } from "@/features/history/types";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export async function searchAction(query: string): Promise<SearchResult[]> {
  await requireOwner();
  const supabase = await createClient();
  return searchDocuments(supabase, query);
}

export async function getSearchLandingAction(): Promise<{
  recentSearches: RecentSearch[];
  recentViews: RecentView[];
}> {
  const user = await requireOwner();
  const supabase = await createClient();
  const [recentSearches, recentViews] = await Promise.all([
    listRecentSearches(supabase, user.id, 8),
    listRecentViews(supabase, user.id, 8),
  ]);
  return { recentSearches, recentViews };
}

export async function recordSearchAction(query: string): Promise<void> {
  await requireOwner();
  const supabase = await createClient();
  await recordSearch(supabase, query);
  revalidatePath("/search");
}

export async function deleteRecentSearchAction(
  normalizedQuery: string,
): Promise<void> {
  const user = await requireOwner();
  const supabase = await createClient();
  await deleteRecentSearch(supabase, user.id, normalizedQuery);
  revalidatePath("/search");
}

export async function clearRecentSearchesAction(): Promise<void> {
  const user = await requireOwner();
  const supabase = await createClient();
  await clearRecentSearches(supabase, user.id);
  revalidatePath("/search");
}

export async function hideRecentViewAction(documentId: string): Promise<void> {
  const user = await requireOwner();
  const supabase = await createClient();
  await hideRecentView(supabase, user.id, documentId);
  revalidatePath("/", "layout");
  revalidatePath("/search");
}
