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
import type { Annotation } from "@/features/annotations/types";
import { markdownToAnchorText, reconnectAnchor } from "@/lib/markdown/anchor-text";

type DocumentWriteResult =
  | { ok: true; id?: string; version?: number }
  | { ok: false; reason: "conflict" | "duplicate" | "not-found" | "unknown" };

export function linkTargetsForStorage(markdown: string) {
  return extractWikiLinkTargets(markdown).map((link) => ({
    normalized_title: link.normalizedTitle,
    title: link.title,
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
    .neq("status", "draft")
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

/** Best-effort: silently ignores alias conflicts (another document already owns that alias). */
export async function addDocumentAlias(
  supabase: SupabaseClient,
  ownerId: string,
  documentId: string,
  alias: string,
): Promise<void> {
  const trimmed = alias.trim().slice(0, 200);
  if (!trimmed) return;
  await supabase.from("document_aliases").insert({
    owner_id: ownerId,
    document_id: documentId,
    alias: trimmed,
    normalized_alias: normalizeConcept(trimmed),
  });
}

export async function listNormalizedTitleSet(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Set<string>> {
  const [{ data: documents }, { data: aliases }] = await Promise.all([
    supabase
      .from("documents")
      .select("normalized_title")
      .eq("owner_id", ownerId)
      .is("deleted_at", null)
      .neq("status", "draft"),
    supabase
      .from("document_aliases")
      .select("normalized_alias")
      .eq("owner_id", ownerId),
  ]);

  const set = new Set<string>();
  for (const row of documents ?? []) set.add(row.normalized_title);
  for (const row of aliases ?? []) set.add(row.normalized_alias);
  return set;
}

export async function createDocument(
  supabase: SupabaseClient,
  input: DocumentInput,
  frontmatter: Record<string, unknown> = {},
): Promise<DocumentWriteResult> {
  const slug = slugifyDocumentTitle(input.title);
  if (!slug) return { ok: false, reason: "unknown" };

  const { data, error } = await supabase.rpc("create_document", {
    p_title: input.title,
    p_normalized_title: normalizeConcept(input.title),
    p_slug: slug,
    p_summary: input.summary,
    p_body_markdown: input.bodyMarkdown,
    p_frontmatter: frontmatter,
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
  annotations: Annotation[] = [],
): Promise<DocumentWriteResult> {
  const text = markdownToAnchorText(input.bodyMarkdown);
  const anchors = annotations
    .filter((annotation) => annotation.status !== "orphaned")
    .map((annotation) => {
      const resolved = reconnectAnchor(text, {
        id: annotation.id,
        start: annotation.anchor_start,
        end: annotation.anchor_end,
        exact: annotation.quote_exact,
        prefix: annotation.quote_prefix,
        suffix: annotation.quote_suffix,
        status: annotation.status,
      });
      return {
        id: resolved.id,
        anchor_start: resolved.start,
        anchor_end: resolved.end,
        quote_prefix: resolved.prefix,
        quote_suffix: resolved.suffix,
        status: resolved.status,
      };
    });
  const { data, error } = await supabase.rpc("update_document_with_annotation_anchors", {
    p_document_id: documentId,
    p_expected_version: input.version,
    p_title: input.title,
    p_normalized_title: normalizeConcept(input.title),
    p_summary: input.summary,
    p_body_markdown: input.bodyMarkdown,
    p_frontmatter: frontmatter,
    p_link_targets: linkTargetsForStorage(input.bodyMarkdown),
    p_annotation_anchors: anchors,
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

/**
 * Creates a hidden placeholder document so an image can be attached before the
 * user has saved a brand-new document for the first time. It carries no
 * revision or link history — it only exists to give `attachments.document_id`
 * something to point at until the real save (createDocumentAction) reparents
 * the attachments onto the finished document and deletes this row.
 */
export async function createDraftDocument(
  supabase: SupabaseClient,
  ownerId: string,
  rawTitle: string,
): Promise<{ id: string } | null> {
  const baseTitle = rawTitle.trim() || `제목 없음 ${Date.now()}`;
  const title = baseTitle.slice(0, 200);
  const normalizedTitle = normalizeConcept(title);
  const slug = slugifyDocumentTitle(title) || `draft-${Date.now()}`;

  const { data, error } = await supabase
    .from("documents")
    .insert({
      owner_id: ownerId,
      title,
      normalized_title: normalizedTitle,
      slug,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return { id: data.id as string };
}

const MAX_TITLE_ATTEMPTS = 20;

/** Draft with body and frontmatter; retries with " (n)" suffixes when the title is taken. */
export async function createAiDraftDocument(
  supabase: SupabaseClient,
  ownerId: string,
  input: { title: string; bodyMarkdown: string; frontmatter: Record<string, unknown> },
): Promise<{ id: string; slug: string } | null> {
  const baseTitle = input.title.trim().slice(0, 190) || `AI 답변 ${Date.now()}`;

  for (let attempt = 1; attempt <= MAX_TITLE_ATTEMPTS; attempt++) {
    const title = attempt === 1 ? baseTitle : `${baseTitle} (${attempt})`;
    const slug = slugifyDocumentTitle(title) || `draft-${Date.now()}`;
    const { data, error } = await supabase
      .from("documents")
      .insert({
        owner_id: ownerId,
        title,
        normalized_title: normalizeConcept(title),
        slug,
        summary: "",
        body_markdown: input.bodyMarkdown,
        frontmatter: input.frontmatter,
        status: "draft",
      })
      .select("id, slug")
      .single();
    if (!error && data) return { id: data.id as string, slug: data.slug as string };
    if (error?.code !== "23505") return null;
  }
  return null;
}

export async function reparentAttachments(
  supabase: SupabaseClient,
  ownerId: string,
  fromDocumentId: string,
  toDocumentId: string,
): Promise<void> {
  await supabase
    .from("attachments")
    .update({ document_id: toDocumentId })
    .eq("owner_id", ownerId)
    .eq("document_id", fromDocumentId);
}

export async function deleteDraftDocument(
  supabase: SupabaseClient,
  ownerId: string,
  documentId: string,
): Promise<void> {
  await supabase
    .from("documents")
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", documentId)
    .eq("status", "draft");
}
