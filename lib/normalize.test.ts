import { describe, expect, it } from "vitest";

import { parseAccountIds } from "@/lib/env";
import {
  buildOpenAIUsageFromExtra,
  buildSummary,
  normalizeAccount,
  shouldFetchActiveUsage,
  shouldFetchPassiveUsage
} from "@/lib/normalize";
import type { Sub2APIAccount } from "@/lib/types";

const now = new Date("2026-03-16T12:00:00Z");

function baseAccount(overrides: Partial<Sub2APIAccount> = {}): Sub2APIAccount {
  return {
    id: 40,
    name: "codex@example.com",
    platform: "openai",
    type: "oauth",
    status: "active",
    schedulable: true,
    updated_at: "2026-03-16T11:58:00Z",
    ...overrides
  };
}

describe("parseAccountIds", () => {
  it("keeps valid unique positive IDs in order", () => {
    expect(parseAccountIds("40, 39 39 nope 0 52")).toEqual([40, 39, 52]);
  });
});

describe("buildOpenAIUsageFromExtra", () => {
  it("normalizes Codex 5h and 7d snapshots from account extra", () => {
    const usage = buildOpenAIUsageFromExtra(
      baseAccount({
        extra: {
          codex_5h_used_percent: 12.5,
          codex_5h_reset_at: "2026-03-16T14:00:00Z",
          codex_5h_requests: 158,
          codex_5h_tokens: 7900000,
          codex_7d_used_percent: "34",
          codex_7d_reset_after_seconds: 86400,
          codex_7d_requests: "420",
          codex_7d_total_tokens: "12500000",
          codex_usage_updated_at: "2026-03-16T11:00:00Z"
        }
      }),
      now
    );

    expect(usage?.five_hour?.utilization).toBe(12.5);
    expect(usage?.five_hour?.resets_at).toBe("2026-03-16T14:00:00.000Z");
    expect(usage?.five_hour?.window_stats).toMatchObject({ requests: 158, tokens: 7900000 });
    expect(usage?.seven_day?.utilization).toBe(34);
    expect(usage?.seven_day?.resets_at).toBe("2026-03-17T11:00:00.000Z");
    expect(usage?.seven_day?.window_stats).toMatchObject({ requests: 420, tokens: 12500000 });
  });

  it("zeros an expired Codex window", () => {
    const usage = buildOpenAIUsageFromExtra(
      baseAccount({
        extra: {
          codex_5h_used_percent: 88,
          codex_5h_reset_at: "2026-03-16T10:00:00Z"
        }
      }),
      now
    );

    expect(usage?.five_hour?.utilization).toBe(0);
    expect(usage?.five_hour?.remaining_seconds).toBe(0);
  });
});

