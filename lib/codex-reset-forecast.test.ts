import { describe, expect, it, vi } from "vitest";

import {
  aggregateForecastSource,
  createCodexResetForecastService,
  normalizeForecastSource
} from "@/lib/codex-reset-forecast";

const now = Date.parse("2026-09-28T08:00:00Z");

describe("Codex Reset forecast normalization", () => {
  it("uses the site's displayed probabilities and verified last reset", () => {
    const source = normalizeForecastSource(forecastPayload(), now, 1800);

    expect(source).toMatchObject({
      id: "codex-reset",
      status: "ok",
      probability24h: 0.42,
      probability48h: 0.66,
      lastResetAt: "2026-09-26T18:17:54.000Z",
      detail: "Experimental forecast.",
      evidenceUrl: "https://x.com/thsottiaux/status/2103911959544610829"
    });

    const result = aggregateForecastSource(source, now, {
      enabled: true,
      refreshIntervalSeconds: 120
    });
    expect(result).toMatchObject({
      state: "likely",
      probability24h: 0.42,
      probability48h: 0.66,
      lastResetAt: "2026-09-26T18:17:54.000Z",
      scope: { plans: ["all"], windows: ["7d"], uncertain: true },
      agreement: { healthySources: 1, totalSources: 1 }
    });
  });

  it("falls back to raw probabilities and keeps 48h no lower than 24h", () => {
    const source = normalizeForecastSource(forecastPayload({
      probabilities: { raw_24h: 0.8, raw_48h: 0.2 }
    }), now, 1800);
    const result = aggregateForecastSource(source, now, {
      enabled: true,
      refreshIntervalSeconds: 120
    });
    expect(result.probability24h).toBe(0.8);
    expect(result.probability48h).toBe(0.8);
  });

  it("rejects stale, future-dated, and incomplete forecasts", () => {
    expect(normalizeForecastSource(forecastPayload({
      updated_at: "2026-09-28T07:00:00Z"
    }), now, 1800).status).toBe("stale");
    expect(normalizeForecastSource(forecastPayload({
      updated_at: "2026-09-28T09:00:00Z"
    }), now, 1800).status).toBe("invalid");
    expect(normalizeForecastSource(forecastPayload({ probabilities: {} }), now, 1800).status)
      .toBe("invalid");
    expect(normalizeForecastSource(null, now, 1800).status).toBe("invalid");
  });

  it("rejects future reset timestamps and unsafe evidence links", () => {
    const source = normalizeForecastSource(forecastPayload({
      last_reset_at: "2026-09-29T00:00:00Z",
      evidence: [{ href: "javascript:alert(1)", detail: "Unsafe link" }]
    }), now, 1800);
    expect(source.status).toBe("ok");
    expect(source.lastResetAt).toBeNull();
    expect(source.evidenceUrl).toBeNull();
  });

  it("accepts relative links only when they stay on the forecast site", () => {
    const source = normalizeForecastSource(forecastPayload({
      evidence: [{ href: "/timeline", detail: "Timeline" }]
    }), now, 1800);
    expect(source.evidenceUrl).toBe("https://codex-reset.com/timeline");
  });
});

describe("Codex Reset forecast service", () => {
  it("contacts only codex-reset.com and caches for the configured interval", async () => {
    let clock = now;
    const fetchMock = vi.fn(async (_input: string | URL | Request) => jsonResponse(forecastPayload()));
    const service = createCodexResetForecastService(config(fetchMock as typeof fetch, () => clock));

    await service.getForecast();
    await service.getForecast();
    clock += 119_999;
    await service.getForecast();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://codex-reset.com/api/forecast");

    clock += 2;
    await service.getForecast();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("merges concurrent refreshes", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async () => {
      await gate;
      return jsonResponse(forecastPayload());
    }) as typeof fetch;
    const service = createCodexResetForecastService(config(fetchImpl));

    const first = service.getForecast();
    const second = service.getForecast();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the last successful forecast and reset time after a failure", async () => {
    let clock = now;
    let fail = false;
    const fetchImpl = vi.fn(async () => {
      if (fail) throw new Error("network error");
      return jsonResponse(forecastPayload());
    }) as typeof fetch;
    const service = createCodexResetForecastService(config(fetchImpl, () => clock));

    const first = await service.getForecast();
    fail = true;
    clock += 120_001;
    const stale = await service.getForecast();
    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(first.fetchedAt);
    expect(stale.lastResetAt).toBe(first.lastResetAt);
    expect(stale.probability48h).toBe(first.probability48h);
  });

  it("returns unavailable on the first failure, bad data, or timeout", async () => {
    for (const fetchImpl of [
      vi.fn(async () => { throw new Error("network error"); }) as typeof fetch,
      vi.fn(async () => jsonResponse({ updated_at: new Date(now).toISOString() })) as typeof fetch
    ]) {
      const service = createCodexResetForecastService(config(fetchImpl));
      await expect(service.getForecast()).resolves.toMatchObject({
        state: "unavailable",
        stale: true,
        lastResetAt: null
      });
    }

    const slowFetch = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    ) as typeof fetch;
    const service = createCodexResetForecastService({
      ...config(slowFetch),
      requestTimeoutMs: 5
    });
    await expect(service.getForecast()).resolves.toMatchObject({
      state: "unavailable",
      stale: true
    });
  });

  it("does not fetch when disabled", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(forecastPayload())) as typeof fetch;
    const service = createCodexResetForecastService({
      ...config(fetchImpl),
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

function config(fetchImpl: typeof fetch, clock: () => number = () => now) {
  return {
    enabled: true,
    refreshIntervalSeconds: 120,
    requestTimeoutMs: 1000,
    maxAgeSeconds: 1800,
    fetchImpl,
    now: clock
  };
}

function forecastPayload(overrides: Record<string, unknown> = {}) {
  return {
    updated_at: "2026-09-28T07:58:00Z",
    probabilities: {
      raw_24h: 0.1703,
      raw_48h: 0.3116,
      rounded_24h: 42,
      rounded_48h: 66
    },
    confidence: "low",
    confidence_note: "Experimental forecast.",
    last_reset_at: "2026-09-26T18:17:54Z",
    evidence: [{
      href: "https://x.com/thsottiaux/status/2103911959544610829",
      detail: "Latest reset"
    }],
    ...overrides
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
