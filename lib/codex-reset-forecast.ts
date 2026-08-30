import type { CodexResetForecastConfig } from "@/lib/env";
import type {
  CodexResetForecastConfidence,
  CodexResetForecastExpectedWindow,
  CodexResetForecastPayload,
  CodexResetForecastScope,
  CodexResetForecastSource,
  CodexResetForecastSourceId,
  CodexResetForecastSourceStatus,
  UsageWindowKey
} from "@/lib/types";

type FetchImplementation = typeof fetch;

interface ForecastServiceOptions extends CodexResetForecastConfig {
  fetchImpl?: FetchImplementation;
  now?: () => number;
}

interface SourceDefinition {
  id: CodexResetForecastSourceId;
  label: string;
  url: string;
  weight: number;
}

interface ForecastEvent {
  at: number;
  precision: "datetime" | "date";
  explicit: boolean;
  confidence: number;
  scope: CodexResetForecastScope;
  evidenceUrl: string | null;
  evidenceKey: string | null;
  detail: string;
}

interface NormalizedForecastSource extends CodexResetForecastSource {
  weight: number;
  updatedAtMs: number | null;
  lastResetAtMs: number | null;
  event: ForecastEvent | null;
  explicitFloor24h: number | null;
  explicitFloor48h: number | null;
  evidenceKey: string | null;
}

interface CacheEntry {
  expiresAt: number;
  payload: CodexResetForecastPayload;
}

interface RecordValue {
  [key: string]: unknown;
}

export interface CodexResetForecastService {
  getForecast: () => Promise<CodexResetForecastPayload>;
}

const HOUR_MS = 60 * 60 * 1000;
const RESET_CLUSTER_MS = 6 * HOUR_MS;
const RESET_COHERENCE_LIMIT_MS = 24 * HOUR_MS;
const FUTURE_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_RESPONSE_CHARACTERS = 2_000_000;
const MAX_DETAIL_CHARACTERS = 320;

const SOURCE_DEFINITIONS: Record<CodexResetForecastSourceId, SourceDefinition> = {
  "codex-runway": {
    id: "codex-runway",
    label: "Codex Runway",
    url: "https://www.codexrunway.com/api/status.json",
    weight: 0.4
  },
  "codex-reset": {
    id: "codex-reset",
    label: "Codex Reset",
    url: "https://codex-reset.com/api/forecast",
    weight: 0.2
  },
  "save-me-tibo": {
    id: "save-me-tibo",
    label: "SaveMeTibo",
    url: "https://savemetibo.com/status.json",
    weight: 0.3
  },
  "codexreset-app": {
    id: "codexreset-app",
    label: "codexreset.app",
    url: "https://codexreset.app/api/signal",
    weight: 0.1
  }
};

