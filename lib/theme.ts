"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export const themeStorageKey = "sub2api-upstream-status.theme";

export type ThemeChoice = "auto" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemeChoice, "auto">;

export function isThemeChoice(value: string | null): value is ThemeChoice {
  return value === "auto" || value === "light" || value === "dark";
}

export function resolveThemeChoice(
  choice: ThemeChoice,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (choice === "auto") return systemPrefersDark ? "dark" : "light";
  return choice;
}

export function useTheme() {
  const [choice, setChoiceState] = useState<ThemeChoice>("auto");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const stored = window.localStorage.getItem(themeStorageKey);
    setChoiceState(isThemeChoice(stored) ? stored : "auto");
    setSystemPrefersDark(media.matches);
    setReady(true);

    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = resolveThemeChoice(choice, systemPrefersDark);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [ready, resolvedTheme]);

  const setChoice = useCallback((nextChoice: ThemeChoice) => {
    setChoiceState(nextChoice);
    window.localStorage.setItem(themeStorageKey, nextChoice);
  }, []);

  return useMemo(
    () => ({
      choice,
      resolvedTheme,
      setChoice
    }),
    [choice, resolvedTheme, setChoice]
  );
}
