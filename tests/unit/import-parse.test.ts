import { describe, expect, it } from "vitest";

import {
  frontmatterAliases,
  frontmatterTitle,
  parseFrontmatter,
} from "@/lib/markdown/frontmatter";
import {
  isAllowedImportFile,
  parseImportFile,
  stripKnownExtension,
} from "@/features/imports/parse";

describe("isAllowedImportFile", () => {
  it("accepts markdown and plain text extensions", () => {
    expect(isAllowedImportFile("note.md")).toBe(true);
    expect(isAllowedImportFile("note.markdown")).toBe(true);
    expect(isAllowedImportFile("note.txt")).toBe(true);
    expect(isAllowedImportFile("NOTE.TXT")).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(isAllowedImportFile("note.docx")).toBe(false);
    expect(isAllowedImportFile("archive.zip")).toBe(false);
    expect(isAllowedImportFile("note")).toBe(false);
  });
});

describe("stripKnownExtension", () => {
  it("removes the recognized extension only", () => {
    expect(stripKnownExtension("문명 6.md")).toBe("문명 6");
    expect(stripKnownExtension("notes.txt")).toBe("notes");
    expect(stripKnownExtension("no-extension")).toBe("no-extension");
  });
});

describe("parseFrontmatter", () => {
  it("splits YAML frontmatter from content", () => {
    const raw = "---\ntitle: 문명 6\naliases:\n  - civ6\n---\n본문입니다.";
    const { data, content } = parseFrontmatter(raw);
    expect(data.title).toBe("문명 6");
    expect(content.trim()).toBe("본문입니다.");
  });

  it("treats invalid YAML as no frontmatter", () => {
    const raw = "---\n: broken: yaml: [\n---\n본문";
    const { data, content } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(content).toBe(raw);
  });

  it("returns the raw text unchanged when there is no frontmatter block", () => {
    const raw = "그냥 본문입니다.";
    const { data, content } = parseFrontmatter(raw);
    expect(data).toEqual({});
    expect(content).toBe(raw);
  });
});

describe("frontmatterTitle / frontmatterAliases", () => {
  it("reads a string title and normalizes aliases to an array", () => {
    expect(frontmatterTitle({ title: " 문명 6 " })).toBe("문명 6");
    expect(frontmatterTitle({})).toBeNull();
    expect(frontmatterAliases({ aliases: ["civ6", "문명6"] })).toEqual([
      "civ6",
      "문명6",
    ]);
    expect(frontmatterAliases({ aliases: "civ6" })).toEqual(["civ6"]);
    expect(frontmatterAliases({})).toEqual([]);
  });
});

describe("parseImportFile", () => {
  it("uses the YAML title over the filename for markdown files", () => {
    const raw = "---\ntitle: 문명 6\n---\n내용";
    const result = parseImportFile("civ.md", raw);
    expect(result.title).toBe("문명 6");
    expect(result.content.trim()).toBe("내용");
  });

  it("falls back to the filename when there is no frontmatter title", () => {
    const result = parseImportFile("나의 메모.md", "그냥 내용");
    expect(result.title).toBe("나의 메모");
  });

  it("does not attempt frontmatter parsing for .txt files", () => {
    const raw = "---\ntitle: 무시됨\n---\n실제 내용";
    const result = parseImportFile("메모.txt", raw);
    expect(result.title).toBe("메모");
    expect(result.content).toBe(raw);
  });
});
