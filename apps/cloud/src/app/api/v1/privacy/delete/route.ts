/**
 * POST /api/v1/privacy/delete — right to erasure (LGPD Art. 18 / GDPR Art. 17).
 * Computes a deletion plan (transfer ownership / delete empty orgs / scrub PII),
 * executes it, and records the erasure in the (retained) audit log.
 * Reference implementation.
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth.js";
import { db, schema } from "../../../../../db/index.js";
import { planUserDeletion, scrubbedUserFields, type OwnedOrg } from "../../../../../lib/privacy.js";
import { audit } from "../../../../../server/audit.js";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const uid = session.user.id;

  // Gather owned orgs + their OTHER members.
  const orgRows = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, uid));
  const ownedOrgs: OwnedOrg[] = await Promise.all(
    orgRows.map(async (o) => {
      const members = await db.select().from(schema.orgMembers).where(eq(schema.orgMembers.orgId, o.id));
      return {
        orgId: o.id,
        members: members.filter((m) => m.userId !== uid).map((m) => ({ userId: m.userId, role: m.role })),
      };
    }),
  );

  const plan = planUserDeletion({ userId: uid, ownedOrgs, now: new Date().toISOString(), graceDays: 0 });

  // Record the erasure BEFORE scrubbing (actorId will become a dangling pseudonym).
  await audit({ actorId: uid, action: "data.deleted", target: uid, at: new Date().toISOString() });

  for (const step of plan.steps) {
    if (step.kind === "transfer-ownership") {
      await db.update(schema.orgs).set({ ownerId: step.toUserId }).where(eq(schema.orgs.id, step.orgId));
      await db.update(schema.orgMembers).set({ role: "owner" }).where(eq(schema.orgMembers.orgId, step.orgId));
    } else if (step.kind === "delete-org") {
      await db.delete(schema.orgs).where(eq(schema.orgs.id, step.orgId));
    } else if (step.kind === "scrub-user") {
      await db.update(schema.users).set(scrubbedUserFields()).where(eq(schema.users.id, step.userId));
    }
    // "retain-audit" is intentionally a no-op: the hash-chained log stays intact.
  }

  return NextResponse.json({ deleted: true, plan });
}
