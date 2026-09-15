import { beforeEach, describe, expect, it, vi } from "vitest";

const aiData = vi.hoisted(() => ({
  getDecryptedApiKey: vi.fn(),
  isUnderCap: vi.fn(),
  recordRun: vi.fn(),
}));
const providers = vi.hoisted(() => ({ getAiProvider: vi.fn() }));

vi.mock("@/features/ai/data", () => aiData);
vi.mock("@/lib/ai/providers", () => providers);

import {
  estimateInputTokens,
  generateSummaries,
  listSummaryCandidates,
  normalizeSummary,
  renderSummaryPrompt,
  SUMMARY_SYSTEM_PROMPT,
} from "@/features/ai/summarize";
import type { AnswerStream } from "@/lib/ai/provider";

type QueryResult = { data: unknown; error: unknown };

function fakeSupabase(results: QueryResult[]) {
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["from", "select", "eq", "in", "upsert"]) builder[method] = vi.fn(chain);
  builder.then = (resolve: (value: QueryResult) => void) =>
    Promise.resolve(queue.shift() ?? { data: null, error: null }).then(resolve);
  return { client: builder as never, builder };
}

function fakeAnswer(chunks: string[], refused = false): AnswerStream {
  return {
    connected: Promise.resolve(),
    text: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    final: Promise.resolve({
      model: "gpt-5-mini-x",
      refused,
      usage: { inputTokens: 100, cacheReadTokens: 0, outputTokens: 20 },
    }),
    abort: () => undefined,
  };
}

const env = { models: { anthropic: "claude-opus-5", openai: "gpt-5-mini" }, encryptionSecret: "s".repeat(32) };

beforeEach(() => {
  vi.clearAllMocks();
  aiData.getDecryptedApiKey.mockResolvedValue({ provider: "openai", apiKey: "sk-test" });
  aiData.isUnderCap.mockResolvedValue(true);
  aiData.recordRun.mockResolvedValue("run-1");
});

describe("listSummaryCandidates", () => {
  it("skips documents that already have an ai_summary and empty bodies", async () => {
    const { client } = fakeSupabase([
      { data: [{ document_id: "d2" }], error: null },
      {
        data: [
          { id: "d1", title: "A", body_markdown: "![img](a.png)" },
          { id: "d2", title: "B", body_markdown: "text" },
          { id: "d3", title: "C", body_markdown: "   " },
        ],
        error: null,
      },
    ]);
    await expect(listSummaryCandidates(client, "u", ["d1", "d2", "d3"])).resolves.toEqual([
      { documentId: "d1", title: "A", bodyMarkdown: "![img](a.png)" },
    ]);
  });

  it("returns nothing for an empty id list without querying", async () => {
    const { client, builder } = fakeSupabase([]);
    await expect(listSummaryCandidates(client, "u", [])).resolves.toEqual([]);
    expect(builder.from).not.toHaveBeenCalled();
  });
});

describe("prompt helpers", () => {
  it("wraps the body with the title and escapes quotes", () => {
    expect(renderSummaryPrompt({ documentId: "d", title: 'A "B"', bodyMarkdown: "본문" })).toBe(
      '<document title="A &quot;B&quot;">\n본문\n</document>',
    );
    expect(SUMMARY_SYSTEM_PROMPT).not.toContain("<document");
  });

  it("estimates tokens from body length plus overhead", () => {
    expect(estimateInputTokens([{ documentId: "d", title: "t", bodyMarkdown: "x".repeat(100) }])).toBe(250);
  });

  it("flattens whitespace, strips wrapping quotes, and caps at 300 chars", () => {
    expect(normalizeSummary('  "두 줄\n요약"  ')).toBe("두 줄 요약");
    expect(normalizeSummary("가".repeat(400))).toHaveLength(300);
  });
});

describe("generateSummaries", () => {
  const candidate = { documentId: "d1", title: "A", bodyMarkdown: "본문" };

  it("stores a normalized ai_summary suggestion linked to the run", async () => {
    providers.getAiProvider.mockReturnValue({
      id: "openai",
      streamAnswer: vi.fn(() => fakeAnswer(["이미지만 ", "있는 문서.\n"])),
    });
    const { client, builder } = fakeSupabase([{ data: null, error: null }]);

    await expect(generateSummaries(client, "u", env, [candidate])).resolves.toEqual({
      generated: 1,
      failed: 0,
      capped: false,
    });
    expect(aiData.recordRun).toHaveBeenCalledWith(client, "u", {
      kind: "ai_summary",
      provider: "openai",
      model: "gpt-5-mini-x",
      status: "succeeded",
      usage: { inputTokens: 100, cacheReadTokens: 0, outputTokens: 20 },
    });
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        owner_id: "u",
        kind: "ai_summary",
        document_id: "d1",
        target_key: "",
        payload: { summary: "이미지만 있는 문서." },
        run_id: "run-1",
        status: "pending",
      },
      { onConflict: "owner_id,kind,document_id,target_key" },
    );
  });

  it("records refusals and empty answers as failures without storing", async () => {
    providers.getAiProvider.mockReturnValue({ id: "openai", streamAnswer: vi.fn(() => fakeAnswer([], true)) });
    const { client, builder } = fakeSupabase([]);
    await expect(generateSummaries(client, "u", env, [candidate])).resolves.toEqual({
      generated: 0,
      failed: 1,
      capped: false,
    });
    expect(aiData.recordRun).toHaveBeenCalledWith(client, "u", expect.objectContaining({ status: "refused" }));
    expect(builder.upsert).not.toHaveBeenCalled();
  });

  it("stops at the monthly cap and records the capped run", async () => {
    aiData.isUnderCap.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    providers.getAiProvider.mockReturnValue({ id: "openai", streamAnswer: vi.fn(() => fakeAnswer(["요약"])) });
    const { client } = fakeSupabase([{ data: null, error: null }]);
    await expect(
      generateSummaries(client, "u", env, [candidate, { ...candidate, documentId: "d2" }]),
    ).resolves.toEqual({ generated: 1, failed: 0, capped: true });
    expect(aiData.recordRun).toHaveBeenLastCalledWith(client, "u", expect.objectContaining({ status: "capped" }));
  });

  it("does nothing without a stored key", async () => {
    aiData.getDecryptedApiKey.mockResolvedValue(null);
    const { client } = fakeSupabase([]);
    await expect(generateSummaries(client, "u", env, [candidate])).resolves.toEqual({
      generated: 0,
      failed: 0,
      capped: false,
    });
  });
});
