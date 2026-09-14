import { describe, expect, it } from "vitest";

import {
  defaultPreferences,
  parsePreferences,
  preferencesFromRow,
  preferencesPatchToRow,
} from "@/features/preferences/preferences";

describe("parsePreferences", () => {
  it("accepts a supported preferences object", () => {
    expect(
      parsePreferences({
        theme: "toss-blue",
        mode: "dark",
        font: "suit",
        fontScale: "large",
        contentWidth: "wide",
        tooltipEnabled: false,
        tooltipDelayMs: 600,
        lineBreakMode: "soft",
      }),
    ).toEqual({
      theme: "toss-blue",
      mode: "dark",
      font: "suit",
      fontScale: "large",
      contentWidth: "wide",
      tooltipEnabled: false,
      tooltipDelayMs: 600,
      lineBreakMode: "soft",
    });
  });

  it("falls back as one unit when persisted data is invalid", () => {
    expect(parsePreferences({ theme: "unknown" })).toEqual(defaultPreferences);
  });
});

describe("preferencesFromRow", () => {
  it("maps a database row to camelCase preferences", () => {
    expect(
      preferencesFromRow({
        theme_key: "ink-indigo",
        color_mode: "light",
        font_preset: "noto-sans-kr",
        font_scale: "small",
        content_width: "narrow",
        tooltip_enabled: true,
        tooltip_delay_ms: 300,
        line_break_mode: "soft",
      }),
    ).toEqual({
      theme: "ink-indigo",
      mode: "light",
      font: "noto-sans-kr",
      fontScale: "small",
      contentWidth: "narrow",
      tooltipEnabled: true,
      tooltipDelayMs: 300,
      lineBreakMode: "soft",
    });
  });
});

describe("preferencesPatchToRow", () => {
  it("only maps fields present in the patch", () => {
    expect(preferencesPatchToRow({ mode: "dark", tooltipDelayMs: 500 })).toEqual({
      color_mode: "dark",
      tooltip_delay_ms: 500,
    });
  });

  it("maps a boolean false value without dropping it", () => {
    expect(preferencesPatchToRow({ tooltipEnabled: false })).toEqual({
      tooltip_enabled: false,
    });
  });
});
