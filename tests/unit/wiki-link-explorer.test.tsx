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
  });
});
