import { NextResponse } from "next/server";

import { getAnnouncementService } from "@/lib/announcement";
import { ConfigError, getServerConfig } from "@/lib/env";
import type { AnnouncementPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getServerConfig();
    if (!config.announcementsEnabled) {
      const payload: AnnouncementPayload = {
        enabled: false,
        fetchedAt: new Date().toISOString(),
        refreshIntervalSeconds: config.refreshIntervalSeconds,
        stale: false,
        announcement: null
      };
      return noStoreJson(payload);
    }

    return noStoreJson(await getAnnouncementService(config).getLatest());
  } catch (error) {
    const status = error instanceof ConfigError ? 500 : 502;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to load announcement" },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function noStoreJson(payload: AnnouncementPayload) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" }
  });
}
