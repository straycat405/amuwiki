import { beforeEach, describe, expect, it, vi } from "vitest";

const documentsData = vi.hoisted(() => ({
  getDocumentById: vi.fn(),
  updateDocument: vi.fn(),
  linkTargetsForStorage: vi.fn(() => [{ normalized_title: "개념", title: "개념", first_position: 0 }]),
}));

vi.mock("@/features/documents/data", () => documentsData);

import {
  applySuggestion,
  dismissSuggestion,
  listPendingSuggestions,
  refreshSuggestions,
  reindexAllDocuments,
} from "@/features/lint/data";

type QueryResult = { data: unknown; error: unknown };

/** Minimal chainable stub: every builder call returns itself; awaiting resolves the queued result. */
function fakeSupabase(results: QueryResult[], rpc = vi.fn()) {
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["from", "select", "eq", "is", "in", "order", "update", "maybeSingle"]) {
    builder[method] = vi.fn(chain);
  }
  builder.then = (resolve: (value: QueryResult) => void) =>
    Promise.resolve(queue.shift() ?? { data: null, error: null }).then(resolve);
  return { client: { ...builder, rpc } as never, builder, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshSuggestions", () => {
  it("returns the pending count from the RPC", async () => {
    const { client } = fakeSupabase([], vi.fn().mockResolvedValue({ data: 4, error: null }));
    await expect(refreshSuggestions(client)).resolves.toBe(4);
  });

  it("throws on RPC failure", async () => {
    const { client } = fakeSupabase([], vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } }));
    await expect(refreshSuggestions(client)).rejects.toThrow();
  });
});

describe("reindexAllDocuments", () => {
  it("reindexes each active document and returns the count", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const { client } = fakeSupabase(
      [{ data: [{ id: "d1", body_markdown: "[[개념]]" }, { id: "d2", body_markdown: "" }], error: null }],
      rpc,
    );
    await expect(reindexAllDocuments(client, "owner")).resolves.toBe(2);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("reindex_document_links", {
      p_document_id: "d1",
      p_link_targets: [{ normalized_title: "개념", title: "개념", first_position: 0 }],
    });
  });

  it("stops and throws when a reindex call fails", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "P0002" } });
    const { client } = fakeSupabase(
      [{ data: [{ id: "d1", body_markdown: "" }, { id: "d2", body_markdown: "" }, { id: "d3", body_markdown: "" }], error: null }],
      rpc,
    );
    await expect(reindexAllDocuments(client, "owner")).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("listPendingSuggestions", () => {
  it("returns an empty list without deriving summaries", async () => {
    const { client, builder } = fakeSupabase([{ data: [], error: null }]);
    await expect(listPendingSuggestions(client, "owner")).resolves.toEqual([]);
    expect(builder.from).toHaveBeenCalledTimes(1);
  });

  it("maps rows, derives proposed summaries, and orders by kind", async () => {
    const { client } = fakeSupabase([
      {
        data: [
          {
            id: "s-orphan",
            kind: "orphan",
            document_id: "d1",
            target_key: "",
            payload: {},
            created_at: "2026-09-15T00:00:00Z",
            documents: { slug: "외톨이", title: "외톨이" },
          },
          {
            id: "s-summary",
            kind: "fill_summary",
            document_id: "d2",
            target_key: "",
            payload: {},
            created_at: "2026-09-15T00:00:01Z",
            documents: { slug: "요약-없음", title: "요약 없음" },
          },
        ],
        error: null,
      },
      { data: [{ id: "d2", body_markdown: "# 제목\n\n첫 문단." }], error: null },
    ]);

    const result = await listPendingSuggestions(client, "owner");
    expect(result.map((s) => s.kind)).toEqual(["fill_summary", "orphan"]);
    expect(result[0]).toMatchObject({
      id: "s-summary",
      documentSlug: "요약-없음",
      documentTitle: "요약 없음",
      proposedSummary: "첫 문단.",
    });
    expect(result[1]).not.toHaveProperty("proposedSummary");
  });

  it("throws when the query fails", async () => {
    const { client } = fakeSupabase([{ data: null, error: { message: "boom" } }]);
    await expect(listPendingSuggestions(client, "owner")).rejects.toThrow();
  });
});

