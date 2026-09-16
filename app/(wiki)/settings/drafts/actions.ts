"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { deleteStaleDraftDocuments } from "@/features/documents/cleanup";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export type DeleteStaleDraftsResult =
  | { ok: true; deletedDocuments: number; failedCount: number }
  | { ok: false; message: string };

const documentIdsSchema = z.array(z.uuid()).min(1);

export async function deleteStaleDraftsAction(
  documentIds: unknown,
): Promise<DeleteStaleDraftsResult> {
  const parsed = documentIdsSchema.safeParse(documentIds);
  if (!parsed.success) return { ok: false, message: "정리할 문서를 선택해주세요." };

  const user = await requireOwner();
  const supabase = await createClient();
  try {
    const result = await deleteStaleDraftDocuments(supabase, user.id, parsed.data);
    revalidatePath("/settings/drafts");
    return {
      ok: true,
      deletedDocuments: result.deletedDocuments,
      failedCount: result.failedDocumentIds.length,
    };
  } catch {
    return { ok: false, message: "정리하지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
}
