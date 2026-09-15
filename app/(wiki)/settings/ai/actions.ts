"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { deleteApiKey, saveApiKey, updateMonthlyTokenCap } from "@/features/ai/data";
import type { SaveApiKeyResult } from "@/features/ai/types";
import { requireOwner } from "@/lib/auth/require-owner";
import { getAiServerEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AiActionResult = { ok: true } | { ok: false; message: string };

const saveKeyMessages: Record<Extract<SaveApiKeyResult, { ok: false }>["reason"], string> = {
  unconfigured: "이 배포에는 AI 키 암호화 비밀이 설정되지 않아 키를 저장할 수 없습니다.",
  malformed: "Anthropic API 키 형식이 아닙니다. sk-ant-로 시작하는 키를 입력해주세요.",
  invalid: "Anthropic이 이 키를 거부했습니다. 키를 다시 확인해주세요.",
  unreachable: "Anthropic API에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
  unknown: "키를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.",
};

const capSchema = z.coerce.number().int().min(0).max(1_000_000_000);

export async function saveApiKeyAction(plainKey: string): Promise<AiActionResult> {
  const user = await requireOwner();
  const supabase = await createClient();
  const result = await saveApiKey(
    supabase,
    user.id,
    String(plainKey ?? ""),
    getAiServerEnv().encryptionSecret,
  );
  if (!result.ok) return { ok: false, message: saveKeyMessages[result.reason] };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteApiKeyAction(): Promise<AiActionResult> {
  const user = await requireOwner();
  const supabase = await createClient();
  const ok = await deleteApiKey(supabase, user.id);
  if (!ok) return { ok: false, message: "키를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요." };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateMonthlyTokenCapAction(value: unknown): Promise<AiActionResult> {
  const parsed = capSchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: "월 토큰 한도는 0 이상의 정수여야 합니다." };

  const user = await requireOwner();
  const supabase = await createClient();
  const ok = await updateMonthlyTokenCap(supabase, user.id, parsed.data);
  if (!ok) return { ok: false, message: "한도를 저장하지 못했습니다. 잠시 후 다시 시도해주세요." };
  revalidatePath("/settings");
  return { ok: true };
}
