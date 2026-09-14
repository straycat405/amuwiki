import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentInput } from "@/features/documents/document-schema";
import type {
  DocumentListItem,
  WikiDocument,
} from "@/features/documents/types";
import { normalizeConcept, slugifyDocumentTitle } from "@/lib/markdown/slug";

type DocumentWriteResult =
  | { ok: true; id?: string; version?: number }
  | { ok: false; reason: "conflict" | "duplicate" | "not-found" | "unknown" };

export async function listDocuments(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 50,
): Promise<DocumentListItem[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, slug, title, summary, status, updated_at")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("문서 목록을 불러오지 못했습니다.");
  return (data ?? []) as DocumentListItem[];
}

export async function getDocumentBySlug(
  supabase: SupabaseClient,
  ownerId: string,
  slug: string,
): Promise<WikiDocument | null> {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, slug, title, summary, status, body_markdown, frontmatter, version, created_at, updated_at",
    )
    .eq("owner_id", ownerId)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("문서를 불러오지 못했습니다.");
  return data as WikiDocument | null;
}

export async function getDocumentById(
  supabase: SupabaseClient,
  ownerId: string,
  documentId: string,
): Promise<WikiDocument | null> {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, slug, title, summary, status, body_markdown, frontmatter, version, created_at, updated_at",
    )
    .eq("owner_id", ownerId)
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("문서를 불러오지 못했습니다.");
  return data as WikiDocument | null;
}

export async function createDocument(
  supabase: SupabaseClient,
  input: DocumentInput,
): Promise<DocumentWriteResult> {
  const slug = slugifyDocumentTitle(input.title);
  if (!slug) return { ok: false, reason: "unknown" };

  const { data, error } = await supabase.rpc("create_document", {
    p_title: input.title,
    p_normalized_title: normalizeConcept(input.title),
    p_slug: slug,
    p_summary: input.summary,
    p_body_markdown: input.bodyMarkdown,
    p_frontmatter: {},
  });

  if (error?.code === "23505") return { ok: false, reason: "duplicate" };
  if (error || typeof data !== "string")
    return { ok: false, reason: "unknown" };
  return { ok: true, id: data };
}

export async function updateDocument(
  supabase: SupabaseClient,
  documentId: string,
  input: DocumentInput & { version: number },
  frontmatter: Record<string, unknown>,
): Promise<DocumentWriteResult> {
  const { data, error } = await supabase.rpc("update_document", {
    p_document_id: documentId,
    p_expected_version: input.version,
    p_title: input.title,
    p_normalized_title: normalizeConcept(input.title),
    p_summary: input.summary,
    p_body_markdown: input.bodyMarkdown,
    p_frontmatter: frontmatter,
  });

  if (error?.code === "40001") return { ok: false, reason: "conflict" };
  if (error?.code === "23505") return { ok: false, reason: "duplicate" };
  if (error?.code === "P0002") return { ok: false, reason: "not-found" };
  if (error || typeof data !== "number")
    return { ok: false, reason: "unknown" };
  return { ok: true, version: data };
}
