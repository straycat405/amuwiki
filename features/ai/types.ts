import type { TokenUsage } from "@/lib/ai/pricing";

export type AiSettings = {
  enabled: boolean;
  keyHint: string;
  monthlyTokenCap: number;
};

export type AiUsage = TokenUsage & { runCount: number };

export type AiRunKind = "query" | "ai_summary" | "draft_page" | "contradiction" | "ingest";
export type AiRunStatus = "succeeded" | "failed" | "refused" | "capped";

export type AiRunInput = {
  kind: AiRunKind;
  model: string;
  status: AiRunStatus;
  usage?: Partial<TokenUsage>;
};

export type SaveApiKeyResult =
  | { ok: true; keyHint: string }
  | { ok: false; reason: "malformed" | "invalid" | "unreachable" | "unconfigured" | "unknown" };
