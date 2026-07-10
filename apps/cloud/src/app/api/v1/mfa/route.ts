/**
 * POST /api/v1/mfa — enroll/verify TOTP MFA (issue #15). Thin adapter over the
 * tested `handleMfa` orchestration (#12).
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../auth.js";
import { db, schema } from "../../../../db/index.js";
import { handleMfa, type MfaUserStore, type MfaAction } from "../../../../lib/handlers/mfaHandler.js";
import { enforceRateLimit } from "../../../../server/guard.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const limited = await enforceRateLimit(req, "auth", { subjectId: session?.user?.id });
  if (limited) return limited;

  const input = (await req.json()) as MfaAction;
  const users: MfaUserStore = {
    async get(userId) {
      const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
      return u ? { email: u.email, mfaSecret: u.mfaSecret, mfaEnabledAt: u.mfaEnabledAt } : null;
    },
    async setSecret(userId, secret) {
      await db.update(schema.users).set({ mfaSecret: secret, mfaEnabledAt: null }).where(eq(schema.users.id, userId));
    },
    async enable(userId) {
      await db.update(schema.users).set({ mfaEnabledAt: new Date() }).where(eq(schema.users.id, userId));
    },
  };

  const result = await handleMfa(session?.user?.id, input, { users });
  return NextResponse.json(result.body, { status: result.status });
}
