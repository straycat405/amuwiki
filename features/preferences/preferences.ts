import { z } from "zod";

export const themeKeys = ["paper-green", "toss-blue", "ink-indigo"] as const;
export const colorModes = ["system", "light", "dark"] as const;
export const fontPresets = ["pretendard", "suit", "noto-sans-kr"] as const;

export const appearanceSchema = z.object({
  theme: z.enum(themeKeys),
  mode: z.enum(colorModes),
  font: z.enum(fontPresets),
});

export type Appearance = z.infer<typeof appearanceSchema>;

export const defaultAppearance: Appearance = {
  theme: "paper-green",
  mode: "system",
  font: "pretendard",
};

export function parseAppearance(value: unknown): Appearance {
  return appearanceSchema.catch(defaultAppearance).parse(value);
}
