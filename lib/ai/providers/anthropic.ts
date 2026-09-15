import Anthropic from "@anthropic-ai/sdk";

import {
  type AiProvider,
  type AnswerRequest,
  type AnswerStream,
  type KeyVerification,
  ProviderError,
} from "@/lib/ai/provider";

function createClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 1 });
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", "Anthropic이 API 키를 거부했습니다.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ProviderError("rate_limit", "Anthropic 요청 한도에 걸렸습니다.");
  }
  if (error instanceof Anthropic.APIError) {
    const detail = (error.error as { error?: { message?: string } } | undefined)?.error?.message;
    return new ProviderError("api", detail ? `Anthropic API 오류: ${detail}` : `Anthropic API 오류 (${error.status ?? "?"})`);
  }
  return new ProviderError("network", "Anthropic API에 연결하지 못했습니다.");
}

async function verifyKey(apiKey: string): Promise<KeyVerification> {
  try {
    await createClient(apiKey).models.list({ limit: 1 });
    return "valid";
  } catch (error) {
    return toProviderError(error).kind === "auth" ? "invalid" : "unreachable";
  }
}

function streamAnswer(apiKey: string, request: AnswerRequest): AnswerStream {
  const stream = createClient(apiKey).messages.stream({
    model: request.model,
    max_tokens: request.maxOutputTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: request.effort },
    system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: request.prompt }],
  });

  const connected = stream.emitted("connect").then(
    () => undefined,
    (error) => {
      throw toProviderError(error);
    },
  );

  async function* text() {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }

  const final = stream.finalMessage().then(
    (message) => ({
      model: message.model,
      refused: message.stop_reason === "refusal",
      usage: {
        inputTokens: message.usage.input_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        outputTokens: message.usage.output_tokens,
      },
    }),
    (error) => {
      throw toProviderError(error);
    },
  );

  // Callers may only await one of these; keep the other from surfacing as unhandled.
  void connected.catch(() => undefined);
  void final.catch(() => undefined);

  return { connected, text: text(), final, abort: () => stream.abort() };
}

export const anthropicProvider: AiProvider = {
  id: "anthropic",
  label: "Anthropic",
  keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  keyPlaceholder: "sk-ant-…",
  verifyKey,
  streamAnswer,
};
