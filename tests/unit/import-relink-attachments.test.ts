import { describe, expect, it } from "vitest";

import {
  applyAttachmentReplacements,
  findAttachmentReferences,
  resolveZipRelativePath,
} from "@/features/imports/relink-attachments";

describe("resolveZipRelativePath", () => {
  it("resolves a path relative to the containing document", () => {
    expect(resolveZipRelativePath("notes/today.md", "../assets/photo.png")).toBe("assets/photo.png");
    expect(resolveZipRelativePath("notes/today.md", "photo.png")).toBe("notes/photo.png");
    expect(resolveZipRelativePath("today.md", "assets/photo.png")).toBe("assets/photo.png");
  });

  it("decodes URL-encoded segments and strips query/hash", () => {
    expect(resolveZipRelativePath("today.md", "assets/%ED%95%9C%EA%B8%80.png?x=1#y")).toBe("assets/한글.png");
  });

  it("returns null for external URLs and anchors", () => {
    expect(resolveZipRelativePath("today.md", "https://example.com/x.png")).toBeNull();
    expect(resolveZipRelativePath("today.md", "#heading")).toBeNull();
  });
});

describe("findAttachmentReferences", () => {
  it("finds relative image references and skips fenced code blocks", () => {
    const body = [
      "![alt](assets/photo.png)",
      "```",
      "![alt](assets/inside-code.png)",
      "```",
      "![remote](https://example.com/x.png)",
    ].join("\n");

    const refs = findAttachmentReferences(body, "notes/today.md");

    expect(refs).toEqual([{ ref: "assets/photo.png", resolvedPath: "notes/assets/photo.png" }]);
  });
});

describe("applyAttachmentReplacements", () => {
  it("replaces only references present in the URL map", () => {
    const body = "![known](assets/photo.png) and ![other](assets/unrelated.png)";
    const map = new Map([["notes/assets/photo.png", "/api/attachments/abc"]]);

    const result = applyAttachmentReplacements(body, "notes/today.md", map);

    expect(result).toBe("![known](/api/attachments/abc) and ![other](assets/unrelated.png)");
  });

  it("leaves fenced code blocks untouched", () => {
    const body = ["```", "![alt](assets/photo.png)", "```"].join("\n");
    const map = new Map([["assets/photo.png", "/api/attachments/abc"]]);

    expect(applyAttachmentReplacements(body, "today.md", map)).toBe(body);
  });
});
