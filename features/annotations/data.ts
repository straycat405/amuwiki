import type { SupabaseClient } from "@supabase/supabase-js";

import type { Annotation } from "@/features/annotations/types";

const annotationFields = "id, document_id, document_revision, body_markdown, color_key, status, anchor_start, anchor_end, quote_exact, quote_prefix, quote_suffix, anchor_version, created_at, updated_at";

export async function listAnnotations(supabase: SupabaseClient, ownerId: string, documentId: string): Promise<Annotation[]> {
  const { data, error } = await supabase.from("annotations").select(annotationFields).eq("owner_id", ownerId).eq("document_id", documentId).is("deleted_at", null).order("created_at");
  if (error) throw new Error("주석을 불러오지 못했습니다.");
  return (data ?? []) as Annotation[];
}

export async function getAnnotation(supabase: SupabaseClient, ownerId: string, id: string): Promise<Annotation | null> {
  const { data, error } = await supabase.from("annotations").select(annotationFields).eq("owner_id", ownerId).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("주석을 불러오지 못했습니다.");
  return data as Annotation | null;
}

export async function createAnnotation(supabase: SupabaseClient, ownerId: string, input: Record<string, unknown>): Promise<Annotation | null> {
  const { data, error } = await supabase.from("annotations").insert({ owner_id: ownerId, document_id: input.documentId, document_revision: input.documentRevision, body_markdown: input.bodyMarkdown, color_key: input.colorKey, anchor_start: input.anchorStart, anchor_end: input.anchorEnd, quote_exact: input.quoteExact, quote_prefix: input.quotePrefix, quote_suffix: input.quoteSuffix }).select(annotationFields).single();
  if (error) return null;
  return data as Annotation;
}

export async function updateAnnotation(supabase: SupabaseClient, ownerId: string, id: string, input: Record<string, unknown>): Promise<Annotation | null> {
  const { data, error } = await supabase.from("annotations").update(input).eq("owner_id", ownerId).eq("id", id).is("deleted_at", null).select(annotationFields).maybeSingle();
  if (error) return null;
  return data as Annotation | null;
}

export async function deleteAnnotation(supabase: SupabaseClient, ownerId: string, id: string): Promise<boolean> {
  const { error } = await supabase.from("annotations").update({ deleted_at: new Date().toISOString() }).eq("owner_id", ownerId).eq("id", id).is("deleted_at", null);
  return !error;
}
