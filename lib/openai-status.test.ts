import { describe, expect, it, vi } from "vitest";

import {
  createOpenAIStatusService,
  normalizeOpenAIStatus
} from "@/lib/openai-status";

const statusPayload = {
  status: {
    description: "All Systems Operational",
    indicator: "none"
  }
};

describe("normalizeOpenAIStatus", () => {
  it("keeps active incidents, sorts them, and uses the highest impact", () => {
    const payload = normalizeOpenAIStatus(
      statusPayload,
      {
        incidents: [
          {
            id: "minor-old",
            name: "Minor issue",
            impact: "minor",
            status: "monitoring",
            updated_at: "2026-07-25T10:00:00Z",
            resolved_at: null,
            incident_updates: [
              {
                body: "Earlier update",
                status: "identified",
                display_at: "2026-07-25T09:00:00Z"
              },
              {
                body: "Latest update",
                status: "monitoring",
                display_at: "2026-07-25T10:00:00Z"
              }
            ]
          },
          {
            id: "critical-new",
            name: "Critical issue",
            impact: "critical",
            status: "investigating",
            updated_at: "2026-07-25T11:00:00Z",
            resolved_at: null,
            incident_updates: []
          },
          {
            id: "resolved-status",
            name: "Resolved issue",
            impact: "major",
            status: "resolved",
            updated_at: "2026-07-25T12:00:00Z",
            resolved_at: null
          },
          {
            id: "resolved-date",
            name: "Resolved by date",
            impact: "major",
            status: "monitoring",
            updated_at: "2026-07-25T13:00:00Z",
            resolved_at: "2026-07-25T13:05:00Z"
          }
        ]
      },
      "2026-07-25T12:00:00.000Z",
      10
    );

    expect(payload.overall.indicator).toBe("critical");
    expect(payload.incidents.map((incident) => incident.id)).toEqual([
      "critical-new",
      "minor-old"
    ]);
    expect(payload.incidents[1].latestUpdate).toMatchObject({
      body: "Latest update",
      status: "monitoring",
      updatedAt: "2026-07-25T10:00:00.000Z"
    });
    expect(payload.incidents[0].url).toBe(
      "https://status.openai.com/incidents/critical-new"
    );
  });

  it("supports maintenance aliases and unknown upstream values", () => {
    const maintenance = normalizeOpenAIStatus(
      { status: { indicator: "under_maintenance", description: "Maintenance" } },
      { incidents: [] },
      "2026-07-25T12:00:00.000Z",
      10
    );
    const unknown = normalizeOpenAIStatus(
      statusPayload,
      {
        incidents: [
          {
            id: "unknown",
            name: "Unknown issue",
            impact: "new-impact",
            status: "new-state",
            updated_at: "not-a-date"
          }
        ]
      },
      "2026-07-25T12:00:00.000Z",
      10
    );

    expect(maintenance.overall.indicator).toBe("maintenance");
    expect(unknown.overall.indicator).toBe("unknown");
    expect(unknown.incidents[0]).toMatchObject({
      impact: "unknown",
      status: "unknown",
      updatedAt: null
    });
  });

  it("returns an operational payload when no incidents are active", () => {
    const payload = normalizeOpenAIStatus(
      statusPayload,
      { incidents: [] },
      "2026-07-25T12:00:00.000Z",
      10
    );

    expect(payload).toMatchObject({
      stale: false,
      overall: {
        indicator: "none",
        description: "All Systems Operational"
      },
      incidents: []
    });
  });
});

describe("createOpenAIStatusService", () => {
  it("caches results for the refresh interval", async () => {
    let now = Date.parse("2026-07-25T12:00:00Z");
    const fetchImpl = createSuccessfulFetch([]);
    const service = createOpenAIStatusService({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 1000,
      fetchImpl,
      now: () => now
    });

    await service.getStatus();
    await service.getStatus();
    now += 9999;
    await service.getStatus();
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    now += 2;
    await service.getStatus();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("deduplicates concurrent refreshes", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      await gate;
      return responseFor(input, []);
    }) as typeof fetch;
    const service = createOpenAIStatusService({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 1000,
      fetchImpl
    });

    const first = service.getStatus();
    const second = service.getStatus();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    release?.();
    await Promise.all([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("serves the last successful result as stale after an upstream error", async () => {
    let now = Date.parse("2026-07-25T12:00:00Z");
    let shouldFail = false;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      if (shouldFail) throw new Error("network error");
      return responseFor(input, [
        {
          id: "active",
          name: "Active issue",
          impact: "minor",
          status: "investigating",
          updated_at: "2026-07-25T11:59:00Z",
          resolved_at: null
        }
      ]);
    }) as typeof fetch;
    const service = createOpenAIStatusService({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 1000,
      fetchImpl,
      now: () => now
    });

    const first = await service.getStatus();
    shouldFail = true;
    now += 10001;
    const stale = await service.getStatus();

    expect(first.stale).toBe(false);
    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(first.fetchedAt);
    expect(stale.incidents[0].id).toBe("active");
  });

  it("returns an unavailable payload when the first request fails", async () => {
    const service = createOpenAIStatusService({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 1000,
      fetchImpl: vi.fn(async () => {
        throw new Error("network error");
      }) as typeof fetch,
      now: () => Date.parse("2026-07-25T12:00:00Z")
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      stale: true,
      overall: { indicator: "unknown" },
      incidents: []
    });
  });

  it("aborts slow upstream requests at the configured timeout", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    ) as typeof fetch;
    const service = createOpenAIStatusService({
      refreshIntervalSeconds: 10,
      requestTimeoutMs: 5,
      fetchImpl
    });

    await expect(service.getStatus()).resolves.toMatchObject({
      stale: true,
      overall: { indicator: "unknown" }
    });
  });
});

function createSuccessfulFetch(incidents: unknown[]) {
  return vi.fn(async (input: string | URL | Request) =>
    responseFor(input, incidents)
  ) as typeof fetch;
}

function responseFor(input: string | URL | Request, incidents: unknown[]) {
  const body = String(input).includes("/status.json")
    ? statusPayload
    : { incidents };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
