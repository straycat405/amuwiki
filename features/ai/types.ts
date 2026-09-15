import { type TokenUsage } from "@/lib/ai/pricing";
import type { AiProviderId } from "@/lib/ai/provider";

export type AiSettings = {
  enabled: boolean;
  provider: AiProviderId;
  keyHint: string;
  monthlyTokenCap: number;
};

export type AiUsage = TokenUsage & { runCount: number };

export type AiRunKind = "query" | "ai_summary" | "draft_page" | "contradiction" | "ingest";
export type AiRunStatus = "succeeded" | "failed" | "refused" | "capped";

export type AiRunInput = {
  kind: AiRunKind;
  provider: AiProviderId;
  model: string;
  status: AiRunStatus;
  usage?: Partial<TokenUsage>;
};

export type SaveApiKeyResult =
  | { ok: true; keyHint: string }
  | { ok: false; reason: "malformed" | "invalid" | "unreachable" | "unconfigured" | "unknown" };
