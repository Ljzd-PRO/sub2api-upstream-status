import { NextResponse } from "next/server";

import { getCodexResetForecastService } from "@/lib/codex-reset-forecast";
import { getCodexResetForecastConfig } from "@/lib/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const config = getCodexResetForecastConfig();
  const payload = await getCodexResetForecastService(config).getForecast();

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
