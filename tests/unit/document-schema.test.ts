import { describe, expect, it } from "vitest";

import { createDocumentSchema, updateDocumentSchema } from "@/features/documents/document-schema";

describe("document input validation", () => {
  it("trims valid document metadata", () => {
    expect(
      createDocumentSchema.parse({
        title: "  테스트 문서  ",
        summary: "  요약  ",
        bodyMarkdown: "본문",
      }),
    ).toEqual({ title: "테스트 문서", summary: "요약", bodyMarkdown: "본문" });
  });

  it("rejects an empty title", () => {
    expect(
      createDocumentSchema.safeParse({ title: "  ", summary: "", bodyMarkdown: "" }).success,
    ).toBe(false);
  });

  it("requires a positive integer version for updates", () => {
    expect(
      updateDocumentSchema.safeParse({
        title: "문서",
        summary: "",
        bodyMarkdown: "",
        version: "0",
      }).success,
    ).toBe(false);
  });
});
