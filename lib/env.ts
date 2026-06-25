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
}

const DEFAULT_REFRESH_SECONDS = 60;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_TITLE = "sub2api upstream status";

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

export function parseBooleanFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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
    panelTitle: env.NEXT_PUBLIC_PANEL_TITLE?.trim() || DEFAULT_TITLE
  };
}
