import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AiRunInput,
  AiSettings,
  AiUsage,
  SaveApiKeyResult,
} from "@/features/ai/types";
import { apiKeyHint, decryptApiKey, encryptApiKey } from "@/lib/ai/crypto";
import type { AiProviderId, KeyVerification } from "@/lib/ai/provider";
import { getAiProvider } from "@/lib/ai/providers";

const defaultSettings: AiSettings = {
  enabled: false,
  provider: "anthropic",
  keyHint: "",
  monthlyTokenCap: 0,
};

export async function getAiSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiSettings> {
  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("enabled, provider, key_hint, monthly_token_cap")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("AI 설정을 불러오지 못했습니다.");
  if (!data) return defaultSettings;
  return {
    enabled: data.enabled,
    provider: data.provider,
    keyHint: data.key_hint,
    monthlyTokenCap: data.monthly_token_cap,
  };
}

/** Returns the caller's provider and plaintext key for a server-side call, or null when AI is off. */
export async function getDecryptedApiKey(
  supabase: SupabaseClient,
  userId: string,
  encryptionSecret: string,
): Promise<{ provider: AiProviderId; apiKey: string } | null> {
  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("enabled, provider, encrypted_key")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("AI 설정을 불러오지 못했습니다.");
  if (!data?.enabled || !data.encrypted_key) return null;
  return { provider: data.provider, apiKey: decryptApiKey(data.encrypted_key, encryptionSecret) };
}

export async function saveApiKey(
  supabase: SupabaseClient,
  userId: string,
  provider: AiProviderId,
  plainKey: string,
  encryptionSecret: string | null,
  verify: (key: string) => Promise<KeyVerification> = getAiProvider(provider).verifyKey,
): Promise<SaveApiKeyResult> {
  if (!encryptionSecret) return { ok: false, reason: "unconfigured" };
  const key = plainKey.trim();
  if (!getAiProvider(provider).keyPattern.test(key)) return { ok: false, reason: "malformed" };

  const verification = await verify(key);
  if (verification !== "valid") return { ok: false, reason: verification };

  const keyHint = apiKeyHint(key);
  const { error } = await supabase.from("user_ai_settings").upsert(
    {
      user_id: userId,
      enabled: true,
      provider,
      encrypted_key: encryptApiKey(key, encryptionSecret),
      key_hint: keyHint,
    },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, reason: "unknown" };
  return { ok: true, keyHint };
}

export async function deleteApiKey(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("user_ai_settings")
    .update({ enabled: false, encrypted_key: null, key_hint: "" })
    .eq("user_id", userId);
  return !error;
}

export async function updateMonthlyTokenCap(
  supabase: SupabaseClient,
  userId: string,
  monthlyTokenCap: number,
): Promise<boolean> {
  const { error } = await supabase
    .from("user_ai_settings")
    .upsert({ user_id: userId, monthly_token_cap: monthlyTokenCap }, { onConflict: "user_id" });
  return !error;
}

export async function getMonthlyUsage(supabase: SupabaseClient): Promise<AiUsage> {
  const { data, error } = await supabase.rpc("ai_usage_month").single();
  if (error || !data) throw new Error("AI 사용량을 불러오지 못했습니다.");
  const row = data as {
    run_count: number;
    input_tokens: number | string;
    cache_read_tokens: number | string;
    output_tokens: number | string;
  };
  return {
    runCount: row.run_count,
    inputTokens: Number(row.input_tokens),
    cacheReadTokens: Number(row.cache_read_tokens),
    outputTokens: Number(row.output_tokens),
  };
}

export async function isUnderCap(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("ai_under_cap");
  if (error) throw new Error("AI 사용 한도를 확인하지 못했습니다.");
  return data === true;
}

export async function recordRun(
  supabase: SupabaseClient,
  ownerId: string,
  run: AiRunInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_runs")
    .insert({
      owner_id: ownerId,
      kind: run.kind,
      provider: run.provider,
      model: run.model,
      status: run.status,
      input_tokens: run.usage?.inputTokens ?? 0,
      cache_read_tokens: run.usage?.cacheReadTokens ?? 0,
      output_tokens: run.usage?.outputTokens ?? 0,
    })
    .select("id")
    .single();
  if (error) return null;
  return data.id;
}
