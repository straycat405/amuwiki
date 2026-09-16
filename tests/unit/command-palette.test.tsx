import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/search/command-palette";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const searchAction = vi.fn();
const recordSearchAction = vi.fn();
const getSearchLandingAction = vi.fn();
const deleteRecentSearchAction = vi.fn();
const clearRecentSearchesAction = vi.fn();

vi.mock("@/app/(wiki)/search/actions", () => ({
  searchAction: (...args: unknown[]) => searchAction(...args),
  recordSearchAction: (...args: unknown[]) => recordSearchAction(...args),
  getSearchLandingAction: (...args: unknown[]) => getSearchLandingAction(...args),
  deleteRecentSearchAction: (...args: unknown[]) =>
    deleteRecentSearchAction(...args),
  clearRecentSearchesAction: (...args: unknown[]) =>
    clearRecentSearchesAction(...args),
}));

const emptyLanding = { recentSearches: [], recentViews: [] };

afterEach(() => {
  vi.clearAllMocks();
});

describe("CommandPalette", () => {
  it("opens on click and shows debounced search results", async () => {
    getSearchLandingAction.mockResolvedValue(emptyLanding);
    searchAction.mockResolvedValue([
      {
        documentId: "doc-1",
        slug: "문명-6",
        title: "문명 6",
        summary: "전략 게임",
        matchedAlias: null,
        matchedContext: "…문명 6 전략 게임의 상세 기록입니다.",
      },
    ]);

    render(<CommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: "문서 검색" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("제목, 별칭, 본문으로 검색"), {
      target: { value: "문명" },
    });

    const resultButton = await screen.findByRole("button", { name: /문명 6/ });
    expect(searchAction).toHaveBeenCalledWith("문명");
    expect(screen.getByText("문명").tagName).toBe("MARK");

    fireEvent.click(resultButton);

    expect(recordSearchAction).toHaveBeenCalledWith("문명");
    expect(push).toHaveBeenCalledWith("/documents/문명-6");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a searching state instead of a false empty result while waiting", async () => {
    getSearchLandingAction.mockResolvedValue(emptyLanding);
    searchAction.mockResolvedValue([
      {
        documentId: "doc-1",
        slug: "하네스",
        title: "하네스",
        summary: "",
        matchedAlias: null,
        matchedContext: null,
      },
    ]);

    render(<CommandPalette />);
    fireEvent.click(screen.getByRole("button", { name: "문서 검색" }));
    const input = await screen.findByPlaceholderText("제목, 별칭, 본문으로 검색");

    fireEvent.change(input, { target: { value: "하네스" } });

    expect(screen.getByText("검색 중…")).toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();

    await screen.findByRole("button", { name: /하네스/ });
    expect(screen.queryByText("검색 중…")).not.toBeInTheDocument();
  });

  it("navigates results with the keyboard and selects with Enter", async () => {
    getSearchLandingAction.mockResolvedValue(emptyLanding);
    searchAction.mockResolvedValue([
      {
        documentId: "doc-1",
        slug: "문서-1",
        title: "문서 1",
        summary: "",
        matchedAlias: null,
        matchedContext: null,
      },
      {
        documentId: "doc-2",
        slug: "문서-2",
        title: "문서 2",
        summary: "",
        matchedAlias: null,
        matchedContext: null,
      },
    ]);

    render(<CommandPalette />);
    fireEvent.click(screen.getByRole("button", { name: "문서 검색" }));
    const input = await screen.findByPlaceholderText("제목, 별칭, 본문으로 검색");
    fireEvent.change(input, { target: { value: "문서" } });
    await screen.findByRole("button", { name: /문서 1/ });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/documents/문서-2");
  });

  it("closes when the user clicks outside the search panel", async () => {
    getSearchLandingAction.mockResolvedValue(emptyLanding);

    render(<CommandPalette />);
    fireEvent.click(screen.getByRole("button", { name: "문서 검색" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(
      document.querySelector(".command-palette-overlay")?.parentElement,
    ).toBe(document.body);
    expect(document.body).toHaveClass("command-palette-open");
    expect(document.documentElement).toHaveClass("command-palette-open");

    fireEvent.pointerDown(document.querySelector(".command-palette-backdrop")!);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body).not.toHaveClass("command-palette-open");
    expect(document.documentElement).not.toHaveClass("command-palette-open");
  });

  it("removes a recent search entry without navigating", async () => {
    getSearchLandingAction.mockResolvedValue({
      recentSearches: [
        {
          normalizedQuery: "문명",
          displayQuery: "문명",
          lastSearchedAt: new Date().toISOString(),
        },
      ],
      recentViews: [],
    });

    render(<CommandPalette />);
    fireEvent.click(screen.getByRole("button", { name: "문서 검색" }));

    expect(await screen.findByRole("button", { name: "문명" })).toHaveClass(
      "command-palette__recent-search",
    );
    const removeButton = await screen.findByRole("button", {
      name: "문명 최근 검색어 삭제",
    });
    fireEvent.click(removeButton);

    expect(deleteRecentSearchAction).toHaveBeenCalledWith("문명");
    expect(screen.queryByRole("button", { name: /^문명$/ })).not.toBeInTheDocument();
  });
});
