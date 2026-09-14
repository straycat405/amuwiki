import { z } from "zod";

export const themeKeys = ["paper-green", "toss-blue", "ink-indigo"] as const;
export const colorModes = ["system", "light", "dark"] as const;
export const fontPresets = ["pretendard", "suit", "noto-sans-kr"] as const;
export const fontScales = ["small", "normal", "large"] as const;
export const contentWidths = ["narrow", "normal", "wide"] as const;
export const lineBreakModes = ["hard", "soft"] as const;

export const preferencesSchema = z.object({
  theme: z.enum(themeKeys),
  mode: z.enum(colorModes),
  font: z.enum(fontPresets),
  fontScale: z.enum(fontScales),
  contentWidth: z.enum(contentWidths),
  tooltipEnabled: z.boolean(),
  tooltipDelayMs: z.number().int().min(250).max(800),
  lineBreakMode: z.enum(lineBreakModes),
});

export type Preferences = z.infer<typeof preferencesSchema>;

export const defaultPreferences: Preferences = {
  theme: "paper-green",
  mode: "system",
  font: "pretendard",
  fontScale: "normal",
  contentWidth: "normal",
  tooltipEnabled: true,
  tooltipDelayMs: 450,
  lineBreakMode: "hard",
};

export function parsePreferences(value: unknown): Preferences {
  return preferencesSchema.catch(defaultPreferences).parse(value);
}

/** localStorage key used to cache the paint-affecting subset of preferences and avoid a flash of default styling before hydration. */
export const APPEARANCE_CACHE_KEY = "amuwiki:appearance";

export type AppearanceCache = Pick<
  Preferences,
  "theme" | "mode" | "font" | "fontScale" | "contentWidth"
>;

export function appearanceCacheFromPreferences(
  preferences: Preferences,
): AppearanceCache {
  return {
    theme: preferences.theme,
    mode: preferences.mode,
    font: preferences.font,
    fontScale: preferences.fontScale,
    contentWidth: preferences.contentWidth,
  };
}

export const preferencesPatchSchema = preferencesSchema.partial();
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

type PreferencesRow = {
  theme_key: string;
  color_mode: string;
  font_preset: string;
  font_scale: string;
  content_width: string;
  tooltip_enabled: boolean;
  tooltip_delay_ms: number;
  line_break_mode: string;
};

export function preferencesFromRow(row: PreferencesRow): Preferences {
  return parsePreferences({
    theme: row.theme_key,
    mode: row.color_mode,
    font: row.font_preset,
    fontScale: row.font_scale,
    contentWidth: row.content_width,
    tooltipEnabled: row.tooltip_enabled,
    tooltipDelayMs: row.tooltip_delay_ms,
    lineBreakMode: row.line_break_mode,
  });
}

export function preferencesPatchToRow(
  patch: PreferencesPatch,
): Partial<PreferencesRow> {
  const row: Partial<PreferencesRow> = {};
  if (patch.theme) row.theme_key = patch.theme;
  if (patch.mode) row.color_mode = patch.mode;
  if (patch.font) row.font_preset = patch.font;
  if (patch.fontScale) row.font_scale = patch.fontScale;
  if (patch.contentWidth) row.content_width = patch.contentWidth;
  if (patch.tooltipEnabled !== undefined) row.tooltip_enabled = patch.tooltipEnabled;
  if (patch.tooltipDelayMs !== undefined) row.tooltip_delay_ms = patch.tooltipDelayMs;
  if (patch.lineBreakMode) row.line_break_mode = patch.lineBreakMode;
  return row;
}
