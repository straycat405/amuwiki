"use server";

import { revalidatePath } from "next/cache";

import { updatePreferences } from "@/features/preferences/data";
import { preferencesPatchSchema } from "@/features/preferences/preferences";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export type UpdatePreferencesResult = { ok: true } | { ok: false; message: string };

export async function updatePreferencesAction(
  patch: unknown,
): Promise<UpdatePreferencesResult> {
  const parsed = preferencesPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, message: "설정 값이 올바르지 않습니다." };
  }

  const user = await requireOwner();
  const supabase = await createClient();
  const result = await updatePreferences(supabase, user.id, parsed.data);
  if (!result.ok) {
    return { ok: false, message: "설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
