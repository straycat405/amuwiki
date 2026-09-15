export type TokenUsage = {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
};

type Rate = { input: number; output: number };

// USD per 1M tokens, first-party API list prices. Cached input bills at a
// provider-specific fraction of the input rate.
const ratesPerMillion: Record<string, Rate & { cacheFactor: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheFactor: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheFactor: 0.1 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheFactor: 0.1 },
  "gpt-5": { input: 1.25, output: 10, cacheFactor: 0.1 },
  "gpt-5-mini": { input: 0.25, output: 2, cacheFactor: 0.1 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cacheFactor: 0.1 },
};

export function estimateCostUsd(usage: TokenUsage, model: string): number | null {
  const rate = ratesPerMillion[model];
  if (!rate) return null;
  const input = usage.inputTokens * rate.input;
  const cached = usage.cacheReadTokens * rate.input * rate.cacheFactor;
  const output = usage.outputTokens * rate.output;
  return (input + cached + output) / 1_000_000;
}