describe("normalizeAccount", () => {
  it("marks high usage as warning and exposes window states", () => {
    const account = baseAccount({
      extra: {
        codex_5h_used_percent: 50,
        codex_5h_reset_at: "2026-03-16T14:00:00Z",
        codex_7d_used_percent: 91,
        codex_7d_reset_at: "2026-03-20T14:00:00Z"
      }
    });
    const status = normalizeAccount(account, buildOpenAIUsageFromExtra(account, now), null, now);

    expect(status.health).toBe("warning");
    expect(status.windows.fiveHour.recommendedUtilization).toBe(60);
    expect(status.windows.sevenDay.recommendedUtilization).toBe(41.7);
    expect(status.windows.sevenDay.state).toBe("danger");
  });

  it("zeros recommended usage for expired windows", () => {
    const account = baseAccount({
      extra: {
        codex_5h_used_percent: 88,
        codex_5h_reset_at: "2026-03-16T10:00:00Z"
      }
    });
    const status = normalizeAccount(account, buildOpenAIUsageFromExtra(account, now), null, now);

    expect(status.windows.fiveHour.utilization).toBe(0);
    expect(status.windows.fiveHour.recommendedUtilization).toBe(0);
  });

  it("marks future rate limits as exhausted", () => {
    const account = baseAccount({
      rate_limit_reset_at: "2026-03-16T13:00:00Z"
    });
    const status = normalizeAccount(account, null, null, now);

    expect(status.health).toBe("exhausted");
    expect(status.healthReason).toBe("rate limited");
  });

  it("uses passive usage only for Anthropic OAuth and setup-token accounts", () => {
    expect(shouldFetchPassiveUsage(baseAccount({ platform: "anthropic", type: "oauth" }))).toBe(true);
    expect(shouldFetchPassiveUsage(baseAccount({ platform: "anthropic", type: "setup-token" }))).toBe(true);
    expect(shouldFetchPassiveUsage(baseAccount({ platform: "openai", type: "oauth" }))).toBe(false);
  });

  it("uses active usage for OpenAI OAuth accounts", () => {
    expect(shouldFetchActiveUsage(baseAccount({ platform: "openai", type: "oauth" }))).toBe(true);
    expect(shouldFetchActiveUsage(baseAccount({ platform: "openai", type: "apikey" }))).toBe(false);
    expect(shouldFetchActiveUsage(baseAccount({ platform: "anthropic", type: "oauth" }))).toBe(false);
  });

  it("normalizes today request and token totals", () => {
    const status = normalizeAccount(
      baseAccount(),
      null,
      null,
      now,
      { requests: 12, tokens: 34567, cost: 1.23, standard_cost: 1.5, user_cost: 1.1 }
    );

    expect(status.today).toMatchObject({
      available: true,
      requests: 12,
      tokens: 34567,
      cost: 1.23,
      standardCost: 1.5,
      userCost: 1.1
    });
  });

  it("normalizes concurrency capacity and occupancy", () => {
    const status = normalizeAccount(
      baseAccount({
        concurrency: 8,
        current_concurrency: 6
      }),
      null,
      null,
      now
    );

    expect(status.concurrency).toMatchObject({
      available: true,
      used: 6,
      limit: 8,
      utilization: 75,
      state: "warning"
    });
  });

  it("keeps capacity-only concurrency available without inventing occupancy", () => {
    const status = normalizeAccount(
      baseAccount({
        concurrency: 4
      }),
      null,
      null,
      now
    );

    expect(status.concurrency).toMatchObject({
      available: true,
      used: null,
      limit: 4,
      utilization: null,
      state: "unknown"
    });
  });

  it("aggregates today totals in the summary", () => {
    const first = normalizeAccount(baseAccount({ id: 1 }), null, null, now, { requests: 2, tokens: 100 });
    const second = normalizeAccount(baseAccount({ id: 2 }), null, null, now, { requests: 3, tokens: 250 });

    expect(buildSummary([first, second])).toMatchObject({
      requests: 5,
      tokens: 350
    });
  });

  it("aggregates 5h and 7d window totals separately in the summary", () => {
    const firstUsage = {
      source: "active" as const,
      updated_at: "2026-03-16T11:58:00Z",
      five_hour: {
        utilization: 11,
        resets_at: "2026-03-16T14:00:00Z",
        remaining_seconds: 7200,
        window_stats: { requests: 158, tokens: 7900000 }
      },
      seven_day: {
        utilization: 22,
        resets_at: "2026-03-20T14:00:00Z",
        remaining_seconds: 360000,
        window_stats: { requests: 410, tokens: 12000000 }
      }
    };
    const secondUsage = {
      source: "active" as const,
      updated_at: "2026-03-16T11:58:00Z",
      five_hour: {
        utilization: 5,
        resets_at: "2026-03-16T14:00:00Z",
        remaining_seconds: 7200,
        window_stats: { requests: 2, total_tokens: 1000 }
      },
      seven_day: {
        utilization: 8,
        resets_at: "2026-03-20T14:00:00Z",
        remaining_seconds: 360000,
        window_stats: { requests: 4, tokens: 2000 }
      }
    };
    const first = normalizeAccount(baseAccount({ id: 1 }), firstUsage, null, now);
    const second = normalizeAccount(baseAccount({ id: 2 }), secondUsage, null, now);

    expect(buildSummary([first, second])).toMatchObject({
      fiveHour: {
        availableAccounts: 2,
        requests: 160,
        tokens: 7901000
      },
      sevenDay: {
        availableAccounts: 2,
        requests: 414,
        tokens: 12002000
      }
    });
  });
});
