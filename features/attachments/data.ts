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
