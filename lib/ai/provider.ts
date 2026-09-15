import type { TokenUsage } from "@/lib/ai/pricing";

export const aiProviderIds = ["anthropic", "openai"] as const;
export type AiProviderId = (typeof aiProviderIds)[number];

export type KeyVerification = "valid" | "invalid" | "unreachable";

export type AnswerEffort = "low" | "medium" | "high";

export type AnswerRequest = {
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  effort: AnswerEffort;
};

export type AnswerFinal = {
  model: string;
  refused: boolean;
  usage: TokenUsage;
};

export type AnswerStream = {
  /** Resolves once the upstream accepted the request; rejects with ProviderError before any text. */
  connected: Promise<void>;
  text: AsyncIterable<string>;
  final: Promise<AnswerFinal>;
  abort(): void;
};

export type ProviderErrorKind = "auth" | "rate_limit" | "api" | "network";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  constructor(kind: ProviderErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
  }
}

export type AiProvider = {
  id: AiProviderId;
  label: string;
  keyPattern: RegExp;
  keyPlaceholder: string;
  verifyKey(apiKey: string): Promise<KeyVerification>;
  streamAnswer(apiKey: string, request: AnswerRequest): AnswerStream;
};

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (aiProviderIds as readonly string[]).includes(value);
}
