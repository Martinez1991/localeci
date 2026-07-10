/**
 * POST /api/v1/translate — metered translation proxy (spec §8.2).
 * The CLI's cloud provider calls this with a Bearer API key.
 */
import { NextRequest, NextResponse } from "next/server";
import { bearerFrom, resolveOrg } from "../../../../server/authKey.js";
import { handleTranslate } from "../../../../lib/proxy.js";
import { cachedPlatformProvider } from "../../../../lib/platformProvider.js";
import { DbUsageStore } from "../../../../server/dbUsage.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = bearerFrom(req.headers.get("authorization"));
  if (!secret) return NextResponse.json({ error: "Missing API key" }, { status: 401 });

  const org = await resolveOrg(secret);
  if (!org) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  const batch = await req.json();
  const today = new Date().toISOString().slice(0, 10);
  const retention = process.env.LOCALECI_RETENTION === "true"; // zero-retention by default

  const result = await handleTranslate(batch, {
    provider: cachedPlatformProvider(),
    usage: new DbUsageStore(),
    org,
    today,
    retention,
  });
  return NextResponse.json(result.body, { status: result.status });
}
