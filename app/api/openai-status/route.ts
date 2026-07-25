import { NextResponse } from "next/server";

import { getOpenAIStatusConfig } from "@/lib/env";
import { getOpenAIStatusService } from "@/lib/openai-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const config = getOpenAIStatusConfig();
  const payload = await getOpenAIStatusService(config).getStatus();

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
