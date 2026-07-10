/**
 * Org membership management (issue #14). Reference implementation.
 *   GET  /api/v1/orgs/:id/members            — list members (any member)
 *   POST /api/v1/orgs/:id/members            — invite {email, role} (admin+)
 *   PATCH/DELETE handled by /members/[userId] (omitted for brevity).
 * All actions are authorized against the org (fixes BOLA) and validated with the
 * pure membership rules.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "../../../../../../auth.js";
import { db, schema } from "../../../../../../db/index.js";
import { requireOrgAccess, ForbiddenError, UnauthorizedError } from "../../../../../../lib/authz.js";
import { canInvite, type Member } from "../../../../../../lib/membership.js";
import { DbMembershipStore } from "../../../../../../server/membership.js";
import { enforceRateLimit } from "../../../../../../server/guard.js";

export const runtime = "nodejs";

async function loadMembers(orgId: string): Promise<Member[]> {
  const rows = await db.select().from(schema.orgMembers).where(eq(schema.orgMembers.orgId, orgId));
  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
  const members: Member[] = rows.map((r) => ({ userId: r.userId, role: r.role }));
  // Backward-compat: ensure the owner is represented.
  if (org && !members.some((m) => m.userId === org.ownerId)) members.push({ userId: org.ownerId, role: "owner" });
  return members;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: orgId } = await ctx.params;
  const session = await auth();
  try {
    await requireOrgAccess(new DbMembershipStore(), session?.user?.id, orgId);
  } catch (e) {
    const status = e instanceof ForbiddenError || e instanceof UnauthorizedError ? e.status : 403;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
  return NextResponse.json({ members: await loadMembers(orgId) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: orgId } = await ctx.params;
  const session = await auth();
  const limited = await enforceRateLimit(req, "write", { subjectId: session?.user?.id });
  if (limited) return limited;
  try {
    await requireOrgAccess(new DbMembershipStore(), session?.user?.id, orgId, "admin");
  } catch (e) {
    const status = e instanceof ForbiddenError || e instanceof UnauthorizedError ? e.status : 403;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  const { email, role = "member" } = (await req.json()) as { email: string; role?: "owner" | "admin" | "member" };
  const members = await loadMembers(orgId);
  const check = canInvite(members, session!.user!.id!, role);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 403 });

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invite] = await db
    .insert(schema.orgInvites)
    .values({ orgId, email, role, token, invitedById: session!.user!.id, expiresAt })
    .returning();

  // TODO: send invite email via Resend with the token link.
  return NextResponse.json({ inviteId: invite!.id, email, role });
}
