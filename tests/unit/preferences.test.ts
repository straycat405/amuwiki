import { describe, expect, it } from "vitest";

import { defaultAppearance, parseAppearance } from "@/features/preferences/preferences";

describe("parseAppearance", () => {
  it("accepts a supported appearance", () => {
    expect(
      parseAppearance({ theme: "toss-blue", mode: "dark", font: "suit" }),
    ).toEqual({ theme: "toss-blue", mode: "dark", font: "suit" });
  });

  it("falls back as one unit when persisted data is invalid", () => {
    expect(parseAppearance({ theme: "unknown" })).toEqual(defaultAppearance);
  });
});
