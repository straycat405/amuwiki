import { describe, expect, it } from "vitest";

import { convertClipboardHtmlToMarkdown } from "@/lib/markdown/html-to-markdown";

describe("convertClipboardHtmlToMarkdown", () => {
  it("preserves common Notion, GPT, and Claude formatting as Markdown", () => {
    expect(
      convertClipboardHtmlToMarkdown(`
        <h2>정리</h2><p><strong>중요</strong>한 <code>value</code></p>
        <ul><li>첫째</li><li><input type="checkbox" checked> 완료</li></ul>
        <pre><code class="language-ts">const value = 1;</code></pre>
      `),
    ).toBe("## 정리\n\n**중요**한 `value`\n\n- 첫째\n- [x] 완료\n\n```ts\nconst value = 1;\n```");
  });

  it("converts copied tables and drops unsafe links instead of storing HTML", () => {
    expect(
      convertClipboardHtmlToMarkdown(`
        <table><tr><th>이름</th><th>값</th></tr><tr><td>A</td><td>1</td></tr></table>
        <p><a href="javascript:alert(1)">나쁜 링크</a></p>
      `),
    ).toBe("| 이름 | 값 |\n| --- | --- |\n| A | 1 |\n\n나쁜 링크");
  });

  it("uses a longer fence when copied code contains a fenced snippet", () => {
    expect(convertClipboardHtmlToMarkdown("<pre><code>const x = ```value```;</code></pre>")).toBe(
      "````\nconst x = ```value```;\n````",
    );
  });
});
