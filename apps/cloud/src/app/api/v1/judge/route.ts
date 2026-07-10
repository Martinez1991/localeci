/** POST /api/v1/judge — metered quality-judging proxy. */
import { NextRequest, NextResponse } from "next/server";
import { bearerFrom, resolveOrg } from "../../../../server/authKey.js";
import { handleJudge } from "../../../../lib/proxy.js";
import { platformProvider } from "../../../../lib/platformProvider.js";
import { DbUsageStore } from "../../../../server/dbUsage.js";
import { enforceRateLimit } from "../../../../server/guard.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = bearerFrom(req.headers.get("authorization"));
  if (!secret) return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  const org = await resolveOrg(secret);
  if (!org) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  const limited = await enforceRateLimit(req, "translate", { subjectId: org.orgId });
  if (limited) return limited;

  const batch = await req.json();
  const result = await handleJudge(batch, {
    provider: platformProvider(),
    usage: new DbUsageStore(),
    org,
    today: new Date().toISOString().slice(0, 10),
  });
  return NextResponse.json(result.body, { status: result.status });
}
