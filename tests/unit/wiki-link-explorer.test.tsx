import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WikiLinkExplorer } from "@/components/document/wiki-link-explorer";

const preview = {
  slug: "문명-6",
  title: "문명 6",
  summary: "문명 시리즈의 전략 게임입니다.",
  bodyMarkdown: "후속 개념: [[과학]]",
  wikiLinkResolutions: {
    과학: { href: "/documents/과학", title: "과학" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WikiLinkExplorer", () => {
  it("pins a resolved concept link instead of leaving the document", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => preview,
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WikiLinkExplorer
        markdown="[[문명 6]]"
        wikiLinkResolutions={{
          "문명 6": { href: "/documents/문명-6", title: "문명 6" },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: "문명 6" }), {
      clientX: 120,
      clientY: 180,
    });

    expect(await screen.findByLabelText("문명 6 고정 카드")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/documents/preview?slug=%EB%AC%B8%EB%AA%85-6");
    expect(screen.getByText("문명 시리즈의 전략 게임입니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "문명 6 새 탭에서 열기" })).toHaveAttribute(
      "href",
      "/documents/문명-6",
    );
    expect(screen.getByRole("link", { name: "문명 6 새 탭에서 열기" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(
      screen.getByRole("link", { name: "문명 6 문서로 이동 (카드 닫힘)" }),
    ).toHaveAttribute("href", "/documents/문명-6");
  });

  it("caps pinned cards at three and collapses the oldest into the exploration path", async () => {
    const links = Array.from({ length: 4 }, (_, index) => `문서 ${index + 1}`);
    const fetchMock = vi.fn().mockImplementation(async (input: string) => {
      const slug = new URL(input, "http://localhost").searchParams.get("slug") ?? "";
      return {
        ok: true,
        json: async () => ({ ...preview, slug, title: decodeURIComponent(slug) }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <WikiLinkExplorer
        markdown={links.map((title) => `[[${title}]]`).join(" ")}
        wikiLinkResolutions={Object.fromEntries(
          links.map((title) => [title, { href: `/documents/${encodeURIComponent(title)}`, title }]),
        )}
      />,
    );

    for (const [index, title] of links.entries()) {
      fireEvent.click(screen.getByRole("link", { name: title }), {
        clientX: 120 + index,
        clientY: 180,
      });
      await screen.findByText(new RegExp(`^${title}$`));
    }

    // 4번째 카드를 열면 가장 먼저 열었던 "문서 1"은 카드로 남지 않고 경로로 접힌다.
    expect(screen.getAllByLabelText(/고정 카드$/)).toHaveLength(3);
    expect(screen.queryByLabelText("문서 1 고정 카드")).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "탐색 경로" }),
    ).toHaveTextContent("현재 문서");
    const trailButton = screen.getByRole("button", { name: "문서 1" });
    expect(trailButton).toBeInTheDocument();

    // 경로에 접힌 카드를 다시 클릭하면 카드로 재탐색할 수 있다.
    fireEvent.click(trailButton);
    expect(await screen.findByLabelText("문서 1 고정 카드")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/고정 카드$/)).toHaveLength(3);
  });
});
