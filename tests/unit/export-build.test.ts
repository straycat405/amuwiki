import { describe, expect, it } from "vitest";

import { attachmentZipPath, relinkForExport } from "@/features/export/build";
import { parseFrontmatter, stringifyFrontmatter } from "@/lib/markdown/frontmatter";

describe("attachmentZipPath", () => {
  it("places the attachment under attachments/{slug}/{name}", () => {
    const used = new Set<string>();
    expect(attachmentZipPath("문서-a", "photo.png", used)).toBe("attachments/문서-a/photo.png");
  });

  it("appends a numeric suffix on a name collision within the same document", () => {
    const used = new Set<string>();
    expect(attachmentZipPath("doc", "photo.png", used)).toBe("attachments/doc/photo.png");
    expect(attachmentZipPath("doc", "photo.png", used)).toBe("attachments/doc/photo-2.png");
    expect(attachmentZipPath("doc", "photo.png", used)).toBe("attachments/doc/photo-3.png");
  });

  it("sanitizes path separators and leading dots out of the original name", () => {
    const used = new Set<string>();
    const path = attachmentZipPath("doc", "../../evil.png", used);
    expect(path).toBe("attachments/doc/_.._evil.png");
  });
});

describe("relinkForExport", () => {
  it("rewrites a live attachment URL to its relative export path", () => {
    const map = new Map([["b5bbb0b1-bc7f-49de-aab8-20b1ae726bf3", "attachments/doc/photo.png"]]);
    const body = "![로고](/api/attachments/b5bbb0b1-bc7f-49de-aab8-20b1ae726bf3)";

    expect(relinkForExport(body, map)).toBe("![로고](../attachments/doc/photo.png)");
  });

  it("leaves references with no matching attachment untouched", () => {
    const body = "![missing](/api/attachments/00000000-0000-0000-0000-000000000000)";
    expect(relinkForExport(body, new Map())).toBe(body);
  });
});

describe("stringifyFrontmatter round-trip", () => {
  it("writes YAML that parseFrontmatter reads back identically", () => {
    const data = { title: "문서 A", aliases: ["a", "b"], published: true, tags: ["x", "y"] };
    const written = stringifyFrontmatter(data, "본문입니다.");

    const { data: reparsed, content } = parseFrontmatter(written);
    expect(reparsed).toEqual(data);
    expect(content.trim()).toBe("본문입니다.");
  });

  it("skips the frontmatter block entirely when there is no data", () => {
    expect(stringifyFrontmatter({}, "그냥 본문")).toBe("그냥 본문");
  });
});
