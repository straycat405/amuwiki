import OpenAI from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";

import {
  type AiProvider,
  type AnswerFinal,
  type AnswerRequest,
  type AnswerStream,
  type KeyVerification,
  ProviderError,
} from "@/lib/ai/provider";

function createClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, maxRetries: 1 });
}

export function toProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    return new ProviderError("auth", "OpenAI가 API 키를 거부했습니다.");
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new ProviderError("rate_limit", "OpenAI 요청 한도 또는 크레딧 한도에 걸렸습니다.");
  }
  if (error instanceof OpenAI.APIError) {
    const detail = (error.error as { message?: string } | undefined)?.message;
    return new ProviderError("api", detail ? `OpenAI API 오류: ${detail}` : `OpenAI API 오류 (${error.status ?? "?"})`);
  }
  return new ProviderError("network", "OpenAI API에 연결하지 못했습니다.");
}

async function verifyKey(apiKey: string): Promise<KeyVerification> {
  try {
    await createClient(apiKey).models.list();
    return "valid";
  } catch (error) {
    return toProviderError(error).kind === "auth" ? "invalid" : "unreachable";
  }
}

/** Pure mapping from Responses stream events to text deltas and a final summary. */
export async function* collectAnswer(
  events: AsyncIterable<ResponseStreamEvent>,
  fallbackModel: string,
  onFinal: (final: AnswerFinal) => void,
): AsyncGenerator<string> {
  let refused = false;
  let final: AnswerFinal | null = null;

  for await (const event of events) {
    switch (event.type) {
      case "response.output_text.delta":
        yield event.delta;
        break;
      case "response.refusal.delta":
        refused = true;
        break;
      case "response.completed":
      case "response.incomplete": {
        const response = event.response;
        const usage = response.usage;
        if (event.type === "response.incomplete" && response.incomplete_details?.reason === "content_filter") {
          refused = true;
        }
        final = {
          model: response.model ?? fallbackModel,
          refused,
          usage: {
            inputTokens: usage?.input_tokens ?? 0,
            cacheReadTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
          },
        };
        break;
      }
      case "error":
        throw new ProviderError("api", `OpenAI API 오류: ${event.message}`);
      case "response.failed":
        throw new ProviderError("api", `OpenAI API 오류: ${event.response.error?.message ?? "failed"}`);
      default:
        break;
    }
  }

  onFinal(
    final ?? {
      model: fallbackModel,
      refused,
      usage: { inputTokens: 0, cacheReadTokens: 0, outputTokens: 0 },
    },
  );
}

function streamAnswer(apiKey: string, request: AnswerRequest): AnswerStream {
  const client = createClient(apiKey);
  const started = client.responses
    .create({
      model: request.model,
      instructions: request.system,
      input: request.prompt,
      stream: true,
      max_output_tokens: request.maxOutputTokens,
      reasoning: { effort: request.effort },
    })
    .catch((error) => {
      throw toProviderError(error);
    });

  let resolveFinal!: (final: AnswerFinal) => void;
  let rejectFinal!: (error: unknown) => void;
  const final = new Promise<AnswerFinal>((resolve, reject) => {
    resolveFinal = resolve;
    rejectFinal = reject;
  });

  async function* text() {
    try {
      const events = await started;
      yield* collectAnswer(events, request.model, resolveFinal);
    } catch (error) {
      const wrapped = toProviderError(error);
      rejectFinal(wrapped);
      throw wrapped;
    }
  }

  const connected = started.then(() => undefined);
  void connected.catch(() => undefined);
  void final.catch(() => undefined);

  return {
    connected,
    text: text(),
    final,
    abort: () => {
      void started.then((events) => events.controller.abort()).catch(() => undefined);
    },
  };
}

export const openaiProvider: AiProvider = {
  id: "openai",
  label: "OpenAI",
  keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
  keyPlaceholder: "sk-…",
  verifyKey,
  streamAnswer,
};
