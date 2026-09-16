import type { SupabaseClient } from "@supabase/supabase-js";

const ATTACHMENTS_BUCKET = "attachments";

/** Default grace period before an abandoned draft document is eligible for cleanup. */
export const STALE_DRAFT_GRACE_DAYS = 30;

export type StaleDraftDocument = {
  id: string;
  title: string;
  updatedAt: string;
  attachmentCount: number;
  totalBytes: number;
};

/**
 * AI-answer drafts (createAiDraftDocument) also use status "draft" but are an
 * intentional saved state the user chose to keep — never treat them as abandoned.
 */
function isAiDraft(frontmatter: unknown): boolean {
  return Boolean(frontmatter) && typeof frontmatter === "object" && "ai" in (frontmatter as object);
}

/** Draft documents (excluding AI-answer drafts) untouched since before the grace cutoff. */
export async function listStaleDraftDocuments(
  supabase: SupabaseClient,
  ownerId: string,
  graceDays: number = STALE_DRAFT_GRACE_DAYS,
): Promise<StaleDraftDocument[]> {
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: drafts, error } = await supabase
    .from("documents")
    .select("id, title, updated_at, frontmatter")
    .eq("owner_id", ownerId)
    .eq("status", "draft")
    .lt("updated_at", cutoff);
  if (error) throw new Error("정리 대상 문서를 불러오지 못했습니다.");

  const eligible = (drafts ?? []).filter(
    (row) => !isAiDraft((row as { frontmatter: unknown }).frontmatter),
  ) as { id: string; title: string; updated_at: string }[];
  if (eligible.length === 0) return [];

  const documentIds = eligible.map((row) => row.id);
  const { data: attachments, error: attachmentsError } = await supabase
    .from("attachments")
    .select("document_id, size_bytes")
    .eq("owner_id", ownerId)
    .in("document_id", documentIds);
  if (attachmentsError) throw new Error("정리 대상 첨부파일을 불러오지 못했습니다.");

  const statsByDocument = new Map<string, { count: number; bytes: number }>();
  for (const row of (attachments ?? []) as { document_id: string; size_bytes: number }[]) {
    const stats = statsByDocument.get(row.document_id) ?? { count: 0, bytes: 0 };
    stats.count += 1;
    stats.bytes += row.size_bytes;
    statsByDocument.set(row.document_id, stats);
  }

  return eligible.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    attachmentCount: statsByDocument.get(row.id)?.count ?? 0,
    totalBytes: statsByDocument.get(row.id)?.bytes ?? 0,
  }));
}

export type DeleteStaleDraftsResult = {
  deletedDocuments: number;
  deletedAttachments: number;
  failedDocumentIds: string[];
};

/**
 * Deletes each draft document's attachment Storage objects first, and only removes the
 * document row (which cascades its attachment metadata) once that succeeds — so a failed
 * Storage delete never leaves a document pointing at files that are already gone.
 */
export async function deleteStaleDraftDocuments(
  supabase: SupabaseClient,
  ownerId: string,
  documentIds: string[],
): Promise<DeleteStaleDraftsResult> {
  if (documentIds.length === 0) {
    return { deletedDocuments: 0, deletedAttachments: 0, failedDocumentIds: [] };
  }

  const { data: attachments, error: attachmentsError } = await supabase
    .from("attachments")
    .select("document_id, storage_path")
    .eq("owner_id", ownerId)
    .in("document_id", documentIds);
  if (attachmentsError) throw new Error("첨부파일 목록을 불러오지 못했습니다.");

  const pathsByDocument = new Map<string, string[]>();
  for (const row of (attachments ?? []) as { document_id: string; storage_path: string }[]) {
    const paths = pathsByDocument.get(row.document_id) ?? [];
    paths.push(row.storage_path);
    pathsByDocument.set(row.document_id, paths);
  }

  let deletedDocuments = 0;
  let deletedAttachments = 0;
  const failedDocumentIds: string[] = [];

  for (const documentId of documentIds) {
    const paths = pathsByDocument.get(documentId) ?? [];
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .remove(paths);
      if (storageError) {
        failedDocumentIds.push(documentId);
        continue;
      }
    }

    const { data: deletedRows, error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("owner_id", ownerId)
      .eq("id", documentId)
      .eq("status", "draft")
      .select("id");
    if (deleteError || !deletedRows || deletedRows.length === 0) {
      failedDocumentIds.push(documentId);
      continue;
    }

    deletedDocuments += 1;
    deletedAttachments += paths.length;
  }

  return { deletedDocuments, deletedAttachments, failedDocumentIds };
}
