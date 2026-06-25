import { NextResponse } from "next/server";

import { ConfigError, getServerConfig } from "@/lib/env";
import {
  buildOpenAIUsageFromExtra,
  buildSummary,
  normalizeAccount,
  shouldFetchActiveUsage,
  shouldFetchPassiveUsage
} from "@/lib/normalize";
import { maskAccountName } from "@/lib/privacy";
import { Sub2APIClient } from "@/lib/sub2api";
import type {
  AccountFetchResult,
  PanelPayload,
  Sub2APIAccountStats,
  Sub2APIAccountUsageStats,
  Sub2APIUsageInfo
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getServerConfig();
    const client = new Sub2APIClient(config);
    const now = new Date();

    const results = await Promise.all(
      config.accountIds.map((id) => fetchAccountStatus(client, id, now, config.maskAccountNames))
    );

    const accounts = results.map((result) => {
      if (result.account) return result.account;
      return normalizeAccount(
          {
            id: result.id,
            name: `Account ${result.id}`,
            platform: "unknown",
            type: "unknown",
            status: "error",
            schedulable: false,
            error_message: result.error ?? "account unavailable"
          },
          null,
          result.error,
          now
        );
    });

    const payload: PanelPayload = {
      generatedAt: now.toISOString(),
      refreshIntervalSeconds: config.refreshIntervalSeconds,
      title: config.panelTitle,
      summary: buildSummary(accounts),
      accounts
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const status = error instanceof ConfigError ? 500 : 502;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "failed to load upstream status"
      },
      { status }
    );
  }
}

async function fetchAccountStatus(
  client: Sub2APIClient,
  id: number,
  now: Date,
  maskName: boolean
): Promise<AccountFetchResult> {
  try {
    const [account, stats] = await Promise.all([
      client.getAccount(id),
      getAccountTotals(client, id)
    ]);
    const fallbackUsage = buildOpenAIUsageFromExtra(account, now);
    let usage: Sub2APIUsageInfo | null = fallbackUsage;
    let usageError: string | null = null;

    if (shouldFetchActiveUsage(account)) {
      try {
        const activeUsage = await client.getActiveUsage(id);
        usage = { ...activeUsage, source: activeUsage.source ?? "active" };
      } catch (error) {
        usage = fallbackUsage;
        usageError = error instanceof Error ? error.message : "usage request failed";
      }
    } else if (!usage && shouldFetchPassiveUsage(account)) {
      try {
        usage = await client.getPassiveUsage(id);
      } catch (error) {
        usageError = error instanceof Error ? error.message : "usage request failed";
      }
    }

    return {
      id,
      account: normalizeAccount(maskName ? maskSub2APIAccountName(account) : account, usage, usageError, now, stats),
      error: null
    };
  } catch (error) {
    return {
      id,
      account: null,
      error: error instanceof Error ? error.message : "account request failed"
    };
  }
}

function maskSub2APIAccountName<T extends { name: string }>(account: T): T {
  return {
    ...account,
    name: maskAccountName(account.name)
  };
}

async function getAccountTotals(client: Sub2APIClient, id: number): Promise<Sub2APIAccountStats | null> {
  try {
    return totalsFromAccountStats(await client.getAccountStats(id));
  } catch {
    return null;
  }
}

function totalsFromAccountStats(payload: Sub2APIAccountUsageStats): Sub2APIAccountStats | null {
  const summary = payload.summary;
  if (!summary) return null;

  return {
    requests: summary.total_requests,
    tokens: summary.total_tokens,
    cost: summary.total_cost,
    standard_cost: summary.total_standard_cost,
    user_cost: summary.total_user_cost
  };
}
