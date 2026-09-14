import { describe, expect, it } from "vitest";

import { isOwnerEmail, normalizeEmail, safeNextPath } from "@/features/auth/owner";

describe("owner authentication rules", () => {
  it("normalizes email casing and whitespace", () => {
    expect(normalizeEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("allows only the configured owner", () => {
    expect(isOwnerEmail("OWNER@example.com", "owner@example.com")).toBe(true);
    expect(isOwnerEmail("other@example.com", "owner@example.com")).toBe(false);
  });

  it("prevents callback open redirects", () => {
    expect(safeNextPath("/documents/example")).toBe("/documents/example");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
  });
});
