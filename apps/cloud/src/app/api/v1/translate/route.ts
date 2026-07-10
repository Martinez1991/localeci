/**
 * POST /api/v1/translate — metered translation proxy (spec §8.2).
 * The CLI's cloud provider calls this with a Bearer API key.
 * Hardened: rate-limited per org, structured-logged, and cost-alerted (#9/#11).
 */
import { NextRequest, NextResponse } from "next/server";
import { bearerFrom, resolveOrg } from "../../../../server/authKey.js";
import { handleTranslate } from "../../../../lib/proxy.js";
import { cachedPlatformProvider } from "../../../../lib/platformProvider.js";
import { DbUsageStore } from "../../../../server/dbUsage.js";
import { enforceRateLimit, requestLogger } from "../../../../server/guard.js";
import { costAlertLevel } from "../../../../lib/observability.js";

export const runtime = "nodejs";

const DAILY_ORG_CAP_USD = Number(process.env.ORG_DAILY_CAP_USD ?? 50);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = bearerFrom(req.headers.get("authorization"));
  if (!secret) return NextResponse.json({ error: "Missing API key" }, { status: 401 });

  const org = await resolveOrg(secret);
  if (!org) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  const limited = await enforceRateLimit(req, "translate", { subjectId: org.orgId });
  if (limited) return limited;

  const { log } = requestLogger(req, "translate", org.orgId);
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

  // Structured, content-free telemetry + cost guardrail alert.
  const body = result.body as { tokensIn?: number; tokensOut?: number; translations?: unknown[] };
  const used = await new DbUsageStore().usedInPeriod(org.orgId, today.slice(0, 7));
  const alert = costAlertLevel(used, org.plan.stringsPerMonth);
  log.info("translate", {
    status: result.status,
    tokensIn: body.tokensIn ?? 0,
    tokensOut: body.tokensOut ?? 0,
    count: body.translations?.length ?? 0,
    plan: org.plan.id,
    quotaAlert: alert,
  });
  if (alert !== "ok") log.warn("org quota alert", { plan: org.plan.id, quotaAlert: alert });

  return NextResponse.json(result.body, { status: result.status });
}
