import { NextResponse } from "next/server";

import { ConfigError, getServerConfig } from "@/lib/env";
import { normalizeConcurrency } from "@/lib/normalize";
import { Sub2APIClient } from "@/lib/sub2api";
import type { LiveConcurrencyAccount, LiveConcurrencyPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getServerConfig();
    const client = new Sub2APIClient(config);
    const now = new Date();

    const accounts = await Promise.all(config.accountIds.map((id) => fetchLiveConcurrency(client, id)));

    const payload: LiveConcurrencyPayload = {
      generatedAt: now.toISOString(),
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
        error: error instanceof Error ? error.message : "failed to load live concurrency"
      },
      { status }
    );
  }
}

async function fetchLiveConcurrency(client: Sub2APIClient, id: number): Promise<LiveConcurrencyAccount> {
  try {
    const account = await client.getAccount(id);
    return {
      id,
      concurrency: normalizeConcurrency(account)
    };
  } catch {
    return {
      id,
      concurrency: null
    };
  }
}

