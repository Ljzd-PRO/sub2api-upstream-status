import type { AppLocale, TFunction } from "@/lib/i18n";

export function formatPercent(value: number | null, noDataLabel = "No data"): string {
  if (value == null || !Number.isFinite(value)) return noDataLabel;
  if (Number.isInteger(value)) return `${value}%`;
  return `${value.toFixed(1)}%`;
}

export function formatDateTime(
  value: string | null,
  locale?: AppLocale,
  unknownLabel = "Unknown",
  timeZone?: string | null
): string {
  if (!value) return unknownLabel;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return unknownLabel;

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  };
  if (timeZone) options.timeZone = timeZone;

  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return unknownLabel;
  }
}

export function formatCountdown(seconds: number | null, t?: TFunction): string {
  if (seconds == null) return t ? t("common.unknown") : "Unknown";
  if (seconds <= 0) return t ? t("common.now") : "Now";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const day = t ? t("time.day") : "d";
  const hour = t ? t("time.hour") : "h";
  const minute = t ? t("time.minute") : "m";

  if (days > 0) return `${days}${day} ${hours}${hour}`;
  if (hours > 0) return `${hours}${hour} ${minutes}${minute}`;
  return `${minutes}${minute}`;
}

export function formatCompactNumber(value: number | undefined, locale?: AppLocale): string {
  if (value == null || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function formatMoney(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return `$${value.toFixed(2)}`;
}

export function platformLabel(value: string): string {
  if (!value) return "Unknown";
  const lower = value.toLowerCase();
  if (lower === "openai") return "OpenAI";
  if (lower === "anthropic") return "Anthropic";
  if (lower === "gemini") return "Gemini";
  if (lower === "antigravity") return "Antigravity";
  return value;
}
