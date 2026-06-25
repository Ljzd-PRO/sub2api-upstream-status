import { describe, expect, it } from "vitest";

import { parseAccountIds } from "@/lib/env";
import {
  buildOpenAIUsageFromExtra,
  buildSummary,
  normalizeAccount,
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
          codex_7d_used_percent: "34",
          codex_7d_reset_after_seconds: 86400,
          codex_usage_updated_at: "2026-03-16T11:00:00Z"
        }
      }),
      now
    );

    expect(usage?.five_hour?.utilization).toBe(12.5);
    expect(usage?.five_hour?.resets_at).toBe("2026-03-16T14:00:00.000Z");
    expect(usage?.seven_day?.utilization).toBe(34);
    expect(usage?.seven_day?.resets_at).toBe("2026-03-17T11:00:00.000Z");
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
    expect(status.windows.sevenDay.state).toBe("danger");
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

  it("aggregates today totals in the summary", () => {
    const first = normalizeAccount(baseAccount({ id: 1 }), null, null, now, { requests: 2, tokens: 100 });
    const second = normalizeAccount(baseAccount({ id: 2 }), null, null, now, { requests: 3, tokens: 250 });

    expect(buildSummary([first, second])).toMatchObject({
      requests: 5,
      tokens: 350
    });
  });
});