const ALLOWED_EVIDENCE_HOSTS = new Set([
  "x.com",
  "twitter.com",
  "www.codexrunway.com",
  "codexrunway.com",
  "codex-reset.com",
  "www.codex-reset.com",
  "savemetibo.com",
  "www.savemetibo.com",
  "codexreset.app",
  "www.codexreset.app",
  "github.com",
  "status.openai.com"
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
    if (!options.enabled) {
      return unavailablePayload(options, now(), [], false);
    }

    const requestTime = now();
    if (cache && requestTime < cache.expiresAt) return cache.payload;
    if (inFlight) return inFlight;

    inFlight = fetchForecastSources(fetchImpl, options, now)
      .then((payload) => {
        if (payload.agreement.healthySources === 0) {
          throw new ForecastUnavailableError(payload);
        }
        lastSuccessfulPayload = payload;
        cache = {
          expiresAt: now() + refreshIntervalMs,
          payload
        };
        return payload;
      })
      .catch((error: unknown) => {
        const failedPayload = error instanceof ForecastUnavailableError
          ? error.payload
          : unavailablePayload(options, now(), [], true);
        const payload = lastSuccessfulPayload
          ? { ...lastSuccessfulPayload, stale: true }
          : { ...failedPayload, state: "unavailable" as const, stale: true };
        cache = {
          expiresAt: now() + refreshIntervalMs,
          payload
        };
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
    config.sources.join(","),
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
  id: CodexResetForecastSourceId,
  payload: unknown,
  now: number,
  maxAgeSeconds: number
): NormalizedForecastSource {
  const source = (() => {
    switch (id) {
      case "codex-runway":
        return normalizeRunway(payload, now);
      case "codex-reset":
        return normalizeCodexReset(payload);
      case "save-me-tibo":
        return normalizeSaveMeTibo(payload);
      case "codexreset-app":
        return normalizeCodexResetApp(payload);
    }
  })();

  if (source.status !== "ok") return source;
  if (source.updatedAtMs == null) return { ...source, status: "invalid" };
  if (source.updatedAtMs > now + FUTURE_CLOCK_SKEW_MS) {
    return { ...source, status: "invalid" };
  }
  if (now - source.updatedAtMs > maxAgeSeconds * 1000) {
    return { ...source, status: "stale" };
  }
  return source;
}

export function aggregateForecastSources(
  inputSources: NormalizedForecastSource[],
  now: number,
  config: Pick<CodexResetForecastConfig, "enabled" | "refreshIntervalSeconds">
): CodexResetForecastPayload {
  const sources = applyResetCoherence(inputSources);
  const healthy = sources.filter((source) => source.status === "ok");
  const probability24h = weightedProbability(healthy, "probability24h");
  let probability48h = weightedProbability(healthy, "probability48h");
  if (probability24h != null && probability48h == null) probability48h = probability24h;
  if (probability24h != null && probability48h != null) {
    probability48h = Math.max(probability24h, probability48h);
  }

  const explicitFloor24h = maxValue(healthy.map((source) => source.explicitFloor24h));
  const explicitFloor48h = maxValue(healthy.map((source) => source.explicitFloor48h));
  const adjusted24h = probability24h == null
    ? explicitFloor24h
    : Math.max(probability24h, explicitFloor24h ?? 0);
  let adjusted48h = probability48h == null
    ? explicitFloor48h ?? adjusted24h
    : Math.max(probability48h, explicitFloor48h ?? 0, adjusted24h ?? 0);
  if (adjusted24h != null && adjusted48h != null) {
    adjusted48h = Math.max(adjusted24h, adjusted48h);
  }

  const event = selectForecastEvent(healthy, now);
  const expectedWindow = event
    ? expectedWindowFromEvent(event)
    : expectedHorizon(now, adjusted24h, adjusted48h);
  const scope = event?.scope ?? defaultUncertainScope();
  const contributing = healthy.filter(
    (source) => source.probability24h != null || source.probability48h != null || source.event
  );
  const confidence = aggregateConfidence(contributing, Boolean(event?.explicit));
  const probability = adjusted48h ?? adjusted24h;
  const state = healthy.length === 0
    ? "unavailable"
    : forecastState(probability, Boolean(event?.explicit));
  const independentEvidence = new Set(
    healthy.map((source) => source.evidenceKey).filter((key): key is string => Boolean(key))
  ).size;

  return {
    enabled: config.enabled,
    fetchedAt: new Date(now).toISOString(),
    refreshIntervalSeconds: config.refreshIntervalSeconds,
    stale: false,
    state,
    probability24h: adjusted24h == null ? null : roundFour(adjusted24h),
    probability48h: adjusted48h == null ? null : roundFour(adjusted48h),
    confidence,
    expectedWindow,
    scope,
    agreement: {
      healthySources: healthy.length,
      contributingSources: contributing.length,
      totalSources: sources.length,
      independentEvidence
    },
    sources: sources.map(toPublicSource)
  };
}

async function fetchForecastSources(
  fetchImpl: FetchImplementation,
  config: CodexResetForecastConfig,
  now: () => number
): Promise<CodexResetForecastPayload> {
  const requestTime = now();
  const sources = await Promise.all(
    config.sources.map(async (id) => {
      const definition = SOURCE_DEFINITIONS[id];
      try {
        const payload = await fetchJsonWithTimeout(
          fetchImpl,
          definition.url,
          config.requestTimeoutMs
        );
        return normalizeForecastSource(id, payload, requestTime, config.maxAgeSeconds);
      } catch {
        return failedSource(id);
      }
    })
  );

  return aggregateForecastSources(sources, requestTime, config);
}

async function fetchJsonWithTimeout(
  fetchImpl: FetchImplementation,
  url: string,
  timeoutMs: number
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error("forecast source request failed");

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_CHARACTERS) {
      throw new Error("forecast source response too large");
    }

    const body = await response.text();
    if (body.length > MAX_RESPONSE_CHARACTERS) {
      throw new Error("forecast source response too large");
    }
    return JSON.parse(body) as unknown;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRunway(payload: unknown, now: number): NormalizedForecastSource {
  const definition = SOURCE_DEFINITIONS["codex-runway"];
  const record = asRecord(payload);
  const monitor = asRecord(record?.monitor);
  const updatedAtMs = dateValue(record?.lastSuccessfulCheckAt ?? record?.generatedAt);
  const events = Array.isArray(record?.events) ? record.events.map(asRecord).filter(isRecord) : [];
  const monitorOk = !monitor || stringValue(monitor.status).toLowerCase() === "ok";

  const scheduledEvents = events
    .filter((event) => stringValue(event.kind) === "reset_scheduled")
    .map((event) => runwayEvent(event, now))
    .filter((event): event is ForecastEvent => event !== null);
  const event = scheduledEvents.sort(compareEvents)[0] ?? null;
  const lastResetAtMs = maxNumber([
    ...events
      .filter((item) => stringValue(item.kind) === "reset_completed")
      .map((item) => dateValue(item.effectiveAt) ?? dateValue(item.announcedAt)),
    ...events
      .filter(
        (item) =>
          stringValue(item.kind) === "reset_scheduled" &&
          stringValue(item.scheduleBasis) === "explicit"
      )
      .map((item) => dateValue(item.effectiveAt) ?? dateValue(item.announcedAt))
      .filter((value): value is number => value != null && value <= now)
  ]);
  const probability24h = maxValue(
    scheduledEvents
      .filter((item) => item.at - now <= 24 * HOUR_MS)
      .map((item) => item.confidence)
  );
  const probability48h = maxValue(
    scheduledEvents
      .filter((item) => item.at - now <= 48 * HOUR_MS)
      .map((item) => item.confidence)
  );
  const explicitFloor24h = maxValue(
    scheduledEvents
      .filter((item) => item.explicit && item.at - now <= 24 * HOUR_MS)
      .map((item) => item.confidence)
  );
  const explicitFloor48h = maxValue(
    scheduledEvents
      .filter((item) => item.explicit && item.at - now <= 48 * HOUR_MS)
      .map((item) => item.confidence)
  );

  return {
    id: definition.id,
    label: definition.label,
    weight: definition.weight,
    status: monitorOk ? "ok" : "stale",
    updatedAt: isoDate(updatedAtMs),
    updatedAtMs,
    lastResetAtMs,
    probability24h,
    probability48h,
    eventAt: isoDate(event?.at ?? null),
    event,
    explicitFloor24h,
    explicitFloor48h,
    confidence: event ? probabilityConfidence(event.confidence) : "low",
    detail: event?.detail ?? "No upcoming reset signal is currently published.",
    evidenceUrl: event?.evidenceUrl ?? null,
    evidenceKey: event?.evidenceKey ?? null
  };
}

function runwayEvent(record: RecordValue, now: number): ForecastEvent | null {
  const at = dateValue(record.effectiveAt);
  if (at == null || at <= now || at - now > 48 * HOUR_MS) return null;

  const source = asRecord(record.source);
  const evidenceUrl = safeEvidenceUrl(source?.url, SOURCE_DEFINITIONS["codex-runway"].url);
  return {
    at,
    precision: stringValue(record.schedulePrecision) === "date" ? "date" : "datetime",
    explicit: stringValue(record.scheduleBasis) === "explicit",
    confidence: probabilityValue(record.confidence) ?? 0.5,
    scope: normalizeScope(record.scope),
    evidenceUrl,
    evidenceKey: evidenceKey(source?.postId, evidenceUrl, at, record.scope),
    detail: cleanText(record.rationale ?? record.text)
  };
}

function normalizeCodexReset(payload: unknown): NormalizedForecastSource {
  const definition = SOURCE_DEFINITIONS["codex-reset"];
  const record = asRecord(payload);
  const probabilities = asRecord(record?.probabilities);
  const evidence = Array.isArray(record?.evidence)
    ? record.evidence.map(asRecord).filter(isRecord)
    : [];
  const evidenceCandidates = evidence.map((item) => item.href);
  const evidenceUrl = firstEvidenceUrl(
    [
      ...evidenceCandidates.filter((item) => stringValue(item).includes("x.com/")),
      ...evidenceCandidates
    ],
    definition.url
  );
  const evidenceDetail = evidence.map((item) => cleanText(item.detail)).find(Boolean);
  const updatedAtMs = dateValue(record?.updated_at);

  return {
    id: definition.id,
    label: definition.label,
    weight: definition.weight,
    status: record ? "ok" : "invalid",
    updatedAt: isoDate(updatedAtMs),
    updatedAtMs,
    lastResetAtMs: dateValue(record?.last_reset_at),
    probability24h:
      probabilityValue(probabilities?.raw_24h) ?? percentProbability(probabilities?.rounded_24h),
    probability48h:
      probabilityValue(probabilities?.raw_48h) ?? percentProbability(probabilities?.rounded_48h),
    eventAt: null,
    event: null,
    explicitFloor24h: null,
    explicitFloor48h: null,
    confidence: confidenceValue(record?.confidence),
    detail: cleanText(record?.confidence_note) || evidenceDetail || "Experimental reset forecast.",
    evidenceUrl,
    evidenceKey: evidenceKey(null, evidenceUrl, null, null)
  };
}

function normalizeSaveMeTibo(payload: unknown): NormalizedForecastSource {
  const definition = SOURCE_DEFINITIONS["save-me-tibo"];
  const record = asRecord(payload);
  const freshness = asRecord(record?.freshness);
  const provider = asRecord(asRecord(record?.providers)?.codex);
  const receipts = Array.isArray(provider?.receipts)
    ? provider.receipts.map(asRecord).filter(isRecord)
    : [];
  const evidenceUrl = firstEvidenceUrl(
    [...receipts.map((item) => item.url), provider?.event_url],
    definition.url
  );
  const updatedAtMs = dateValue(
    freshness?.last_checked_at ?? record?.generated_at ?? provider?.updated_at
  );
  const declaredStale = booleanValue(provider?.stale) || booleanValue(freshness?.stale) || booleanValue(freshness?.outage);

  return {
    id: definition.id,
    label: definition.label,
    weight: definition.weight,
    status: !record || !provider ? "invalid" : declaredStale ? "stale" : "ok",
    updatedAt: isoDate(updatedAtMs),
    updatedAtMs,
    lastResetAtMs: null,
    probability24h: null,
    probability48h: percentProbability(provider?.chance_48h),
    eventAt: null,
    event: null,
    explicitFloor24h: null,
    explicitFloor48h: null,
    confidence: tierConfidence(provider?.evidence_tier),
    detail: cleanText(provider?.what_changed) || "Community reset watch.",
    evidenceUrl,
    evidenceKey: evidenceKey(receipts[0]?.evidence_id, evidenceUrl, null, null)
  };
}

function normalizeCodexResetApp(payload: unknown): NormalizedForecastSource {
  const definition = SOURCE_DEFINITIONS["codexreset-app"];
  const record = asRecord(payload);
  const forecast = asRecord(record?.forecast);
  const lastReset = asRecord(record?.lastConfirmedReset);
  const updatedAtMs = dateValue(record?.dataAsOf ?? record?.generatedAt);
  const evidenceUrl = safeEvidenceUrl(lastReset?.sourceUrl, definition.url);

  return {
    id: definition.id,
    label: definition.label,
    weight: definition.weight,
    status: !record || !forecast ? "invalid" : "ok",
    updatedAt: isoDate(updatedAtMs),
    updatedAtMs,
    lastResetAtMs: dateValue(lastReset?.timestamp),
    probability24h: percentProbability(forecast?.probability24h),
    probability48h: percentProbability(forecast?.probability48h),
    eventAt: null,
    event: null,
    explicitFloor24h: null,
    explicitFloor48h: null,
    confidence: confidenceValue(forecast?.confidence),
    detail: cleanText(forecast?.narrative) || "Community reset forecast.",
    evidenceUrl,
    evidenceKey: evidenceKey(lastReset?.id, evidenceUrl, null, null)
  };
}

function applyResetCoherence(
  sources: NormalizedForecastSource[]
): NormalizedForecastSource[] {
  const resetSources = sources.filter(
    (source) => source.status === "ok" && source.lastResetAtMs != null
  );
  const clusters = resetSources
    .map((anchor) => {
      const members = resetSources.filter(
        (candidate) =>
          Math.abs((candidate.lastResetAtMs ?? 0) - (anchor.lastResetAtMs ?? 0)) <= RESET_CLUSTER_MS
      );
      return {
        newest: maxNumber(members.map((member) => member.lastResetAtMs)),
        members
      };
    })
    .filter((cluster) => cluster.members.length >= 2)
    .sort((a, b) => (b.newest ?? 0) - (a.newest ?? 0));
  const consensus = clusters[0]?.newest ?? null;
  if (consensus == null) return sources;

  return sources.map((source) => {
    if (
      source.status === "ok" &&
      source.lastResetAtMs != null &&
      consensus - source.lastResetAtMs > RESET_COHERENCE_LIMIT_MS
    ) {
      return { ...source, status: "invalid" };
    }
    return source;
  });
}

function weightedProbability(
  sources: NormalizedForecastSource[],
  key: "probability24h" | "probability48h"
): number | null {
  const contributing = sources.filter((source) => source[key] != null);
  const totalWeight = contributing.reduce((sum, source) => sum + source.weight, 0);
  if (totalWeight <= 0) return null;
  return contributing.reduce(
    (sum, source) => sum + (source[key] ?? 0) * source.weight,
    0
  ) / totalWeight;
}

function aggregateConfidence(
  sources: NormalizedForecastSource[],
  hasExplicitEvent: boolean
): CodexResetForecastConfidence {
  if (hasExplicitEvent) return "high";
  if (sources.length <= 1) return "low";

  const probabilities = sources
    .map((source) => source.probability48h ?? source.probability24h)
    .filter((value): value is number => value != null);
  const dispersion = probabilities.length > 1
    ? Math.max(...probabilities) - Math.min(...probabilities)
    : 0;
  if (sources.length >= 3 && dispersion <= 0.2) return "high";
  if (dispersion > 0.35) return "low";
  return "medium";
}

function forecastState(
  probability: number | null,
  hasExplicitEvent: boolean
): CodexResetForecastPayload["state"] {
  if (hasExplicitEvent) return "scheduled";
  if (probability == null) return "baseline";
  if (probability >= 0.65) return "likely";
  if (probability >= 0.35) return "possible";
  return "baseline";
}

function selectForecastEvent(
  sources: NormalizedForecastSource[],
  now: number
): ForecastEvent | null {
  return sources
    .map((source) => source.event)
    .filter((event): event is ForecastEvent => event != null && event.at > now)
    .sort(compareEvents)[0] ?? null;
}

function compareEvents(a: ForecastEvent, b: ForecastEvent): number {
  if (a.explicit !== b.explicit) return a.explicit ? -1 : 1;
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  return a.at - b.at;
}

function expectedWindowFromEvent(event: ForecastEvent): CodexResetForecastExpectedWindow {
  if (event.precision === "date") {
    return {
      startAt: new Date(event.at - 12 * HOUR_MS).toISOString(),
      endAt: new Date(event.at + 12 * HOUR_MS).toISOString(),
      precision: "date"
    };
  }
  const at = new Date(event.at).toISOString();
  return { startAt: at, endAt: at, precision: "datetime" };
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

function normalizeScope(value: unknown): CodexResetForecastScope {
  const record = asRecord(value);
  const rawPlans = Array.isArray(record?.plans) ? record.plans : [];
  const plans = Array.from(new Set(rawPlans.map(normalizePlan).filter(Boolean)));
  const rawWindows = Array.isArray(record?.windows) ? record.windows : [];
  const windows = Array.from(
    new Set(rawWindows.map(normalizeWindow).filter((item): item is UsageWindowKey => item !== null))
  );
  const uncertain = windows.length === 0;

  return {
    plans: plans.length > 0 ? plans : ["all"],
    windows: windows.length > 0 ? windows : ["7d"],
    uncertain
  };
}

function defaultUncertainScope(): CodexResetForecastScope {
  return { plans: ["all"], windows: ["7d"], uncertain: true };
}

function normalizePlan(value: unknown): string {
  const plan = stringValue(value).toLowerCase().replace(/[\s_-]+/g, "-");
  if (plan === "all") return "all";
  return /^[a-z0-9-]{1,48}$/.test(plan) ? plan : "";
}

function normalizeWindow(value: unknown): UsageWindowKey | null {
  const window = stringValue(value).toLowerCase().replace(/[\s_-]+/g, "");
  if (["5h", "fivehour", "hourly"].includes(window)) return "5h";
  if (["7d", "sevenday", "weekly"].includes(window)) return "7d";
  return null;
}

function failedSource(id: CodexResetForecastSourceId): NormalizedForecastSource {
  const definition = SOURCE_DEFINITIONS[id];
  return {
    id,
    label: definition.label,
    weight: definition.weight,
    status: "error",
    updatedAt: null,
    updatedAtMs: null,
    lastResetAtMs: null,
    probability24h: null,
    probability48h: null,
    eventAt: null,
    event: null,
    explicitFloor24h: null,
    explicitFloor48h: null,
    confidence: "low",
    detail: "Source request failed.",
    evidenceUrl: null,
    evidenceKey: null
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
    confidence: "low",
    expectedWindow: null,
    scope: defaultUncertainScope(),
    agreement: {
      healthySources: 0,
      contributingSources: 0,
      totalSources: config.sources.length,
      independentEvidence: 0
    },
    sources: sources.map(toPublicSource)
  };
}

function probabilityConfidence(value: number): CodexResetForecastConfidence {
  if (value >= 0.8) return "high";
  if (value >= 0.55) return "medium";
  return "low";
}

function confidenceValue(value: unknown): CodexResetForecastConfidence {
  const confidence = stringValue(value).toLowerCase();
  if (confidence === "high") return "high";
  if (confidence === "medium" || confidence === "moderate") return "medium";
  return "low";
}

function tierConfidence(value: unknown): CodexResetForecastConfidence {
  const tier = stringValue(value).toLowerCase();
  if (tier.includes("official") || tier.includes("strong")) return "high";
  if (tier.includes("corroborated") || tier.includes("multiple")) return "medium";
  return "low";
}

function probabilityValue(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed == null) return null;
  return Math.max(0, Math.min(1, parsed));
}

function percentProbability(value: unknown): number | null {
  const parsed = numberValue(value);
  if (parsed == null) return null;
  return Math.max(0, Math.min(1, parsed / 100));
}

function firstEvidenceUrl(values: unknown[], baseUrl: string): string | null {
  for (const value of values) {
    const url = safeEvidenceUrl(value, baseUrl);
    if (url) return url;
  }
  return null;
}

function safeEvidenceUrl(value: unknown, baseUrl: string): string | null {
  const text = stringValue(value);
  if (!text) return null;
  try {
    const url = new URL(text, baseUrl);
    if (url.protocol !== "https:" || !ALLOWED_EVIDENCE_HOSTS.has(url.hostname.toLowerCase())) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function evidenceKey(
  id: unknown,
  url: string | null,
  eventAt: number | null,
  scope: unknown
): string | null {
  const identifier = stringValue(id);
  if (/^\d{8,}$/.test(identifier)) return `x:${identifier}`;
  if (url) {
    const postMatch = url.match(/\/status\/(\d+)/);
    if (postMatch) return `x:${postMatch[1]}`;
    return `url:${url.replace(/[?#].*$/, "")}`;
  }
  if (eventAt != null) return `event:${eventAt}:${JSON.stringify(scope ?? {})}`;
  return identifier ? `id:${identifier}` : null;
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

function maxValue(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value != null && Number.isFinite(value));
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

function maxNumber(values: Array<number | null>): number | null {
  return maxValue(values);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 1 || stringValue(value).toLowerCase() === "true";
}

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null ? (value as RecordValue) : null;
}

function isRecord(value: RecordValue | null): value is RecordValue {
  return value !== null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function roundFour(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

class ForecastUnavailableError extends Error {
  constructor(readonly payload: CodexResetForecastPayload) {
    super("No usable Codex reset forecast sources");
    this.name = "ForecastUnavailableError";
  }
}
