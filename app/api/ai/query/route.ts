import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildQueryContext, QUERY_SYSTEM_PROMPT, renderQueryPrompt } from "@/features/ai/context";
import { getDecryptedApiKey, isUnderCap, recordRun } from "@/features/ai/data";
import { createAnthropicClient } from "@/lib/ai/client";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getAiServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(240),
  question: z.string().trim().min(1).max(2000),
  pageSlug: z.string().trim().min(1).max(240).nullable().optional(),
});

const MAX_OUTPUT_TOKENS = 4096;
const REFUSAL_NOTICE = "\n\n> 안전 정책에 따라 이 질문에는 답변하지 않았습니다.";

function upstreamMessage(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "저장된 API 키가 더 이상 유효하지 않습니다. 설정에서 키를 다시 등록해주세요.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Anthropic 요청 한도에 걸렸습니다. 잠시 후 다시 시도해주세요.";
  }
  if (error instanceof Anthropic.APIError) {
    const detail = (error.error as { error?: { message?: string } } | undefined)?.error?.message;
    return detail ? `Anthropic API 오류: ${detail}` : `Anthropic API 오류 (${error.status ?? "?"})`;
  }
  return "Anthropic API에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: "bad_request", message: "질문을 확인해주세요." }, { status: 400 });
  }

  const { supabase, user } = await requireApiUser();
  if (!user) {
    return NextResponse.json({ code: "unauthorized", message: "인증이 필요합니다." }, { status: 401 });
  }

  const env = getAiServerEnv();
  if (!env.encryptionSecret) {
    return NextResponse.json({ code: "unconfigured", message: "AI 기능이 설정되지 않았습니다." }, { status: 503 });
  }

  const apiKey = await getDecryptedApiKey(supabase, user.id, env.encryptionSecret);
  if (!apiKey) {
    return NextResponse.json({ code: "ai_disabled", message: "설정에서 API 키를 먼저 등록해주세요." }, { status: 403 });
  }

  if (!(await isUnderCap(supabase))) {
    await recordRun(supabase, user.id, { kind: "query", model: env.model, status: "capped" });
    return NextResponse.json({ code: "capped", message: "이번 달 토큰 한도에 도달했습니다." }, { status: 429 });
  }

  const context = await buildQueryContext(supabase, user.id, parsed.data.slug, parsed.data.pageSlug ?? null);
  if (!context) {
    return NextResponse.json({ code: "not_found", message: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const client = createAnthropicClient(apiKey);
  const stream = client.messages.stream({
    model: env.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: [{ type: "text", text: QUERY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: renderQueryPrompt(context, parsed.data.question) }],
  });

  // Buffer text until the response body exists so nothing emitted between
  // connect and start() is lost; upstream failures before connect become JSON.
  const encoder = new TextEncoder();
  const pendingText: string[] = [];
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  stream.on("text", (text) => {
    if (controllerRef) controllerRef.enqueue(encoder.encode(text));
    else pendingText.push(text);
  });

  try {
    await stream.emitted("connect");
  } catch (error) {
    await recordRun(supabase, user.id, { kind: "query", model: env.model, status: "failed" });
    return NextResponse.json({ code: "upstream", message: upstreamMessage(error) }, { status: 502 });
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;
      for (const text of pendingText.splice(0)) controller.enqueue(encoder.encode(text));
      try {
        const final = await stream.finalMessage();
        const refused = final.stop_reason === "refusal";
        if (refused) controller.enqueue(encoder.encode(REFUSAL_NOTICE));
        await recordRun(supabase, user.id, {
          kind: "query",
          model: final.model,
          status: refused ? "refused" : "succeeded",
          usage: {
            inputTokens: final.usage.input_tokens,
            cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
            outputTokens: final.usage.output_tokens,
          },
        });
        controller.close();
      } catch (error) {
        await recordRun(supabase, user.id, { kind: "query", model: env.model, status: "failed" });
        controller.error(error);
      }
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Ai-Model": env.model,
    },
  });
}
