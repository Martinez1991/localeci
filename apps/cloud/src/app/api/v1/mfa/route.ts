/**
 * MFA enrollment & verification (issue #15). Reference implementation.
 *   POST /api/v1/mfa           { action: "enroll" }  → { secret, otpauthUri }
 *   POST /api/v1/mfa           { action: "verify", code } → enables MFA
 * The pure TOTP logic lives in src/lib/totp.ts (RFC 6238, unit-tested).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../auth.js";
import { db, schema } from "../../../../db/index.js";
import { generateSecret, otpauthUri, verifyTotp } from "../../../../lib/totp.js";
import { enforceRateLimit } from "../../../../server/guard.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await enforceRateLimit(req, "auth", { subjectId: session.user.id });
  if (limited) return limited;

  const body = (await req.json()) as { action: "enroll" | "verify"; code?: string };
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, session.user.id));
  if (!user) return NextResponse.json({ error: "No user" }, { status: 400 });

  if (body.action === "enroll") {
    const secret = generateSecret();
    // Store provisionally; MFA is only "enabled" after a verified code.
    await db.update(schema.users).set({ mfaSecret: secret, mfaEnabledAt: null }).where(eq(schema.users.id, user.id));
    return NextResponse.json({ secret, otpauthUri: otpauthUri(secret, user.email) });
  }

  if (body.action === "verify") {
    if (!user.mfaSecret) return NextResponse.json({ error: "Enroll first" }, { status: 400 });
    if (!body.code || !verifyTotp(user.mfaSecret, body.code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }
    await db.update(schema.users).set({ mfaEnabledAt: new Date() }).where(eq(schema.users.id, user.id));
    return NextResponse.json({ enabled: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
