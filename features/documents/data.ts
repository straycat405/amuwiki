import type { SupabaseClient } from "@supabase/supabase-js";

import type { DocumentInput } from "@/features/documents/document-schema";
import type {
  Backlink,
  DeletedDocumentListItem,
  DocumentListItem,
  WikiDocument,
} from "@/features/documents/types";
import { normalizeConcept, slugifyDocumentTitle } from "@/lib/markdown/slug";
import {
  extractWikiLinkTargets,
  type WikiLinkResolutions,
} from "@/lib/markdown/wiki-links";

type DocumentWriteResult =
  | { ok: true; id?: string; version?: number }
  | { ok: false; reason: "conflict" | "duplicate" | "not-found" | "unknown" };

function linkTargetsForStorage(markdown: string) {
  return extractWikiLinkTargets(markdown).map((link) => ({
    normalized_title: link.normalizedTitle,
    first_position: link.firstPosition,
  }));
}

function lifecycleResult(data: unknown, error: { code?: string } | null): DocumentWriteResult {
  if (error?.code === "40001") return { ok: false, reason: "conflict" };
  if (error?.code === "P0002") return { ok: false, reason: "not-found" };
  if (error || typeof data !== "number") return { ok: false, reason: "unknown" };
  return { ok: true, version: data };
}

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

export async function listDeletedDocuments(
  supabase: SupabaseClient,
  ownerId: string,
  limit = 50,
): Promise<DeletedDocumentListItem[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, slug, title, summary, status, updated_at, deleted_at, version")
    .eq("owner_id", ownerId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("휴지통을 불러오지 못했습니다.");
  return (data ?? []) as DeletedDocumentListItem[];
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

export async function getDeletedDocumentById(
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
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (error) throw new Error("휴지통 문서를 불러오지 못했습니다.");
  return data as WikiDocument | null;
}

export async function resolveWikiLinkTargets(
  supabase: SupabaseClient,
  ownerId: string,
  markdown: string,
): Promise<WikiLinkResolutions> {
  const normalizedTitles = [
    ...new Set(
      extractWikiLinkTargets(markdown).map((link) => link.normalizedTitle),
    ),
  ];
  if (normalizedTitles.length === 0) return {};

  const { data: titledDocuments, error: titlesError } = await supabase
    .from("documents")
    .select("id, slug, title, normalized_title")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .in("normalized_title", normalizedTitles);
  if (titlesError) throw new Error("문서 링크를 해석하지 못했습니다.");

  const resolutions: WikiLinkResolutions = {};
  for (const document of titledDocuments ?? []) {
    resolutions[document.normalized_title] = {
      href: `/documents/${document.slug}`,
      title: document.title,
    };
  }

  const unresolvedTitles = normalizedTitles.filter((title) => !resolutions[title]);
  if (unresolvedTitles.length === 0) return resolutions;

  const { data: aliases, error: aliasesError } = await supabase
    .from("document_aliases")
    .select("document_id, normalized_alias")
    .eq("owner_id", ownerId)
    .in("normalized_alias", unresolvedTitles);
  if (aliasesError) throw new Error("문서 별칭을 해석하지 못했습니다.");

  const aliasDocumentIds = [
    ...new Set((aliases ?? []).map((alias) => alias.document_id)),
  ];
  if (aliasDocumentIds.length === 0) return resolutions;
  const { data: aliasedDocuments, error: documentsError } = await supabase
    .from("documents")
    .select("id, slug, title")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .in("id", aliasDocumentIds);
  if (documentsError) throw new Error("문서 별칭을 해석하지 못했습니다.");

  const documentsById = new Map(
    (aliasedDocuments ?? []).map((document) => [document.id, document]),
  );
  for (const alias of aliases ?? []) {
    const document = documentsById.get(alias.document_id);
    if (!document) continue;
    resolutions[alias.normalized_alias] = {
      href: `/documents/${document.slug}`,
      title: document.title,
    };
  }
  return resolutions;
}

export async function listBacklinks(
  supabase: SupabaseClient,
  ownerId: string,
  targetDocumentId: string,
): Promise<Backlink[]> {
  const { data: links, error: linksError } = await supabase
    .from("document_links")
    .select("source_document_id, occurrence_count")
    .eq("target_document_id", targetDocumentId)
    .eq("link_kind", "explicit");
  if (linksError) throw new Error("연결 문서를 불러오지 못했습니다.");

  const sourceIds = (links ?? []).map((link) => link.source_document_id);
  if (sourceIds.length === 0) return [];
  const { data: sources, error: sourcesError } = await supabase
    .from("documents")
    .select("id, slug, title, summary")
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .in("id", sourceIds)
    .order("updated_at", { ascending: false });
  if (sourcesError) throw new Error("연결 문서를 불러오지 못했습니다.");

  const countBySource = new Map(
    (links ?? []).map((link) => [link.source_document_id, link.occurrence_count]),
  );
  return (sources ?? []).map((source) => ({
    slug: source.slug,
    title: source.title,
    summary: source.summary,
    occurrenceCount: countBySource.get(source.id) ?? 1,
  }));
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
    p_link_targets: linkTargetsForStorage(input.bodyMarkdown),
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
    p_link_targets: linkTargetsForStorage(input.bodyMarkdown),
  });

  if (error?.code === "40001") return { ok: false, reason: "conflict" };
  if (error?.code === "23505") return { ok: false, reason: "duplicate" };
  if (error?.code === "P0002") return { ok: false, reason: "not-found" };
  if (error || typeof data !== "number")
    return { ok: false, reason: "unknown" };
  return { ok: true, version: data };
}

export async function archiveDocument(
  supabase: SupabaseClient,
  documentId: string,
  expectedVersion: number,
): Promise<DocumentWriteResult> {
  const { data, error } = await supabase.rpc("archive_document", {
    p_document_id: documentId,
    p_expected_version: expectedVersion,
  });

  return lifecycleResult(data, error);
}

export async function restoreDocument(
  supabase: SupabaseClient,
  documentId: string,
  expectedVersion: number,
): Promise<DocumentWriteResult> {
  const { data, error } = await supabase.rpc("restore_document", {
    p_document_id: documentId,
    p_expected_version: expectedVersion,
  });

  return lifecycleResult(data, error);
}
