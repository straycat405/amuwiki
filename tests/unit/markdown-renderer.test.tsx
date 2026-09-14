import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "@/components/document/markdown-renderer";
import { normalizeConcept, slugifyDocumentTitle } from "@/lib/markdown/slug";

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
});

describe("concept normalization", () => {
  it("normalizes Korean whitespace and casing", () => {
    expect(normalizeConcept("  React   상태  ")).toBe("react 상태");
    expect(slugifyDocumentTitle("문명 6: 과학 승리")).toBe("문명-6-과학-승리");
  });
});
