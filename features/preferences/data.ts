import type { SupabaseClient } from "@supabase/supabase-js";

import {
  defaultPreferences,
  preferencesFromRow,
  preferencesPatchToRow,
  type Preferences,
  type PreferencesPatch,
} from "@/features/preferences/preferences";

const PREFERENCES_COLUMNS =
  "theme_key, color_mode, font_preset, font_scale, content_width, tooltip_enabled, tooltip_delay_ms, line_break_mode";

export async function getPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<Preferences> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select(PREFERENCES_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return defaultPreferences;
  return preferencesFromRow(data);
}

export async function updatePreferences(
  supabase: SupabaseClient,
  userId: string,
  patch: PreferencesPatch,
): Promise<{ ok: true } | { ok: false }> {
  const row = preferencesPatchToRow(patch);
  if (Object.keys(row).length === 0) return { ok: true };

  const { error } = await supabase
    .from("user_preferences")
    .update(row)
    .eq("user_id", userId);

  return error ? { ok: false } : { ok: true };
}