describe("dismissSuggestion", () => {
  it("reports not-found when nothing was pending", async () => {
    const { client } = fakeSupabase([{ data: [], error: null }]);
    await expect(dismissSuggestion(client, "owner", "s1")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("succeeds when a pending row was updated", async () => {
    const { client } = fakeSupabase([{ data: [{ id: "s1" }], error: null }]);
    await expect(dismissSuggestion(client, "owner", "s1")).resolves.toEqual({ ok: true });
  });
});

describe("applySuggestion", () => {
  const document = {
    id: "d1",
    title: "원본",
    summary: "",
    body_markdown: "[[개념]] 첫 문단.",
    frontmatter: { tags: ["a"] },
    version: 3,
  };

  it("reindexes links for forward_link without touching the document", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const { client } = fakeSupabase(
      [
        { data: { kind: "forward_link", document_id: "d1" }, error: null },
        { data: [{ id: "s1" }], error: null },
      ],
      rpc,
    );
    documentsData.getDocumentById.mockResolvedValue(document);

    await expect(applySuggestion(client, "owner", "s1")).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("reindex_document_links", {
      p_document_id: "d1",
      p_link_targets: [{ normalized_title: "개념", title: "개념", first_position: 0 }],
    });
    expect(documentsData.updateDocument).not.toHaveBeenCalled();
  });

  it("saves the derived summary through the normal update path and keeps frontmatter", async () => {
    const { client } = fakeSupabase([
      { data: { kind: "fill_summary", document_id: "d1" }, error: null },
      { data: [{ id: "s1" }], error: null },
    ]);
    documentsData.getDocumentById.mockResolvedValue(document);
    documentsData.updateDocument.mockResolvedValue({ ok: true, version: 4 });

    await expect(applySuggestion(client, "owner", "s1")).resolves.toEqual({ ok: true });
    expect(documentsData.updateDocument).toHaveBeenCalledWith(
      client,
      "d1",
      { title: "원본", summary: "개념 첫 문단.", bodyMarkdown: "[[개념]] 첫 문단.", version: 3 },
      { tags: ["a"] },
    );
  });

  it("saves an AI-generated summary from the suggestion payload", async () => {
    const { client } = fakeSupabase([
      { data: { kind: "ai_summary", document_id: "d1", payload: { summary: "  AI 요약  " } }, error: null },
      { data: [{ id: "s1" }], error: null },
    ]);
    documentsData.getDocumentById.mockResolvedValue(document);
    documentsData.updateDocument.mockResolvedValue({ ok: true, version: 4 });

    await expect(applySuggestion(client, "owner", "s1")).resolves.toEqual({ ok: true });
    expect(documentsData.updateDocument).toHaveBeenCalledWith(
      client,
      "d1",
      expect.objectContaining({ summary: "AI 요약" }),
      { tags: ["a"] },
    );
  });

  it("hides fill_summary rows for documents that already have an AI summary", async () => {
    const base = { target_key: "", payload: {}, created_at: "2026-09-15T00:00:00Z", documents: { slug: "s", title: "T" } };
    const { client } = fakeSupabase([
      {
        data: [
          { ...base, id: "fill", kind: "fill_summary", document_id: "d1" },
          { ...base, id: "ai", kind: "ai_summary", document_id: "d1", payload: { summary: "x" } },
          { ...base, id: "fill2", kind: "fill_summary", document_id: "d2" },
        ],
        error: null,
      },
      { data: [{ id: "d2", body_markdown: "본문." }], error: null },
    ]);
    const result = await listPendingSuggestions(client, "owner");
    expect(result.map((s) => s.id)).toEqual(["ai", "fill2"]);
  });

  it("surfaces version conflicts from the save path", async () => {
    const { client } = fakeSupabase([
      { data: { kind: "fill_summary", document_id: "d1" }, error: null },
    ]);
    documentsData.getDocumentById.mockResolvedValue(document);
    documentsData.updateDocument.mockResolvedValue({ ok: false, reason: "conflict" });

    await expect(applySuggestion(client, "owner", "s1")).resolves.toEqual({
      ok: false,
      reason: "conflict",
    });
  });

  it("refuses to save an empty derived summary", async () => {
    const { client } = fakeSupabase([
      { data: { kind: "fill_summary", document_id: "d1" }, error: null },
    ]);
    documentsData.getDocumentById.mockResolvedValue({ ...document, body_markdown: "# 제목만" });

    await expect(applySuggestion(client, "owner", "s1")).resolves.toEqual({
      ok: false,
      reason: "empty",
    });
    expect(documentsData.updateDocument).not.toHaveBeenCalled();
  });

  it("rejects kinds that have no automatic apply", async () => {
    const { client } = fakeSupabase([
      { data: { kind: "broken_link", document_id: "d1" }, error: null },
    ]);
    documentsData.getDocumentById.mockResolvedValue(document);

    await expect(applySuggestion(client, "owner", "s1")).resolves.toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("returns not-found when the suggestion is no longer pending", async () => {
    const { client } = fakeSupabase([{ data: null, error: null }]);
    await expect(applySuggestion(client, "owner", "s1")).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(documentsData.getDocumentById).not.toHaveBeenCalled();
  });
});
