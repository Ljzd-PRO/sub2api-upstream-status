import { NextResponse } from "next/server";

import { ConfigError, getServerConfig } from "@/lib/env";
import {
  buildOpenAIUsageFromExtra,
  buildSummary,
  normalizeAccount,
  shouldFetchPassiveUsage
} from "@/lib/normalize";
import { Sub2APIClient } from "@/lib/sub2api";
import type { AccountFetchResult, PanelPayload, Sub2APIUsageInfo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getServerConfig();
    const client = new Sub2APIClient(config);
    const now = new Date();
    const todayStats = await getTodayStatsByAccount(client, config.accountIds);

    const results = await Promise.all(
      config.accountIds.map((id) => fetchAccountStatus(client, id, now, todayStats[id] ?? null))
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
          now,
          todayStats[result.id] ?? null
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
  todayStats: NonNullable<Awaited<ReturnType<typeof getTodayStatsByAccount>>[number]> | null
): Promise<AccountFetchResult> {
  try {
    const account = await client.getAccount(id);
    let usage: Sub2APIUsageInfo | null = buildOpenAIUsageFromExtra(account, now);
    let usageError: string | null = null;

    if (!usage && shouldFetchPassiveUsage(account)) {
      try {
        usage = await client.getPassiveUsage(id);
      } catch (error) {
        usageError = error instanceof Error ? error.message : "usage request failed";
      }
    }

    return {
      id,
      account: normalizeAccount(account, usage, usageError, now, todayStats),
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

async function getTodayStatsByAccount(client: Sub2APIClient, ids: number[]) {
  try {
    const payload = await client.getBatchTodayStats(ids);
    return payload.stats ?? {};
  } catch {
    return {};
  }
}
