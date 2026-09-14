"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { updatePreferencesAction } from "@/app/(wiki)/settings/actions";
import {
  APPEARANCE_CACHE_KEY,
  appearanceCacheFromPreferences,
  defaultPreferences,
  type Preferences,
  type PreferencesPatch,
} from "@/features/preferences/preferences";

function applyToDocument(preferences: Preferences) {
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.dataset.font = preferences.font;
  root.dataset.scale = preferences.fontScale;
  root.dataset.width = preferences.contentWidth;
  if (preferences.mode === "system") delete root.dataset.mode;
  else root.dataset.mode = preferences.mode;
}

function cacheAppearance(preferences: Preferences) {
  try {
    window.localStorage.setItem(
      APPEARANCE_CACHE_KEY,
      JSON.stringify(appearanceCacheFromPreferences(preferences)),
    );
  } catch {
    // localStorage may be unavailable (private mode, disabled storage); the cache is a paint optimization only.
  }
}

type PreferencesContextValue = {
  preferences: Preferences;
  updatePreference: <K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ) => void;
  pending: boolean;
  error: string | null;
};

const PreferencesContext = createContext<PreferencesContextValue>({
  preferences: defaultPreferences,
  updatePreference: () => {},
  pending: false,
  error: null,
});

export function usePreferences() {
  return useContext(PreferencesContext);
}

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Preferences;
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousRef = useRef(preferences);

  useEffect(() => {
    applyToDocument(preferences);
    cacheAppearance(preferences);
  }, [preferences]);

  const updatePreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      previousRef.current = preferences;
      setPreferences((current) => ({ ...current, [key]: value }));
      setError(null);
      setPending(true);

      const patch: PreferencesPatch = { [key]: value };
      void updatePreferencesAction(patch)
        .then((result) => {
          if (!result.ok) {
            setPreferences(previousRef.current);
            setError(result.message);
          }
        })
        .catch(() => {
          setPreferences(previousRef.current);
          setError("설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
        })
        .finally(() => setPending(false));
    },
    [preferences],
  );

  const value = useMemo(
    () => ({ preferences, updatePreference, pending, error }),
    [preferences, updatePreference, pending, error],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}
