import type { CodexResetForecastConfig } from "@/lib/env";
import type {
  CodexResetForecastConfidence,
  CodexResetForecastExpectedWindow,
  CodexResetForecastPayload,
  CodexResetForecastSource,
  CodexResetForecastState
} from "@/lib/types";

type FetchImplementation = typeof fetch;

interface ForecastServiceOptions extends CodexResetForecastConfig {
  fetchImpl?: FetchImplementation;
  now?: () => number;
}

interface NormalizedForecastSource extends CodexResetForecastSource {
  updatedAtMs: number | null;
  lastResetAt: string | null;
}

interface CacheEntry {
  expiresAt: number;
  payload: CodexResetForecastPayload;
}

type RecordValue = Record<string, unknown>;

export interface CodexResetForecastService {
  getForecast: () => Promise<CodexResetForecastPayload>;
}

const FORECAST_URL = "https://codex-reset.com/api/forecast";
const SOURCE_LABEL = "Codex Reset";
const HOUR_MS = 60 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_RESPONSE_CHARACTERS = 2_000_000;
const MAX_DETAIL_CHARACTERS = 320;
const ALLOWED_EVIDENCE_HOSTS = new Set([
  "codex-reset.com",
  "www.codex-reset.com",
  "x.com",
  "twitter.com"
]);

export function createCodexResetForecastService(
  options: ForecastServiceOptions
): CodexResetForecastService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const refreshIntervalMs = options.refreshIntervalSeconds * 1000;
  let cache: CacheEntry | null = null;
  let lastSuccessfulPayload: CodexResetForecastPayload | null = null;
  let inFlight: Promise<CodexResetForecastPayload> | null = null;

  const getForecast = async (): Promise<CodexResetForecastPayload> => {
    if (!options.enabled) return unavailablePayload(options, now(), [], false);

    if (cache && now() < cache.expiresAt) return cache.payload;
    if (inFlight) return inFlight;

    inFlight = fetchForecast(fetchImpl, options, now)
      .then((payload) => {
        if (payload.state === "unavailable") throw new ForecastUnavailableError(payload);
        lastSuccessfulPayload = payload;
        cache = { expiresAt: now() + refreshIntervalMs, payload };
        return payload;
      })
      .catch((error: unknown) => {
        const failedPayload = error instanceof ForecastUnavailableError
          ? error.payload
          : unavailablePayload(options, now(), [failedSource()], true);
        const payload = lastSuccessfulPayload
          ? { ...lastSuccessfulPayload, stale: true }
          : { ...failedPayload, stale: true };
        cache = { expiresAt: now() + refreshIntervalMs, payload };
        return payload;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };

  return { getForecast };
}

let sharedService: CodexResetForecastService | null = null;
let sharedConfigKey = "";

export function getCodexResetForecastService(
  config: CodexResetForecastConfig
): CodexResetForecastService {
  const configKey = [
    config.enabled,
    config.refreshIntervalSeconds,
    config.requestTimeoutMs,
    config.maxAgeSeconds
  ].join(":");

  if (!sharedService || sharedConfigKey !== configKey) {
    sharedService = createCodexResetForecastService(config);
    sharedConfigKey = configKey;
  }
  return sharedService;
}

export function normalizeForecastSource(
  payload: unknown,
  now: number,
  maxAgeSeconds: number
): NormalizedForecastSource {
  const record = asRecord(payload);
  const probabilities = asRecord(record?.probabilities);
  const evidence = Array.isArray(record?.evidence)
    ? record.evidence.map(asRecord).filter((item): item is RecordValue => item !== null)
    : [];
  const updatedAtMs = dateValue(record?.updated_at);
  const rawLastResetAt = dateValue(record?.last_reset_at);
  const lastResetAt = rawLastResetAt != null && rawLastResetAt <= now + FUTURE_CLOCK_SKEW_MS
    ? new Date(rawLastResetAt).toISOString()
    : null;
  // The site's rounded values include its published signal floor; raw values do not.
  const probability24h = percentProbability(probabilities?.rounded_24h)
    ?? probabilityValue(probabilities?.raw_24h);
  const probability48h = percentProbability(probabilities?.rounded_48h)
    ?? probabilityValue(probabilities?.raw_48h);
  const evidenceUrl = firstEvidenceUrl(evidence.map((item) => item.href));
  const detail = cleanText(record?.confidence_note)
    || evidence.map((item) => cleanText(item.detail)).find(Boolean)
    || "";

  let status: CodexResetForecastSource["status"] = "ok";
  if (!record || updatedAtMs == null || (probability24h == null && probability48h == null)) {
    status = "invalid";
  } else if (updatedAtMs > now + FUTURE_CLOCK_SKEW_MS) {
    status = "invalid";
  } else if (now - updatedAtMs > maxAgeSeconds * 1000) {
    status = "stale";
  }

  return {
    id: "codex-reset",
    label: SOURCE_LABEL,
    status,
    updatedAt: isoDate(updatedAtMs),
    updatedAtMs,
    lastResetAt,
    probability24h,
    probability48h,
    eventAt: null,
    confidence: confidenceValue(record?.confidence),
    detail,
    evidenceUrl
  };
}

export function aggregateForecastSource(
  source: NormalizedForecastSource,
  now: number,
  config: Pick<CodexResetForecastConfig, "enabled" | "refreshIntervalSeconds">
): CodexResetForecastPayload {
  const healthy = source.status === "ok";
  const probability24h = healthy ? source.probability24h : null;
  const probability48h = healthy
    ? Math.max(probability24h ?? 0, source.probability48h ?? probability24h ?? 0)
    : null;
  const probability = probability48h ?? probability24h;

  return {
    enabled: config.enabled,
    fetchedAt: new Date(now).toISOString(),
    refreshIntervalSeconds: config.refreshIntervalSeconds,
    stale: false,
    state: healthy ? forecastState(probability) : "unavailable",
    probability24h: probability24h == null ? null : roundFour(probability24h),
    probability48h: probability48h == null ? null : roundFour(probability48h),
    lastResetAt: healthy ? source.lastResetAt : null,
    confidence: healthy ? source.confidence : "low",
    expectedWindow: healthy ? expectedHorizon(now, probability24h, probability48h) : null,
    scope: { plans: ["all"], windows: ["7d"], uncertain: true },
    agreement: {
      healthySources: healthy ? 1 : 0,
      contributingSources: healthy && probability != null ? 1 : 0,
      totalSources: 1,
      independentEvidence: healthy && source.evidenceUrl ? 1 : 0
    },
    sources: [toPublicSource(source)]
  };
}

async function fetchForecast(
  fetchImpl: FetchImplementation,
  config: CodexResetForecastConfig,
  now: () => number
): Promise<CodexResetForecastPayload> {
  const requestTime = now();
  try {
    const payload = await fetchJsonWithTimeout(fetchImpl, config.requestTimeoutMs);
    return aggregateForecastSource(
      normalizeForecastSource(payload, requestTime, config.maxAgeSeconds),
      requestTime,
      config
    );
  } catch {
    return unavailablePayload(config, requestTime, [failedSource()], true);
  }
}

async function fetchJsonWithTimeout(
  fetchImpl: FetchImplementation,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(FORECAST_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("forecast request failed");

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_CHARACTERS) {
      throw new Error("forecast response too large");
    }

    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) {
      throw new Error("forecast response too large");
    }
    return JSON.parse(body) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function forecastState(probability: number | null): CodexResetForecastState {
  if (probability == null || probability < 0.35) return "baseline";
  return probability >= 0.65 ? "likely" : "possible";
}

function expectedHorizon(
  now: number,
  probability24h: number | null,
  probability48h: number | null
): CodexResetForecastExpectedWindow | null {
  if ((probability24h ?? 0) >= 0.35) {
    return {
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 24 * HOUR_MS).toISOString(),
      precision: "horizon"
    };
  }
  if ((probability48h ?? 0) >= 0.35) {
    return {
      startAt: new Date(now + 24 * HOUR_MS).toISOString(),
      endAt: new Date(now + 48 * HOUR_MS).toISOString(),
      precision: "horizon"
    };
  }
  return null;
}

