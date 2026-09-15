import { describe, expect, it, vi } from "vitest";

import {
  buildQueryContext,
  MAX_RELATED_DOCUMENTS,
  QUERY_SYSTEM_PROMPT,
  renderQueryPrompt,
} from "@/features/ai/context";

type QueryResult = { data: unknown; error: unknown };

function fakeSupabase(results: QueryResult[]) {
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["from", "select", "eq", "is", "in", "order", "maybeSingle"]) {
    builder[method] = vi.fn(chain);
  }
  builder.then = (resolve: (value: QueryResult) => void) =>
    Promise.resolve(queue.shift() ?? { data: null, error: null }).then(resolve);
  return builder as never;
}

const primary = { id: "p", slug: "문명-6", title: "문명 6", summary: "전략 게임", body_markdown: "본문 [[과학 승리]]" };

describe("buildQueryContext", () => {
  it("returns null for an unknown or inactive document", async () => {
    await expect(buildQueryContext(fakeSupabase([{ data: null, error: null }]), "u", "x", null)).resolves.toBeNull();
  });

  it("orders outgoing links before backlinks, dedupes, caps at the limit, and derives missing summaries", async () => {
    const outgoing = Array.from({ length: 4 }, (_, i) => ({ target_document_id: `o${i}`, first_position: i }));
    const incoming = [
      { source_document_id: "o1", occurrence_count: 9 },
      { source_document_id: "b0", occurrence_count: 3 },
      { source_document_id: "b1", occurrence_count: 1 },
    ];
    const rows = [
      ...outgoing.map((l, i) => ({ id: l.target_document_id, slug: `o${i}`, title: `나가는 ${i}`, summary: i === 0 ? "" : `요약 ${i}`, body_markdown: "# 제목\n\n파생된 첫 문단." })),
      { id: "b0", slug: "b0", title: "들어오는 0", summary: "백링크 요약", body_markdown: "" },
    ];
    const supabase = fakeSupabase([
      { data: primary, error: null },
      { data: outgoing, error: null },
      { data: incoming, error: null },
      { data: rows, error: null },
      { data: { title: "읽던 문서" }, error: null },
    ]);

    const context = await buildQueryContext(supabase, "u", "문명-6", "읽던-문서");
    expect(context?.primary).toMatchObject({ slug: "문명-6", title: "문명 6", bodyMarkdown: "본문 [[과학 승리]]" });
    expect(context?.related).toHaveLength(MAX_RELATED_DOCUMENTS);
    expect(context?.related.map((d) => d.title)).toEqual(["나가는 0", "나가는 1", "나가는 2", "나가는 3", "들어오는 0"]);
    expect(context?.related[0]).toMatchObject({ relation: "outgoing", summary: "파생된 첫 문단." });
    expect(context?.related[4]).toMatchObject({ relation: "backlink", summary: "백링크 요약" });
    expect(context?.pageTitle).toBe("읽던 문서");
  });

  it("skips the page lookup when the card is the page itself", async () => {
    const supabase = fakeSupabase([
      { data: primary, error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const context = await buildQueryContext(supabase, "u", "문명-6", "문명-6");
    expect(context?.related).toEqual([]);
    expect(context?.pageTitle).toBeNull();
  });
});

describe("renderQueryPrompt", () => {
  it("wraps document, related summaries, reading context, and question in tags", () => {
    const prompt = renderQueryPrompt(
      {
        primary: { id: "p", slug: "s", title: 'A "quoted" <title>', summary: "요약", bodyMarkdown: "본문" },
        related: [
          { title: "B", summary: "B 요약", relation: "outgoing" },
          { title: "C", summary: "", relation: "backlink" },
        ],
        pageTitle: "D",
      },
      "  질문?  ",
    );
    expect(prompt).toContain('<document title="A &quot;quoted&quot; &lt;title>">');
    expect(prompt).toContain("요약: 요약\n본문\n</document>");
    expect(prompt).toContain("- [[B]] (이 문서가 링크함): B 요약");
    expect(prompt).toContain("- [[C]] (이 문서를 링크함): (요약 없음)");
    expect(prompt).toContain("[[D]] 문서를 읽다가");
    expect(prompt.endsWith("<question>질문?</question>")).toBe(true);
  });

  it("keeps the system prompt free of per-request content so it can be cached", () => {
    expect(QUERY_SYSTEM_PROMPT).not.toMatch(/\{|\$\{|<document/);
  });
});
