import { describe, expect, it, vi } from "vitest";

import {
  aggregateForecastSources,
  createCodexResetForecastService,
  normalizeForecastSource
} from "@/lib/codex-reset-forecast";
import type { CodexResetForecastSourceId } from "@/lib/types";

const now = Date.parse("2026-08-30T00:00:00Z");

describe("forecast source adapters", () => {
  it("normalizes an explicit Runway event and its plan/window scope", () => {
    const source = normalizeForecastSource(
      "codex-runway",
      runwayPayload({ explicit: true, confidence: 0.92 }),
      now,
      1800
    );

    expect(source).toMatchObject({
      status: "ok",
      probability24h: 0.92,
      probability48h: 0.92,
      eventAt: "2026-08-30T06:00:00.000Z",
      confidence: "high"
    });
    expect(source.event?.scope).toEqual({
      plans: ["pro"],
      windows: ["7d"],
      uncertain: false
    });
    expect(source.explicitFloor24h).toBe(0.92);
  });

  it("normalizes probability feeds and rejects unsafe evidence links", () => {
    const codexReset = normalizeForecastSource(
      "codex-reset",
      codexResetPayload(),
      now,
      1800
    );
    const saveMeTibo = normalizeForecastSource(
      "save-me-tibo",
      saveMeTiboPayload({ receiptUrl: "javascript:alert(1)" }),
      now,
      1800
    );
    expect(codexReset).toMatchObject({ probability24h: 0.4, probability48h: 0.6 });
    expect(saveMeTibo).toMatchObject({ probability24h: null, probability48h: 0.9 });
    expect(saveMeTibo.evidenceUrl).toBeNull();
  });

  it("marks old, future-dated, and source-declared stale payloads unusable", () => {
    const old = normalizeForecastSource(
      "codex-reset",
      codexResetPayload({ updatedAt: "2026-08-29T22:00:00Z" }),
      now,
      1800
    );
    const future = normalizeForecastSource(
      "codex-reset",
      codexResetPayload({ updatedAt: "2026-08-30T01:00:00Z" }),
      now,
      1800
    );
    const declaredStale = normalizeForecastSource(
      "save-me-tibo",
      saveMeTiboPayload({ stale: true }),
      now,
      1800
    );

    expect(old.status).toBe("stale");
    expect(future.status).toBe("invalid");
    expect(declaredStale.status).toBe("stale");
  });
});

describe("aggregateForecastSources", () => {
  it("weights fresh sources and deduplicates shared evidence", () => {
    const sources = [
      normalizeForecastSource("codex-runway", runwayPayload(), now, 1800),
      normalizeForecastSource("codex-reset", codexResetPayload(), now, 1800),
      normalizeForecastSource("save-me-tibo", saveMeTiboPayload(), now, 1800)
    ];
    const payload = aggregateForecastSources(sources, now, {
      enabled: true,
      refreshIntervalSeconds: 120
    });

    expect(payload.probability24h).toBe(0.6667);
    expect(payload.probability48h).toBe(0.7889);
    expect(payload.state).toBe("likely");
    expect(payload.scope).toEqual({ plans: ["pro"], windows: ["7d"], uncertain: false });
    expect(payload.agreement).toEqual({
      healthySources: 3,
      contributingSources: 3,
      totalSources: 3,
      independentEvidence: 2
    });
  });

  it("uses an explicit event as a probability floor", () => {
    const payload = aggregateForecastSources(
      [
        normalizeForecastSource(
          "codex-runway",
          runwayPayload({ explicit: true, confidence: 0.92 }),
          now,
          1800
        ),
        normalizeForecastSource(
          "codex-reset",
          codexResetPayload({ probability24h: 0.2, probability48h: 0.3 }),
          now,
          1800
        )
      ],
      now,
      { enabled: true, refreshIntervalSeconds: 120 }
    );

    expect(payload.probability24h).toBe(0.92);
    expect(payload.probability48h).toBe(0.92);
    expect(payload.state).toBe("scheduled");
    expect(payload.confidence).toBe("high");
  });

  it("returns unavailable when no source passes validation", () => {
    const payload = aggregateForecastSources(
      [normalizeForecastSource(
        "codex-reset",
        codexResetPayload({ updatedAt: "2026-08-29T20:00:00Z" }),
        now,
        1800
      )],
      now,
      { enabled: true, refreshIntervalSeconds: 120 }
    );

    expect(payload.state).toBe("unavailable");
    expect(payload.agreement.healthySources).toBe(0);
  });

  it.each([
    [0.2, "baseline"],
    [0.4, "possible"],
    [0.8, "likely"]
  ] as const)("maps a %s probability to the %s state", (probability, state) => {
    const payload = aggregateForecastSources(
      [normalizeForecastSource(
        "codex-reset",
        codexResetPayload({ probability24h: probability, probability48h: probability }),
        now,
        1800
      )],
      now,
      { enabled: true, refreshIntervalSeconds: 120 }
    );

    expect(payload.state).toBe(state);
  });

  it("never returns a 48-hour probability below the 24-hour probability", () => {
    const payload = aggregateForecastSources(
      [normalizeForecastSource(
        "codex-reset",
        codexResetPayload({ probability24h: 0.8, probability48h: 0.2 }),
        now,
        1800
      )],
      now,
      { enabled: true, refreshIntervalSeconds: 120 }
    );

    expect(payload.probability24h).toBe(0.8);
    expect(payload.probability48h).toBe(0.8);
  });
});

