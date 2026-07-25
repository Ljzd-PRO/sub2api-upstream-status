import type { OpenAIStatusConfig } from "@/lib/env";
import type {
  OpenAIIncidentStatus,
  OpenAIStatusIncident,
  OpenAIStatusIndicator,
  OpenAIStatusPayload,
  OpenAIStatusUpdate
} from "@/lib/types";

const STATUS_URL = "https://status.openai.com/api/v2/status.json";
const INCIDENTS_URL = "https://status.openai.com/api/v2/incidents.json";
const INCIDENT_URL_PREFIX = "https://status.openai.com/incidents/";

type FetchImplementation = typeof fetch;

interface OpenAIStatusServiceOptions extends OpenAIStatusConfig {
  fetchImpl?: FetchImplementation;
  now?: () => number;
}

interface CacheEntry {
  expiresAt: number;
  payload: OpenAIStatusPayload;
}

interface RecordValue {
  [key: string]: unknown;
}

export interface OpenAIStatusService {
  getStatus: () => Promise<OpenAIStatusPayload>;
}

export function createOpenAIStatusService(
  options: OpenAIStatusServiceOptions
): OpenAIStatusService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const refreshIntervalMs = options.refreshIntervalSeconds * 1000;
  let cache: CacheEntry | null = null;
  let inFlight: Promise<OpenAIStatusPayload> | null = null;

  const getStatus = async (): Promise<OpenAIStatusPayload> => {
    const requestTime = now();
    if (cache && requestTime < cache.expiresAt) {
      return cache.payload;
    }
    if (inFlight) return inFlight;

    inFlight = fetchOpenAIStatus(fetchImpl, options, now)
      .then((payload) => {
        cache = {
          expiresAt: now() + refreshIntervalMs,
          payload
        };
        return payload;
      })
      .catch(() => {
        const payload = cache
          ? { ...cache.payload, stale: true }
          : unavailablePayload(options.refreshIntervalSeconds, now());
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

  return { getStatus };
}

let sharedService: OpenAIStatusService | null = null;
let sharedConfigKey = "";

export function getOpenAIStatusService(
  config: OpenAIStatusConfig
): OpenAIStatusService {
  const configKey = `${config.refreshIntervalSeconds}:${config.requestTimeoutMs}`;
  if (!sharedService || sharedConfigKey !== configKey) {
    sharedService = createOpenAIStatusService(config);
    sharedConfigKey = configKey;
  }
  return sharedService;
}

export function normalizeOpenAIStatus(
  statusPayload: unknown,
  incidentsPayload: unknown,
  fetchedAt: string,
  refreshIntervalSeconds: number
): OpenAIStatusPayload {
  const statusRecord = asRecord(asRecord(statusPayload)?.status);
  const incidentsRecord = asRecord(incidentsPayload);
  const incidents = Array.isArray(incidentsRecord?.incidents)
    ? incidentsRecord.incidents
        .map(normalizeIncident)
        .filter((incident): incident is OpenAIStatusIncident => incident !== null)
        .filter((incident) => incident.status !== "resolved")
        .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
    : [];

  const upstreamIndicator = normalizeIndicator(statusRecord?.indicator);
  const indicator = incidents.length > 0
    ? highestIncidentIndicator(incidents, upstreamIndicator)
    : upstreamIndicator;

  return {
    fetchedAt,
    refreshIntervalSeconds,
    stale: false,
    overall: {
      indicator,
      description: stringValue(statusRecord?.description) || ""
    },
    incidents
  };
}

async function fetchOpenAIStatus(
  fetchImpl: FetchImplementation,
  config: OpenAIStatusConfig,
  now: () => number
): Promise<OpenAIStatusPayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const [statusResponse, incidentsResponse] = await Promise.all([
      fetchImpl(STATUS_URL, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      }),
      fetchImpl(INCIDENTS_URL, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      })
    ]);

    if (!statusResponse.ok || !incidentsResponse.ok) {
      throw new Error("OpenAI status request failed");
    }

    const [statusPayload, incidentsPayload] = await Promise.all([
      statusResponse.json() as Promise<unknown>,
      incidentsResponse.json() as Promise<unknown>
    ]);

    return normalizeOpenAIStatus(
      statusPayload,
      incidentsPayload,
      new Date(now()).toISOString(),
      config.refreshIntervalSeconds
    );
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIncident(value: unknown): OpenAIStatusIncident | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = stringValue(record.id);
  const name = stringValue(record.name);
  const resolvedAt = nullableDate(record.resolved_at);
  if (!id || !name || resolvedAt) return null;

  const status = normalizeIncidentStatus(record.status);
  const updates = Array.isArray(record.incident_updates)
    ? record.incident_updates
        .map(normalizeUpdate)
        .filter((update): update is OpenAIStatusUpdate => update !== null)
        .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
    : [];

  return {
    id,
    name,
    impact: normalizeIndicator(record.impact),
    status,
    updatedAt: nullableDate(record.updated_at),
    latestUpdate: updates[0] ?? null,
    url: `${INCIDENT_URL_PREFIX}${encodeURIComponent(id)}`
  };
}

function normalizeUpdate(value: unknown): OpenAIStatusUpdate | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    body: stringValue(record.body).slice(0, 5000),
    status: normalizeIncidentStatus(record.status),
    updatedAt:
      nullableDate(record.display_at) ??
      nullableDate(record.updated_at) ??
      nullableDate(record.created_at)
  };
}

function normalizeIndicator(value: unknown): OpenAIStatusIndicator {
  switch (stringValue(value).toLowerCase()) {
    case "none":
      return "none";
    case "minor":
    case "degraded_performance":
      return "minor";
    case "major":
    case "partial_outage":
      return "major";
    case "critical":
    case "full_outage":
      return "critical";
    case "maintenance":
    case "under_maintenance":
      return "maintenance";
    default:
      return "unknown";
  }
}

function normalizeIncidentStatus(value: unknown): OpenAIIncidentStatus {
  switch (stringValue(value).toLowerCase()) {
    case "investigating":
      return "investigating";
    case "identified":
      return "identified";
    case "monitoring":
      return "monitoring";
    case "resolved":
      return "resolved";
    default:
      return "unknown";
  }
}

function highestIncidentIndicator(
  incidents: OpenAIStatusIncident[],
  fallback: OpenAIStatusIndicator
): OpenAIStatusIndicator {
  const indicators = incidents.map((incident) => incident.impact);
  const known = indicators.filter((indicator) => indicator !== "unknown");
  if (known.length === 0) {
    return fallback === "none" ? "unknown" : fallback;
  }

  return known.reduce((highest, current) =>
    indicatorRank(current) > indicatorRank(highest) ? current : highest
  );
}

function indicatorRank(indicator: OpenAIStatusIndicator): number {
  switch (indicator) {
    case "critical":
      return 4;
    case "major":
      return 3;
    case "minor":
      return 2;
    case "maintenance":
      return 1;
    default:
      return 0;
  }
}

function unavailablePayload(
  refreshIntervalSeconds: number,
  timestamp: number
): OpenAIStatusPayload {
  return {
    fetchedAt: new Date(timestamp).toISOString(),
    refreshIntervalSeconds,
    stale: true,
    overall: {
      indicator: "unknown",
      description: ""
    },
    incidents: []
  };
}

function asRecord(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null
    ? (value as RecordValue)
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableDate(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function dateValue(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
