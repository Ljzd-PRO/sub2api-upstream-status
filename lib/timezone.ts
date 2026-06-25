"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type TimeZoneChoice = "auto" | string;

export const timeZoneStorageKey = "sub2api-upstream-status.time-zone";

const fallbackTimeZones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles"
] as const;

export function detectTimeZone(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(detected) ? detected : "UTC";
}

export function getTimeZoneOptions(detectedTimeZone = detectTimeZone()): string[] {
  const supported = getSupportedTimeZones();
  const values = new Set(supported.length > 0 ? supported : fallbackTimeZones);

  values.add("UTC");
  if (isValidTimeZone(detectedTimeZone)) values.add(detectedTimeZone);

  return Array.from(values).sort((a, b) => {
    if (a === "UTC") return -1;
    if (b === "UTC") return 1;
    return a.localeCompare(b);
  });
}

export function isValidTimeZone(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZoneChoice(value: string | null | undefined): TimeZoneChoice {
  if (value === "auto") return "auto";
  return isValidTimeZone(value) ? value : "auto";
}

export function resolveTimeZoneChoice(choice: TimeZoneChoice, detectedTimeZone = detectTimeZone()): string {
  if (choice !== "auto" && isValidTimeZone(choice)) return choice;
  return isValidTimeZone(detectedTimeZone) ? detectedTimeZone : "UTC";
}

export function useTimeZone() {
  const [choice, setChoiceState] = useState<TimeZoneChoice>("auto");
  const [detectedTimeZone, setDetectedTimeZone] = useState("UTC");
  const [timeZone, setTimeZone] = useState("UTC");
  const [options, setOptions] = useState<string[]>(() => getTimeZoneOptions("UTC"));

  useEffect(() => {
    const detected = detectTimeZone();
    const stored = window.localStorage.getItem(timeZoneStorageKey);
    const nextChoice = normalizeTimeZoneChoice(stored);

    setDetectedTimeZone(detected);
    setChoiceState(nextChoice);
    setTimeZone(resolveTimeZoneChoice(nextChoice, detected));
    setOptions(getTimeZoneOptions(detected));
  }, []);

  const setChoice = useCallback(
    (nextChoice: TimeZoneChoice) => {
      const normalizedChoice = normalizeTimeZoneChoice(nextChoice);
      setChoiceState(normalizedChoice);
      window.localStorage.setItem(timeZoneStorageKey, normalizedChoice);
      setTimeZone(resolveTimeZoneChoice(normalizedChoice, detectedTimeZone));
    },
    [detectedTimeZone]
  );

  return useMemo(
    () => ({
      choice,
      detectedTimeZone,
      options,
      setChoice,
      timeZone
    }),
    [choice, detectedTimeZone, options, setChoice, timeZone]
  );
}

function getSupportedTimeZones(): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: "timeZone") => string[];
  };

  try {
    return intlWithSupportedValues.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

