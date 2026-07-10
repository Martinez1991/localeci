/**
 * Drizzle-backed MembershipStore. Treats the org owner (orgs.ownerId) as an
 * implicit owner for backward compatibility with orgs created before the
 * org_members table existed. Reference implementation.
 */
import { and, eq } from "drizzle-orm";
import type { MembershipStore, Role } from "../lib/authz.js";
import { db, schema } from "../db/index.js";

export class DbMembershipStore implements MembershipStore {
  async roleFor(userId: string, orgId: string): Promise<Role | null> {
    const [member] = await db
      .select()
      .from(schema.orgMembers)
      .where(and(eq(schema.orgMembers.orgId, orgId), eq(schema.orgMembers.userId, userId)));
    if (member) return member.role;
    // Backward-compat: the org owner is always an owner.
    const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId));
    if (org && org.ownerId === userId) return "owner";
    return null;
  }
}
