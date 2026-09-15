import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

import { ProviderError } from "@/lib/ai/provider";
import { getAiProvider, listAiProviders } from "@/lib/ai/providers";
import { toProviderError as anthropicError } from "@/lib/ai/providers/anthropic";
import { collectAnswer, toProviderError as openaiError } from "@/lib/ai/providers/openai";

async function* events(list: Partial<ResponseStreamEvent>[]) {
  for (const event of list) yield event as ResponseStreamEvent;
}

async function drain(iterable: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
}

describe("provider registry", () => {
  it("exposes both providers with distinct key patterns", () => {
    expect(listAiProviders().map((p) => p.id).sort()).toEqual(["anthropic", "openai"]);
    expect(getAiProvider("anthropic").keyPattern.test("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(getAiProvider("openai").keyPattern.test("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")).toBe(true);
    expect(getAiProvider("anthropic").keyPattern.test("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe(false);
    expect(getAiProvider("openai").keyPattern.test("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe(true);
  });
});

describe("openai collectAnswer", () => {
  it("yields text deltas and reports usage from response.completed", async () => {
    let final: unknown = null;
    const chunks = await drain(
      collectAnswer(
        events([
          { type: "response.created" },
          { type: "response.output_text.delta", delta: "안녕" },
          { type: "response.output_text.delta", delta: "하세요" },
          {
            type: "response.completed",
            response: {
              model: "gpt-5-mini-2026-01-01",
              usage: { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 100 } },
            },
          } as unknown as ResponseStreamEvent,
        ]),
        "gpt-5-mini",
        (f) => (final = f),
      ),
    );
    expect(chunks).toEqual(["안녕", "하세요"]);
    expect(final).toEqual({
      model: "gpt-5-mini-2026-01-01",
      refused: false,
      usage: { inputTokens: 120, cacheReadTokens: 100, outputTokens: 30 },
    });
  });

  it("marks refusals from refusal deltas and content_filter incompletes", async () => {
    const finals: { refused: boolean }[] = [];
    await drain(
      collectAnswer(
        events([
          { type: "response.refusal.delta", delta: "no" },
          { type: "response.incomplete", response: { incomplete_details: { reason: "content_filter" }, usage: null } } as unknown as ResponseStreamEvent,
        ]),
        "gpt-5-mini",
        (f) => finals.push(f),
      ),
    );
    expect(finals[0]?.refused).toBe(true);
  });

  it("turns stream error events into ProviderError", async () => {
    await expect(
      drain(collectAnswer(events([{ type: "error", message: "boom" } as unknown as ResponseStreamEvent]), "m", () => undefined)),
    ).rejects.toMatchObject({ name: "ProviderError", kind: "api", message: "OpenAI API 오류: boom" });
  });
});

describe("error normalization", () => {
  it("maps SDK auth, rate-limit, api, and network errors", () => {
    const headers = new Headers();
    expect(anthropicError(new Anthropic.AuthenticationError(401, undefined, "x", headers)).kind).toBe("auth");
    expect(anthropicError(new Anthropic.RateLimitError(429, undefined, "x", headers)).kind).toBe("rate_limit");
    expect(
      anthropicError(new Anthropic.BadRequestError(400, { error: { message: "credit too low" } }, "x", headers)).message,
    ).toBe("Anthropic API 오류: credit too low");
    expect(anthropicError(new TypeError("fetch failed")).kind).toBe("network");

    expect(openaiError(new OpenAI.AuthenticationError(401, undefined, "x", headers)).kind).toBe("auth");
    expect(openaiError(new OpenAI.RateLimitError(429, undefined, "x", headers)).kind).toBe("rate_limit");
    expect(openaiError(new OpenAI.BadRequestError(400, { message: "insufficient_quota" }, "x", headers)).message).toBe(
      "OpenAI API 오류: insufficient_quota",
    );
    expect(openaiError(new ProviderError("api", "keep")).message).toBe("keep");
  });
});
