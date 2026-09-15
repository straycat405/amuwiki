import { describe, expect, it } from "vitest";

import { createTextAnchor, markdownToAnchorText, reconnectAnchor } from "@/lib/markdown/anchor-text";

describe("annotation anchors", () => {
  it("uses reader-visible Markdown text for an anchor", () => {
    const text = markdownToAnchorText("# 제목\n[[문서|표시명]]과 **강조**");
    expect(text).toContain("표시명과 강조");
    expect(createTextAnchor(text, "표시명")).toMatchObject({ exact: "표시명" });
  });

  it("prefers matching context when the same quote occurs twice", () => {
    const previous = createTextAnchor("앞 target 뒤와 다른 target 끝", "target", 0)!;
    const resolved = reconnectAnchor("추가 앞 target 뒤와 다른 target 끝", { id: "a", ...previous, status: "active" });
    expect(resolved.start).toBe(5);
    expect(resolved.status).toBe("active");
  });

  it("keeps a missing quote as orphaned", () => {
    const previous = createTextAnchor("선택한 문장", "선택한")!;
    expect(reconnectAnchor("완전히 바뀐 본문", { id: "a", ...previous, status: "resolved" }).status).toBe("orphaned");
  });
});
