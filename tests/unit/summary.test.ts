import { describe, expect, it } from "vitest";

import { SUMMARY_MAX_LENGTH, deriveSummary } from "@/lib/markdown/summary";

describe("deriveSummary", () => {
  it("prefers frontmatter summary, then description", () => {
    expect(deriveSummary("---\nsummary: 요약문\n---\n본문")).toBe("요약문");
    expect(deriveSummary("---\ndescription: 설명문\n---\n본문")).toBe("설명문");
  });

  it("skips headings, images, tables, rules, html and code before the first paragraph", () => {
    const markdown = [
      "# 제목",
      "",
      "![그림](a.png)",
      "",
      "| a | b |",
      "|---|---|",
      "",
      "---",
      "",
      "<div>raw</div>",
      "",
      "```ts",
      "const x = 1;",
      "```",
      "",
      "첫 문단입니다.",
      "",
      "둘째 문단.",
    ].join("\n");
    expect(deriveSummary(markdown)).toBe("첫 문단입니다.");
  });

  it("drops a heading line that shares a block with the paragraph", () => {
    expect(deriveSummary("## 소제목\n바로 이어지는 본문")).toBe("바로 이어지는 본문");
  });

  it("flattens inline markup and wiki links", () => {
    const markdown =
      "**굵게** *기울임* `코드` [링크](https://x.y) [[문서 제목|표시명]] [[다른 문서#절]] ~~취소~~";
    expect(deriveSummary(markdown)).toBe("굵게 기울임 코드 링크 표시명 다른 문서 취소");
  });

  it("strips list and blockquote markers and collapses whitespace", () => {
    expect(deriveSummary("> 인용\n> 두 번째   줄")).toBe("인용 두 번째 줄");
    expect(deriveSummary("- 항목 하나\n- 항목 둘")).toBe("항목 하나 항목 둘");
    expect(deriveSummary("1. 첫째\n2) 둘째")).toBe("첫째 둘째");
  });

  it("caps the result at 300 characters with an ellipsis", () => {
    const long = "가".repeat(400);
    const result = deriveSummary(long);
    expect(result).toHaveLength(SUMMARY_MAX_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });

  it("returns an empty string when nothing meaningful remains", () => {
    expect(deriveSummary("# 제목만\n\n![img](a.png)\n\n```\ncode\n```")).toBe("");
    expect(deriveSummary("")).toBe("");
  });
});
