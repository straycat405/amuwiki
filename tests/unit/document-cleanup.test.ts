import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteStaleDraftDocuments, listStaleDraftDocuments } from "@/features/documents/cleanup";

type QueryResult = { data: unknown; error: unknown };

/** Minimal chainable stub: every builder call returns itself; awaiting resolves the queued result. */
function fakeSupabase(results: QueryResult[], storageRemove = vi.fn().mockResolvedValue({ error: null })) {
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const method of ["from", "select", "eq", "lt", "in", "delete"]) {
    builder[method] = vi.fn(chain);
  }
  builder.then = (resolve: (value: QueryResult) => void) =>
    Promise.resolve(queue.shift() ?? { data: null, error: null }).then(resolve);

  const storage = { from: vi.fn(() => ({ remove: storageRemove })) };
  return { client: { ...builder, storage } as never, builder, storageRemove };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listStaleDraftDocuments", () => {
  it("excludes AI-answer drafts and aggregates attachment stats for the rest", async () => {
    const { client } = fakeSupabase([
      {
        data: [
          { id: "d1", title: "임시 문서", updated_at: "2026-01-01T00:00:00Z", frontmatter: {} },
          {
            id: "d2",
            title: "AI 답변 초안",
            updated_at: "2026-01-01T00:00:00Z",
            frontmatter: { ai: { kind: "query" } },
          },
        ],
        error: null,
      },
      {
        data: [
          { document_id: "d1", size_bytes: 100 },
          { document_id: "d1", size_bytes: 50 },
        ],
        error: null,
      },
    ]);

    const result = await listStaleDraftDocuments(client, "owner-1");

    expect(result).toEqual([
      { id: "d1", title: "임시 문서", updatedAt: "2026-01-01T00:00:00Z", attachmentCount: 2, totalBytes: 150 },
    ]);
  });

  it("returns an empty list without querying attachments when nothing is eligible", async () => {
    const { client, builder } = fakeSupabase([{ data: [], error: null }]);

    await expect(listStaleDraftDocuments(client, "owner-1")).resolves.toEqual([]);
    expect(builder.from).toHaveBeenCalledTimes(1);
  });

  it("throws when the documents query fails", async () => {
    const { client } = fakeSupabase([{ data: null, error: { code: "42501" } }]);
    await expect(listStaleDraftDocuments(client, "owner-1")).rejects.toThrow();
  });

  it("throws when the attachments query fails", async () => {
    const { client } = fakeSupabase([
      { data: [{ id: "d1", title: "임시 문서", updated_at: "2026-01-01T00:00:00Z", frontmatter: {} }], error: null },
      { data: null, error: { code: "42501" } },
    ]);
    await expect(listStaleDraftDocuments(client, "owner-1")).rejects.toThrow();
  });
});

describe("deleteStaleDraftDocuments", () => {
  it("returns a zero result without querying when given no ids", async () => {
    const { client, builder } = fakeSupabase([]);
    await expect(deleteStaleDraftDocuments(client, "owner-1", [])).resolves.toEqual({
      deletedDocuments: 0,
      deletedAttachments: 0,
      failedDocumentIds: [],
    });
    expect(builder.from).not.toHaveBeenCalled();
  });

  it("removes Storage objects before deleting each document row", async () => {
    const { client, storageRemove } = fakeSupabase([
      { data: [{ document_id: "d1", storage_path: "owner-1/d1/a.png" }], error: null },
      { data: [{ id: "d1" }], error: null },
    ]);

    const result = await deleteStaleDraftDocuments(client, "owner-1", ["d1"]);

    expect(storageRemove).toHaveBeenCalledWith(["owner-1/d1/a.png"]);
    expect(result).toEqual({ deletedDocuments: 1, deletedAttachments: 1, failedDocumentIds: [] });
  });

  it("keeps the document row when its Storage delete fails", async () => {
    const storageRemove = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const { client } = fakeSupabase(
      [{ data: [{ document_id: "d1", storage_path: "owner-1/d1/a.png" }], error: null }],
      storageRemove,
    );

    const result = await deleteStaleDraftDocuments(client, "owner-1", ["d1"]);

    expect(result).toEqual({ deletedDocuments: 0, deletedAttachments: 0, failedDocumentIds: ["d1"] });
  });

  it("marks a document as failed when the delete matches no row", async () => {
    const { client } = fakeSupabase([
      { data: [], error: null },
      { data: [], error: null },
    ]);

    const result = await deleteStaleDraftDocuments(client, "owner-1", ["d1"]);

    expect(result).toEqual({ deletedDocuments: 0, deletedAttachments: 0, failedDocumentIds: ["d1"] });
  });
});