describe("createCodexResetForecastService", () => {
  it("caches a result for the configured interval", async () => {
    let clock = now;
    const fetchImpl = vi.fn(async () => jsonResponse(codexResetPayload())) as typeof fetch;
    const service = createCodexResetForecastService(config(["codex-reset"], fetchImpl, () => clock));

    await service.getForecast();
    await service.getForecast();
    clock += 119_999;
    await service.getForecast();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock += 2;
    await service.getForecast();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("merges concurrent refreshes", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return jsonResponse(codexResetPayload());
    }) as typeof fetch;
    const service = createCodexResetForecastService(config(["codex-reset"], fetchImpl));

    const first = service.getForecast();
    const second = service.getForecast();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps partial results when one source fails", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes("savemetibo")) throw new Error("network error");
      return jsonResponse(codexResetPayload());
    }) as typeof fetch;
    const service = createCodexResetForecastService(
      config(["codex-reset", "save-me-tibo"], fetchImpl)
    );

    const payload = await service.getForecast();
    expect(payload.state).not.toBe("unavailable");
    expect(payload.agreement).toMatchObject({ healthySources: 1, totalSources: 2 });
    expect(payload.sources.find((source) => source.id === "save-me-tibo")?.status).toBe("error");
  });

  it("serves the last successful payload as stale after an upstream failure", async () => {
    let clock = now;
    let fail = false;
    const fetchImpl = vi.fn(async () => {
      if (fail) throw new Error("network error");
      return jsonResponse(codexResetPayload());
    }) as typeof fetch;
    const service = createCodexResetForecastService(config(["codex-reset"], fetchImpl, () => clock));

    const first = await service.getForecast();
    fail = true;
    clock += 120_001;
    const stale = await service.getForecast();

    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(first.fetchedAt);
    expect(stale.probability48h).toBe(first.probability48h);
  });

  it("returns unavailable on a first failure or timeout", async () => {
    const failed = createCodexResetForecastService(
      config(["codex-reset"], vi.fn(async () => {
        throw new Error("network error");
      }) as typeof fetch)
    );
    await expect(failed.getForecast()).resolves.toMatchObject({
      state: "unavailable",
      stale: true
    });

    const slowFetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    ) as typeof fetch;
    const timedOut = createCodexResetForecastService({
      ...config(["codex-reset"], slowFetch),
      requestTimeoutMs: 5
    });
    await expect(timedOut.getForecast()).resolves.toMatchObject({
      state: "unavailable",
      stale: true
    });
  });

  it("does not contact sources when the feature is disabled", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(codexResetPayload())) as typeof fetch;
    const service = createCodexResetForecastService({
      ...config(["codex-reset"], fetchImpl),
      enabled: false
    });

    await expect(service.getForecast()).resolves.toMatchObject({
      enabled: false,
      state: "unavailable",
      stale: false
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function config(
  sources: CodexResetForecastSourceId[],
  fetchImpl: typeof fetch,
  clock: () => number = () => now
) {
  return {
    enabled: true,
    sources,
    refreshIntervalSeconds: 120,
    requestTimeoutMs: 1000,
    maxAgeSeconds: 1800,
    fetchImpl,
    now: clock
  };
}

function runwayPayload({
  explicit = false,
  confidence = 0.8
}: {
  explicit?: boolean;
  confidence?: number;
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-29T23:59:00Z",
    lastSuccessfulCheckAt: "2026-08-29T23:59:00Z",
    monitor: { status: "ok" },
    events: [
      {
        kind: "reset_scheduled",
        resetType: "global",
        announcedAt: "2026-08-29T23:50:00Z",
        effectiveAt: "2026-08-30T06:00:00Z",
        schedulePrecision: "datetime",
        scheduleBasis: explicit ? "explicit" : "contextual_inference",
        scope: { plans: ["pro"], windows: ["weekly"] },
        source: {
          postId: "2222222222222222222",
          url: "https://x.com/thsottiaux/status/2222222222222222222"
        },
        confidence,
        rationale: "Upcoming reset signal."
      },
      {
        kind: "reset_completed",
        announcedAt: "2026-08-29T20:00:00Z",
        effectiveAt: "2026-08-29T20:00:00Z",
        scope: { plans: ["all"], windows: ["unknown"] }
      }
    ]
  };
}

function codexResetPayload({
  updatedAt = "2026-08-29T23:58:00Z",
  probability24h = 0.4,
  probability48h = 0.6
}: {
  updatedAt?: string;
  probability24h?: number;
  probability48h?: number;
} = {}) {
  return {
    updated_at: updatedAt,
    probabilities: { raw_24h: probability24h, raw_48h: probability48h },
    confidence: "medium",
    confidence_note: "Experimental forecast.",
    last_reset_at: "2026-08-29T20:30:00Z",
    evidence: [
      {
        href: "https://x.com/thsottiaux/status/1111111111111111111",
        detail: "Latest reset"
      }
    ]
  };
}

function saveMeTiboPayload({
  receiptUrl = "https://x.com/thsottiaux/status/1111111111111111111",
  stale = false
}: {
  receiptUrl?: string;
  stale?: boolean;
} = {}) {
  return {
    generated_at: "2026-08-29T23:57:00Z",
    freshness: { stale, outage: false },
    providers: {
      codex: {
        chance_48h: 90,
        evidence_tier: "official_signal",
        stale,
        updated_at: "2026-08-29T23:57:00Z",
        what_changed: "A reset may happen soon.",
        receipts: [{ evidence_id: "receipt-1", url: receiptUrl }]
      }
    }
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
