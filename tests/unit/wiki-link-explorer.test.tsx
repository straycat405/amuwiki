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
    expect(screen.getByRole("link", { name: "해당 문서로 이동" })).toHaveAttribute(
      "href",
      "/documents/문명-6",
    );
    expect(screen.getByRole("link", { name: "해당 문서로 이동" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("allows up to ten pinned cards", async () => {
    const links = Array.from({ length: 10 }, (_, index) => `문서 ${index + 1}`);
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
      expect(await screen.findByLabelText(`${title} 고정 카드`)).toBeInTheDocument();
    }

    expect(screen.getAllByLabelText(/고정 카드$/)).toHaveLength(10);
    expect(screen.queryByText("고정 카드는 최대 10개까지 열 수 있습니다.")).not.toBeInTheDocument();
  });
});
