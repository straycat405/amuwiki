import { describe, expect, it, vi } from "vitest";

import { recordSearch, searchDocuments } from "@/features/search/data";

function fakeSupabase(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) } as never;
}

describe("searchDocuments", () => {
  it("skips the RPC call for a blank query", async () => {
    const supabase = fakeSupabase({ data: [], error: null });
    const results = await searchDocuments(supabase, "   ");

    expect(results).toEqual([]);
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("normalizes the query and maps RPC rows to camelCase", async () => {
    const supabase = fakeSupabase({
      data: [
        {
          document_id: "doc-1",
          slug: "문명-6",
          title: "문명 6",
          summary: "전략 게임",
          matched_alias: "문명",
        },
      ],
      error: null,
    });

    const results = await searchDocuments(supabase, "  문명   6 ");

    expect(
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).toHaveBeenCalledWith("search_documents", {
      p_normalized_query: "문명 6",
      p_limit: 20,
    });
    expect(results).toEqual([
      {
        documentId: "doc-1",
        slug: "문명-6",
        title: "문명 6",
        summary: "전략 게임",
        matchedAlias: "문명",
      },
    ]);
  });
});

describe("recordSearch", () => {
  it("skips the RPC call for a blank query", async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    await recordSearch(supabase, "   ");

    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled();
  });

  it("passes the trimmed display query and normalized query", async () => {
    const supabase = fakeSupabase({ data: null, error: null });
    await recordSearch(supabase, "  문명 6  ");

    expect(
      (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).toHaveBeenCalledWith("record_search", {
      p_display_query: "문명 6",
      p_normalized_query: "문명 6",
    });
  });
});
