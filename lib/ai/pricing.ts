export type TokenUsage = {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
};

type Rate = { input: number; output: number };

// USD per 1M tokens, Anthropic first-party API. Cache reads bill at 10% of input.
const ratesPerMillion: Record<string, Rate> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const CACHE_READ_FACTOR = 0.1;

export function estimateCostUsd(usage: TokenUsage, model: string): number | null {
  const rate = ratesPerMillion[model];
  if (!rate) return null;
  const input = usage.inputTokens * rate.input;
  const cached = usage.cacheReadTokens * rate.input * CACHE_READ_FACTOR;
  const output = usage.outputTokens * rate.output;
  return (input + cached + output) / 1_000_000;
}
