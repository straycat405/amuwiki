"use server";

import { revalidatePath } from "next/cache";

import { applySuggestion, dismissSuggestion, refreshSuggestions } from "@/features/lint/data";
import type { SuggestionActionResult } from "@/features/lint/types";
import { requireOwner } from "@/lib/auth/require-owner";
import { createClient } from "@/lib/supabase/server";

export type LintActionResult = { ok: true } | { ok: false; message: string };

const failureMessages: Record<Extract<SuggestionActionResult, { ok: false }>["reason"], string> = {
  "not-found": "제안이 이미 처리됐거나 문서를 찾을 수 없습니다.",
  conflict: "문서가 다른 곳에서 수정됐습니다. 목록을 새로고침한 뒤 다시 시도해주세요.",
  empty: "본문에서 요약을 만들 수 없습니다. 문서를 열어 직접 입력해주세요.",
  unsupported: "이 제안은 자동으로 적용할 수 없습니다.",
  unknown: "제안을 적용하지 못했습니다. 잠시 후 다시 시도해주세요.",
};

function toActionResult(result: SuggestionActionResult): LintActionResult {
  return result.ok ? { ok: true } : { ok: false, message: failureMessages[result.reason] };
}

export async function refreshSuggestionsAction(): Promise<LintActionResult> {
  await requireOwner();
  const supabase = await createClient();
  try {
    await refreshSuggestions(supabase);
  } catch {
    return { ok: false, message: "정리 제안을 갱신하지 못했습니다." };
  }
  revalidatePath("/settings/lint");
  return { ok: true };
}

export async function applySuggestionAction(suggestionId: string): Promise<LintActionResult> {
  const user = await requireOwner();
  const supabase = await createClient();
  let result: SuggestionActionResult;
  try {
    result = await applySuggestion(supabase, user.id, suggestionId);
  } catch {
    return { ok: false, message: failureMessages.unknown };
  }
  if (result.ok) revalidatePath("/", "layout");
  return toActionResult(result);
}

export async function dismissSuggestionAction(suggestionId: string): Promise<LintActionResult> {
  const user = await requireOwner();
  const supabase = await createClient();
  let result: SuggestionActionResult;
  try {
    result = await dismissSuggestion(supabase, user.id, suggestionId);
  } catch {
    return { ok: false, message: failureMessages.unknown };
  }
  if (result.ok) revalidatePath("/settings/lint");
  return toActionResult(result);
}
