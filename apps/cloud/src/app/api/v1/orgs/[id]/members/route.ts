/**
 * Org membership management (issues #12, #14). Thin adapters over the tested
 * orchestration (handleMemberInvite) + a simple authorized list.
 *   GET  /api/v1/orgs/:id/members   — list members (any member)
 *   POST /api/v1/orgs/:id/members   — invite {email, role} (admin+)
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../../auth.js";
import { db, schema } from "../../../../../../db/index.js";
import { requireOrgAccess, ForbiddenError, UnauthorizedError, type Role } from "../../../../../../lib/authz.js";
import { handleMemberInvite, type MemberStore } from "../../../../../../lib/handlers/memberHandler.js";
import { DbMembershipStore } from "../../../../../../server/membership.js";
import { enforceRateLimit } from "../../../../../../server/guard.js";
import type { Member } from "../../../../../../lib/membership.js";

export const runtime = "nodejs";

async function loadMembers(orgId: string): Promise<Member[]> {
  const rows = await db.select().from(schema.orgMembers).where(eq(schema.orgMembers.orgId, orgId));
  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
  const members: Member[] = rows.map((r) => ({ userId: r.userId, role: r.role }));
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

  const input = (await req.json()) as { email: string; role?: Role };
  const members: MemberStore = {
    listMembers: loadMembers,
    async createInvite(v) {
      const token = crypto.randomUUID();
      const [row] = await db
        .insert(schema.orgInvites)
        .values({ orgId: v.orgId, email: v.email, role: v.role, token, invitedById: v.invitedById, expiresAt: new Date(v.expiresAt) })
        .returning();
      return { id: row!.id };
    },
  };

  const result = await handleMemberInvite(orgId, input, session?.user?.id, {
    members,
    memberships: new DbMembershipStore(),
    nowMs: Date.now(),
  });
  return NextResponse.json(result.body, { status: result.status });
}
