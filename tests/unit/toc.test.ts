import { describe, expect, it } from "vitest";

import { extractToc } from "@/lib/markdown/toc";

describe("extractToc", () => {
  it("collects h2–h4 headings with slugs matching remarkHeadingIds", () => {
    const markdown = ["# 문서 제목", "", "## 개요", "", "### 배경", "", "본문.", "", "## 결론"].join(
      "\n",
    );

    expect(extractToc(markdown)).toEqual([
      { level: 2, text: "개요", slug: "개요" },
      { level: 3, text: "배경", slug: "배경" },
      { level: 2, text: "결론", slug: "결론" },
    ]);
  });

  it("excludes the document's own h1 by default", () => {
    expect(extractToc("# 제목\n\n본문")).toEqual([]);
  });

  it("skips headings inside fenced code blocks", () => {
    const markdown = ["## 실제 제목", "```", "## 코드 안의 가짜 제목", "```"].join("\n");
    expect(extractToc(markdown)).toEqual([{ level: 2, text: "실제 제목", slug: "실제-제목" }]);
  });

  it("strips inline emphasis markers from the displayed text", () => {
    expect(extractToc("## **굵게** 강조된 제목")).toEqual([
      { level: 2, text: "굵게 강조된 제목", slug: "굵게-강조된-제목" },
    ]);
  });

  it("returns an empty list when there are no headings in range", () => {
    expect(extractToc("그냥 본문입니다.")).toEqual([]);
  });
});
