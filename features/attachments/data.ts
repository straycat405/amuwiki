import type { SupabaseClient } from "@supabase/supabase-js";

import type { Attachment } from "@/features/attachments/types";

export async function findAttachmentByStoragePath(
  supabase: SupabaseClient,
  ownerId: string,
  storagePath: string,
): Promise<Attachment | null> {
  const { data } = await supabase
    .from("attachments")
    .select("id, storage_path, original_name, mime_type")
    .eq("owner_id", ownerId)
    .eq("storage_path", storagePath)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    storagePath: data.storage_path,
    originalName: data.original_name,
    mimeType: data.mime_type,
  };
}

export async function insertAttachment(
  supabase: SupabaseClient,
  ownerId: string,
  input: {
    documentId: string;
    storagePath: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string;
  },
): Promise<Attachment | null> {
  const { data, error } = await supabase
    .from("attachments")
    .insert({
      owner_id: ownerId,
      document_id: input.documentId,
      storage_path: input.storagePath,
      original_name: input.originalName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      sha256: input.sha256,
    })
    .select("id, storage_path, original_name, mime_type")
    .single();

  if (error || !data) return null;
  return {
    id: data.id,
    storagePath: data.storage_path,
    originalName: data.original_name,
    mimeType: data.mime_type,
  };
}

export async function getAttachmentById(
  supabase: SupabaseClient,
  ownerId: string,
  id: string,
): Promise<Attachment | null> {
  const { data } = await supabase
    .from("attachments")
    .select("id, storage_path, original_name, mime_type")
    .eq("owner_id", ownerId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    storagePath: data.storage_path,
    originalName: data.original_name,
    mimeType: data.mime_type,
  };
}

export type ExportableAttachment = Attachment & {
  documentId: string;
  sizeBytes: number;
  sha256: string;
};

/** Every non-deleted attachment belonging to the given documents — used to build a full export. */
export async function listAttachmentsForDocuments(
  supabase: SupabaseClient,
  ownerId: string,
  documentIds: string[],
): Promise<ExportableAttachment[]> {
  if (documentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("attachments")
    .select("id, document_id, storage_path, original_name, mime_type, size_bytes, sha256")
    .eq("owner_id", ownerId)
    .in("document_id", documentIds)
    .is("deleted_at", null);
  if (error) throw new Error("내보낼 첨부파일을 불러오지 못했습니다.");

  return (data ?? []).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    storagePath: row.storage_path,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
  }));
}
