import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildQueryContext, QUERY_SYSTEM_PROMPT, renderQueryPrompt } from "@/features/ai/context";
import { getDecryptedApiKey, isUnderCap, recordRun } from "@/features/ai/data";
import { ProviderError } from "@/lib/ai/provider";
import { getAiProvider } from "@/lib/ai/providers";
import { requireApiUser } from "@/lib/auth/api-auth";
import { getAiServerEnv } from "@/lib/env";

export const runtime = "nodejs";

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(240),
  question: z.string().trim().min(1).max(2000),
  pageSlug: z.string().trim().min(1).max(240).nullable().optional(),
});

// Reasoning/thinking tokens count against this on both providers.
const MAX_OUTPUT_TOKENS = 8000;
const REFUSAL_NOTICE = "\n\n> 안전 정책에 따라 이 질문에는 답변하지 않았습니다.";

function upstreamMessage(error: unknown): string {
  if (error instanceof ProviderError) {
    if (error.kind === "auth") {
      return `${error.message} 설정에서 키를 다시 등록해주세요.`;
    }
    return error.message;
  }
  return "AI 공급자에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.";
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

  const credentials = await getDecryptedApiKey(supabase, user.id, env.encryptionSecret);
  if (!credentials) {
    return NextResponse.json({ code: "ai_disabled", message: "설정에서 API 키를 먼저 등록해주세요." }, { status: 403 });
  }
  const provider = getAiProvider(credentials.provider);
  const model = env.models[credentials.provider];
  const runBase = { kind: "query", provider: provider.id, model } as const;

  if (!(await isUnderCap(supabase))) {
    await recordRun(supabase, user.id, { ...runBase, status: "capped" });
    return NextResponse.json({ code: "capped", message: "이번 달 토큰 한도에 도달했습니다." }, { status: 429 });
  }

  const context = await buildQueryContext(supabase, user.id, parsed.data.slug, parsed.data.pageSlug ?? null);
  if (!context) {
    return NextResponse.json({ code: "not_found", message: "문서를 찾을 수 없습니다." }, { status: 404 });
  }

  const answer = provider.streamAnswer(credentials.apiKey, {
    model,
    system: QUERY_SYSTEM_PROMPT,
    prompt: renderQueryPrompt(context, parsed.data.question),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    // Grounded Q&A over a short context; medium reasoning on gpt-5-mini spent
    // ~1,200 reasoning tokens and ~25s before the first visible byte.
    effort: "low",
  });

  try {
    await answer.connected;
  } catch (error) {
    await recordRun(supabase, user.id, { ...runBase, status: "failed" });
    return NextResponse.json({ code: "upstream", message: upstreamMessage(error) }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of answer.text) controller.enqueue(encoder.encode(text));
        const final = await answer.final;
        if (final.refused) controller.enqueue(encoder.encode(REFUSAL_NOTICE));
        await recordRun(supabase, user.id, {
          ...runBase,
          model: final.model,
          status: final.refused ? "refused" : "succeeded",
          usage: final.usage,
        });
        controller.close();
      } catch (error) {
        await recordRun(supabase, user.id, { ...runBase, status: "failed" });
        controller.error(error);
      }
    },
    cancel() {
      answer.abort();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Ai-Model": model,
    },
  });
}
