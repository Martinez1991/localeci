/**
 * POST /api/v1/preview — visual UI preview data (Scale tier). Given tagged UI
 * strings, returns per-string fit verdicts the dashboard renders as a mock UI
 * with overflow highlighted. Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { bearerFrom, resolveOrg } from "../../../../server/authKey.js";
import { previewStrings, type PreviewItem } from "../../../../lib/preview.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = bearerFrom(req.headers.get("authorization"));
  if (!secret) return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  const org = await resolveOrg(secret);
  if (!org) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  if (org.plan.id !== "scale") {
    return NextResponse.json({ error: "Visual UI preview is a Scale-plan feature." }, { status: 402 });
  }

  const body = (await req.json()) as { locale: string; items: PreviewItem[] };
  return NextResponse.json(previewStrings(body.locale, body.items ?? []));
}
