/**
 * POST /api/v1/privacy/delete — right to erasure (LGPD Art. 18 / GDPR Art. 17).
 * Thin adapter over the tested `handlePrivacyDeletion` orchestration (#12/#16).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth.js";
import { db, schema } from "../../../../../db/index.js";
import { scrubbedUserFields, type OwnedOrg } from "../../../../../lib/privacy.js";
import { handlePrivacyDeletion, type DeletionExecutor } from "../../../../../lib/handlers/privacyHandler.js";
import { audit } from "../../../../../server/audit.js";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  const session = await auth();

  const exec: DeletionExecutor = {
    async ownedOrgsWithMembers(userId) {
      const orgRows = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, userId));
      return Promise.all(
        orgRows.map(async (o): Promise<OwnedOrg> => {
          const members = await db.select().from(schema.orgMembers).where(eq(schema.orgMembers.orgId, o.id));
          return { orgId: o.id, members: members.filter((m) => m.userId !== userId).map((m) => ({ userId: m.userId, role: m.role })) };
        }),
      );
    },
    async transferOwnership(orgId, toUserId) {
      await db.update(schema.orgs).set({ ownerId: toUserId }).where(eq(schema.orgs.id, orgId));
      await db.update(schema.orgMembers).set({ role: "owner" }).where(eq(schema.orgMembers.orgId, orgId));
    },
    async deleteOrg(orgId) {
      await db.delete(schema.orgs).where(eq(schema.orgs.id, orgId));
    },
    async scrubUser(userId) {
      await db.update(schema.users).set(scrubbedUserFields()).where(eq(schema.users.id, userId));
    },
  };

  const result = await handlePrivacyDeletion(session?.user?.id, { exec, audit: { record: audit }, nowIso: new Date().toISOString() });
  return NextResponse.json(result.body, { status: result.status });
}
