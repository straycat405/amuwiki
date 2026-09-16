import type { SupabaseClient } from "@supabase/supabase-js";

import type { ImportItemKind, ImportItemStatus, ImportSourceKind } from "@/features/imports/types";

export const IMPORTS_BUCKET = "data-jobs";

/**
 * Supabase Storage rejects keys containing non-ASCII bytes (e.g. Korean filenames)
 * with "Invalid key", so uploaded/downloaded objects use this ASCII-safe encoding
 * of the original relative path instead of the raw filename.
 */
export function storageKeyFor(relativePath: string): string {
  return Buffer.from(relativePath, "utf8").toString("base64url");
}

export async function createImportJob(
  supabase: SupabaseClient,
  ownerId: string,
  storagePath: string,
  sourceKind: ImportSourceKind = "markdown-files",
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("import_jobs")
    .insert({
      owner_id: ownerId,
      source_kind: sourceKind,
      status: "analyzing",
      storage_path: storagePath,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return { id: data.id as string };
}

export async function updateImportJobStatus(
  supabase: SupabaseClient,
  jobId: string,
  status: string,
  stats?: Record<string, unknown>,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (stats) patch.stats = stats;
  await supabase.from("import_jobs").update(patch).eq("id", jobId);
}

export async function getImportJob(
  supabase: SupabaseClient,
  ownerId: string,
  jobId: string,
): Promise<{ id: string; storagePath: string; status: string } | null> {
  const { data } = await supabase
    .from("import_jobs")
    .select("id, storage_path, status")
    .eq("owner_id", ownerId)
    .eq("id", jobId)
    .maybeSingle();

  if (!data) return null;
  return { id: data.id, storagePath: data.storage_path, status: data.status };
}

export type NewImportItem = {
  relativePath: string;
  contentSha256: string;
  itemKind: ImportItemKind;
  detectedTitle: string;
  status: ImportItemStatus;
  warningCodes: string[];
};

export async function insertImportItems(
  supabase: SupabaseClient,
  jobId: string,
  items: NewImportItem[],
): Promise<{ id: string; relativePath: string }[]> {
  if (items.length === 0) return [];

  const { data, error } = await supabase
    .from("import_items")
    .insert(
      items.map((item) => ({
        job_id: jobId,
        relative_path: item.relativePath,
        content_sha256: item.contentSha256,
        item_kind: item.itemKind,
        detected_title: item.detectedTitle,
        status: item.status,
        warning_codes: item.warningCodes,
      })),
    )
    .select("id, relative_path");

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id, relativePath: row.relative_path }));
}

export type ImportItemRow = {
  id: string;
  relativePath: string;
  itemKind: ImportItemKind;
  detectedTitle: string;
  status: ImportItemStatus;
  warningCodes: string[];
};

export async function listImportItems(
  supabase: SupabaseClient,
  jobId: string,
): Promise<ImportItemRow[]> {
  const { data, error } = await supabase
    .from("import_items")
    .select("id, relative_path, item_kind, detected_title, status, warning_codes")
    .eq("job_id", jobId)
    .order("relative_path", { ascending: true });

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    relativePath: row.relative_path,
    itemKind: row.item_kind,
    detectedTitle: row.detected_title ?? row.relative_path,
    status: row.status,
    warningCodes: row.warning_codes ?? [],
  }));
}

export async function updateImportItem(
  supabase: SupabaseClient,
  itemId: string,
  patch: { status: ImportItemStatus; targetDocumentId?: string },
): Promise<void> {
  await supabase
    .from("import_items")
    .update({
      status: patch.status,
      target_document_id: patch.targetDocumentId ?? null,
    })
    .eq("id", itemId);
}