function failedSource(): NormalizedForecastSource {
  return {
    id: "codex-reset",
    label: SOURCE_LABEL,
    status: "error",
    updatedAt: null,
    updatedAtMs: null,
    lastResetAt: null,
    probability24h: null,
    probability48h: null,
    eventAt: null,
    confidence: "low",
    detail: "",
    evidenceUrl: null
  };
}

function toPublicSource(source: NormalizedForecastSource): CodexResetForecastSource {
  return {
    id: source.id,
    label: source.label,
    status: source.status,
    updatedAt: source.updatedAt,
    probability24h: source.probability24h,
    probability48h: source.probability48h,
    eventAt: source.eventAt,
    confidence: source.confidence,
    detail: source.detail,
    evidenceUrl: source.evidenceUrl
  };
}

function unavailablePayload(
  config: CodexResetForecastConfig,
  now: number,
  sources: NormalizedForecastSource[],
  stale: boolean
): CodexResetForecastPayload {
  return {
    enabled: config.enabled,
    fetchedAt: new Date(now).toISOString(),
    refreshIntervalSeconds: config.refreshIntervalSeconds,
    stale,
    state: "unavailable",
    probability24h: null,
    probability48h: null,
    lastResetAt: null,
    confidence: "low",
    expectedWindow: null,
    scope: { plans: ["all"], windows: ["7d"], uncertain: true },
    agreement: {
      healthySources: 0,
      contributingSources: 0,
      totalSources: 1,
      independentEvidence: 0
    },
    sources: sources.map(toPublicSource)
  };
}

function confidenceValue(value: unknown): CodexResetForecastConfidence {
  const confidence = stringValue(value).toLowerCase();
  if (confidence === "high") return "high";
  if (confidence === "medium" || confidence === "moderate") return "medium";
  return "low";
}

function probabilityValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed == null ? null : Math.max(0, Math.min(1, parsed));
}

function percentProbability(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed == null ? null : Math.max(0, Math.min(1, parsed / 100));
}

function firstEvidenceUrl(values: unknown[]): string | null {
  for (const value of values) {
    const url = safeEvidenceUrl(value);
    if (url) return url;
  }
  return null;
}

function safeEvidenceUrl(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  try {
    const url = new URL(text, FORECAST_URL);
    if (url.protocol !== "https:" || !ALLOWED_EVIDENCE_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function cleanText(value: unknown): string {
  return stringValue(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, MAX_DETAIL_CHARACTERS);
}

function dateValue(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: number | null): string | null {
  return value == null ? null : new Date(value).toISOString();
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function roundFour(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

class ForecastUnavailableError extends Error {
  constructor(readonly payload: CodexResetForecastPayload) {
    super("No usable Codex reset forecast");
    this.name = "ForecastUnavailableError";
  }
}
