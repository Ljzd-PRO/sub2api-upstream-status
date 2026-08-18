import type { UsageWindowKey } from "@/lib/types";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export interface ServerConfig {
  apiBaseUrl: string;
  adminApiKey: string;
  accountIds: number[];
  maskAccountNames: boolean;
  refreshIntervalSeconds: number;
  requestTimeoutMs: number;
  panelTitle: string;
  visibleUsageWindows: UsageWindowKey[];
  announcementsEnabled: boolean;
}

export interface OpenAIStatusConfig {
  refreshIntervalSeconds: number;
  requestTimeoutMs: number;
}

const DEFAULT_REFRESH_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_TITLE = "sub2api upstream status";
const DEFAULT_OPENAI_STATUS_REFRESH_SECONDS = 10;
const DEFAULT_OPENAI_STATUS_TIMEOUT_MS = 8000;
const DEFAULT_USAGE_WINDOWS: UsageWindowKey[] = ["5h", "7d"];

export function parseAccountIds(value: string | undefined): number[] {
  if (!value) return [];

  const seen = new Set<number>();
  const ids: number[] = [];

  for (const raw of value.split(/[,\s]+/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!/^\d+$/.test(trimmed)) continue;

    const id = Number(trimmed);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) return "";

  const withoutSlash = raw.replace(/\/+$/, "");
  return withoutSlash.endsWith("/api/v1")
    ? withoutSlash
    : `${withoutSlash}/api/v1`;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function parseBooleanFlag(value: string | undefined, fallback = false): boolean {
  if (!value?.trim()) return fallback;
  const normalized = value?.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

export function parseUsageWindows(value: string | undefined): UsageWindowKey[] {
  if (!value?.trim()) return [...DEFAULT_USAGE_WINDOWS];

  const requested = new Set(
    value
      .toLowerCase()
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  );
  const windows = DEFAULT_USAGE_WINDOWS.filter((window) => requested.has(window));

  return windows.length > 0 ? windows : [...DEFAULT_USAGE_WINDOWS];
}

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiBaseUrl = normalizeApiBaseUrl(env.SUB2API_BASE_URL);
  const adminApiKey = env.SUB2API_ADMIN_API_KEY?.trim() ?? "";
  const accountIds = parseAccountIds(env.SUB2API_ACCOUNT_IDS);

  const missing: string[] = [];
  if (!apiBaseUrl) missing.push("SUB2API_BASE_URL");
  if (!adminApiKey) missing.push("SUB2API_ADMIN_API_KEY");
  if (accountIds.length === 0) missing.push("SUB2API_ACCOUNT_IDS");

  if (missing.length > 0) {
    throw new ConfigError(`Missing required configuration: ${missing.join(", ")}`);
  }

  return {
    apiBaseUrl,
    adminApiKey,
    accountIds,
    maskAccountNames: parseBooleanFlag(env.MASK_ACCOUNT_NAMES),
    refreshIntervalSeconds: parsePositiveInteger(
      env.REFRESH_INTERVAL_SECONDS,
      DEFAULT_REFRESH_SECONDS,
      15,
      3600
    ),
    requestTimeoutMs: parsePositiveInteger(
      env.SUB2API_REQUEST_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      3000,
      60000
    ),
    panelTitle: env.NEXT_PUBLIC_PANEL_TITLE?.trim() || DEFAULT_TITLE,
    visibleUsageWindows: parseUsageWindows(env.DISPLAY_USAGE_WINDOWS),
    announcementsEnabled: parseBooleanFlag(env.ENABLE_ANNOUNCEMENTS, true)
  };
}

export function getOpenAIStatusConfig(
  env: NodeJS.ProcessEnv = process.env
): OpenAIStatusConfig {
  return {
    refreshIntervalSeconds: parsePositiveInteger(
      env.OPENAI_STATUS_REFRESH_INTERVAL_SECONDS,
      DEFAULT_OPENAI_STATUS_REFRESH_SECONDS,
      10,
      3600
    ),
    requestTimeoutMs: parsePositiveInteger(
      env.OPENAI_STATUS_REQUEST_TIMEOUT_MS,
      DEFAULT_OPENAI_STATUS_TIMEOUT_MS,
      1000,
      30000
    )
  };
}
