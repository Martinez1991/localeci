/**
 * POST /api/v1/playground — translate a single string live with the full
 * pipeline (validators + judge + score). Public, rate-limited by IP; a taste of
 * LocaleCI's quality pipeline without signing up. Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { playgroundTranslate, type PlaygroundRequest } from "../../../../lib/playground.js";
import { platformProvider } from "../../../../lib/platformProvider.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as PlaygroundRequest;
  if (!body?.source || !body.targetLocale) {
    return NextResponse.json({ error: "source and targetLocale are required" }, { status: 400 });
  }
  // Cap input size to keep the public endpoint cheap.
  if (body.source.length > 500) {
    return NextResponse.json({ error: "source too long (500 char max in the playground)" }, { status: 413 });
  }
  const result = await playgroundTranslate(
    { ...body, sourceLocale: body.sourceLocale || "en" },
    platformProvider(),
  );
  return NextResponse.json(result);
}
