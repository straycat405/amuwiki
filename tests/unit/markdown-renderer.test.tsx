import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "@/components/document/markdown-renderer";
import {
  decodeDocumentSlug,
  normalizeConcept,
  slugifyDocumentTitle,
} from "@/lib/markdown/slug";
import { extractWikiLinkTargets } from "@/lib/markdown/wiki-links";

describe("MarkdownRenderer", () => {
  it("renders wiki links with aliases and headings", () => {
    render(<MarkdownRenderer markdown="[[문명 6#과학 승리|과학]]을 정리한다." />);

    expect(screen.getByRole("link", { name: "과학" })).toHaveAttribute(
      "href",
      "/documents/%EB%AC%B8%EB%AA%85-6#%EA%B3%BC%ED%95%99-%EC%8A%B9%EB%A6%AC",
    );
  });

  it("does not parse wiki syntax inside inline code", () => {
    render(<MarkdownRenderer markdown="`[[코드 예시]]`" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("[[코드 예시]]")).toBeInTheDocument();
  });

  it("renders a single editor newline as a visible line break", () => {
    const { container } = render(<MarkdownRenderer markdown={"첫 줄\n둘째 줄"} />);

    expect(container.querySelector("br")).toBeInTheDocument();
    expect(container).toHaveTextContent("첫 줄 둘째 줄");
  });

  it("does not render raw HTML", () => {
    const { container } = render(
      <MarkdownRenderer markdown={'<script>alert("xss")</script>안전'} />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("안전");
  });

  it("secures external links", () => {
    render(<MarkdownRenderer markdown="[외부](https://example.com)" />);

    expect(screen.getByRole("link", { name: "외부" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("opens and closes a lightbox when an image is clicked", () => {
    render(<MarkdownRenderer markdown="![고양이](/api/attachments/abc)" />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByAltText("고양이"));

    const dialog = screen.getByRole("dialog", { name: "이미지 확대 보기" });
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("assigns headings the same #slug wiki-link anchors already point to", () => {
    render(<MarkdownRenderer markdown="## 과학 승리" />);

    expect(screen.getByRole("heading", { name: "과학 승리" })).toHaveAttribute(
      "id",
      "과학-승리",
    );
  });

  it("marks unresolved links when resolutions are available", () => {
    render(
      <MarkdownRenderer
        markdown="[[없는 문서]]"
        wikiLinkResolutions={{}}
      />,
    );

    expect(screen.getByRole("link", { name: "없는 문서" })).toHaveAttribute(
      "data-wiki-status",
      "missing",
    );
  });
});

describe("wiki link extraction", () => {
  it("extracts normalized targets and their original positions", () => {
    expect(extractWikiLinkTargets("[[문명 6|문명]] 그리고 [[React#상태]]")).toEqual([
      { title: "문명 6", normalizedTitle: "문명 6", firstPosition: 0 },
      { title: "React", normalizedTitle: "react", firstPosition: 16 },
    ]);
  });
});

describe("concept normalization", () => {
  it("normalizes Korean whitespace and casing", () => {
    expect(normalizeConcept("  React   상태  ")).toBe("react 상태");
    expect(slugifyDocumentTitle("문명 6: 과학 승리")).toBe("문명-6-과학-승리");
  });

  it("decodes a browser-encoded document slug", () => {
    expect(decodeDocumentSlug("%EB%A7%81%ED%81%AC-%ED%85%8C%EC%8A%A4%ED%8A%B8")).toBe(
      "링크-테스트",
    );
    expect(decodeDocumentSlug("%E0%A4%A")).toBeNull();
  });
});
