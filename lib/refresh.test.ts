import { describe, expect, it } from "vitest";

import { normalizeRefreshIntervalSeconds, secondsUntil, shouldAutoRefresh } from "@/lib/refresh";

describe("normalizeRefreshIntervalSeconds", () => {
  it("uses a 60 second default", () => {
    expect(normalizeRefreshIntervalSeconds(null)).toBe(60);
    expect(normalizeRefreshIntervalSeconds(undefined)).toBe(60);
  });

  it("enforces a 15 second minimum", () => {
    expect(normalizeRefreshIntervalSeconds(5)).toBe(15);
    expect(normalizeRefreshIntervalSeconds(15)).toBe(15);
    expect(normalizeRefreshIntervalSeconds(90)).toBe(90);
  });
});

describe("secondsUntil", () => {
  it("returns a rounded-up positive countdown", () => {
    expect(secondsUntil(12_500, 10_000)).toBe(3);
  });

  it("does not return negative values", () => {
    expect(secondsUntil(9_000, 10_000)).toBe(0);
  });

  it("keeps disabled countdowns empty", () => {
    expect(secondsUntil(null, 10_000)).toBeNull();
  });
});

describe("shouldAutoRefresh", () => {
  it("refreshes only when enabled and due", () => {
    expect(shouldAutoRefresh(true, 10_000, 10_000)).toBe(true);
    expect(shouldAutoRefresh(true, 11_000, 10_000)).toBe(false);
    expect(shouldAutoRefresh(false, 10_000, 10_000)).toBe(false);
    expect(shouldAutoRefresh(true, null, 10_000)).toBe(false);
  });
});

