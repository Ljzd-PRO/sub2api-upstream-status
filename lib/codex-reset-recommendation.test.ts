import { describe, expect, it } from "vitest";

import { computeForecastRecommendation } from "@/lib/codex-reset-recommendation";
import type {
  CodexResetForecastPayload,
  PanelUsageWindow,
  UsageWindowKey
} from "@/lib/types";

const now = Date.parse("2026-08-30T12:00:00Z");

describe("computeForecastRecommendation", () => {
  it("uses elapsed time as the baseline when no forecast is available", () => {
    const result = computeForecastRecommendation(
      usageWindow("7d", "2026-09-03T12:00:00Z"),
      "pro",
      null,
      now
    );

    expect(result).toEqual({
      timeProgressUtilization: 42.9,
      recommendedUtilization: 42.9,
      forecastApplied: false,
      forecastProbability: null
    });
  });

  it("continuously weights the 24h and 48h early-reset probability", () => {
    const result = computeForecastRecommendation(
      usageWindow("7d", "2026-09-03T12:00:00Z"),
      "pro",
      forecast({ probability24h: 0.5, probability48h: 0.75 }),
      now
    );

    expect(result.timeProgressUtilization).toBe(42.9);
    expect(result.recommendedUtilization).toBe(70.2);
    expect(result.forecastApplied).toBe(true);
    expect(result.forecastProbability).toBe(75);
  });

  it("does not apply an unknown global forecast to the 5-hour window", () => {
    const result = computeForecastRecommendation(
      usageWindow("5h", "2026-08-30T16:00:00Z"),
      "pro",
      forecast({ probability24h: 0.9, probability48h: 0.9 }),
      now
    );

    expect(result.recommendedUtilization).toBe(20);
    expect(result.forecastApplied).toBe(false);
  });

  it("applies an explicitly scoped 5-hour signal", () => {
    const result = computeForecastRecommendation(
      usageWindow("5h", "2026-08-30T16:00:00Z"),
      "pro",
      forecast({
        probability24h: 0.5,
        probability48h: 0.5,
        windows: ["5h"],
        expectedAt: "2026-08-30T14:00:00Z"
      }),
      now
    );

    expect(result.timeProgressUtilization).toBe(20);
    expect(result.recommendedUtilization).toBe(26.7);
    expect(result.forecastApplied).toBe(true);
  });

  it("keeps the baseline for stale, mismatched, unknown-plan, and late forecasts", () => {
    const window = usageWindow("7d", "2026-09-03T12:00:00Z");
    const stale = forecast({ probability48h: 0.9, stale: true });
    const mismatched = forecast({ probability48h: 0.9, plans: ["plus"] });
    const late = forecast({
      probability48h: 0.9,
      expectedAt: "2026-09-04T12:00:00Z"
    });

    expect(computeForecastRecommendation(window, "pro", stale, now).forecastApplied).toBe(false);
    expect(computeForecastRecommendation(window, "pro", mismatched, now).forecastApplied).toBe(false);
    expect(computeForecastRecommendation(window, null, forecast({ probability48h: 0.9 }), now).forecastApplied).toBe(false);
    expect(computeForecastRecommendation(window, "pro", late, now).forecastApplied).toBe(false);
  });

  it("never exceeds 100 percent", () => {
    const result = computeForecastRecommendation(
      usageWindow("7d", "2026-09-03T12:00:00Z"),
      "pro",
      forecast({
        probability24h: 1,
        probability48h: 1,
        expectedAt: "2026-08-30T12:01:00Z"
      }),
      now
    );

    expect(result.recommendedUtilization).toBeLessThanOrEqual(100);
  });

  it("zeros an expired window while the next upstream snapshot is pending", () => {
    const result = computeForecastRecommendation(
      usageWindow("5h", "2026-08-30T11:59:00Z"),
      "pro",
      forecast({ probability24h: 1, probability48h: 1, windows: ["5h"] }),
      now
    );

    expect(result).toMatchObject({
      timeProgressUtilization: 0,
      recommendedUtilization: 0,
      forecastApplied: false
    });
  });
});

function usageWindow(key: UsageWindowKey, resetsAt: string): PanelUsageWindow {
  return {
    key,
    label: key,
    available: true,
    utilization: 20,
    timeProgressUtilization: 0,
    recommendedUtilization: 0,
    state: "normal",
    resetsAt,
    remainingSeconds: Math.max(0, Math.floor((Date.parse(resetsAt) - now) / 1000)),
    source: "active",
    stats: null
  };
}

function forecast({
  probability24h = null,
  probability48h = null,
  stale = false,
  plans = ["all"],
  windows = ["7d"],
  expectedAt = null
}: {
  probability24h?: number | null;
  probability48h?: number | null;
  stale?: boolean;
  plans?: string[];
  windows?: UsageWindowKey[];
  expectedAt?: string | null;
}): CodexResetForecastPayload {
  return {
    enabled: true,
    fetchedAt: new Date(now).toISOString(),
    refreshIntervalSeconds: 120,
    stale,
    state: "likely",
    probability24h,
    probability48h,
    confidence: "medium",
    expectedWindow: expectedAt
      ? { startAt: expectedAt, endAt: expectedAt, precision: "datetime" }
      : null,
    scope: { plans, windows, uncertain: false },
    agreement: {
      healthySources: 2,
      contributingSources: 2,
      totalSources: 4,
      independentEvidence: 1
    },
    sources: []
  };
}
