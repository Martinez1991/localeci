/**
 * Organization access control (fixes the BOLA/A01 hole: routes must verify the
 * caller belongs to the resource's org, deny-by-default).
 *
 * Pure and unit-tested here; routes resolve the caller's role via a
 * `MembershipStore` and call `hasOrgAccess` / `requireOrgAccess`.
 */
export type Role = "owner" | "admin" | "member";

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export interface Membership {
  userId: string;
  orgId: string;
  role: Role;
}

export interface MembershipStore {
  /** The caller's role in an org, or null if not a member. */
  roleFor(userId: string, orgId: string): Promise<Role | null>;
}

/** Deny-by-default: true only when the role meets or exceeds the minimum. */
export function hasOrgAccess(role: Role | null | undefined, min: Role = "member"): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[min];
}

export class ForbiddenError extends Error {
  override name = "ForbiddenError";
  readonly status = 403;
}

export class UnauthorizedError extends Error {
  override name = "UnauthorizedError";
  readonly status = 401;
}

/**
 * Resolve and enforce org access for a request. Throws Unauthorized (no user)
 * or Forbidden (not a member / insufficient role). Returns the caller's role.
 */
export async function requireOrgAccess(
  store: MembershipStore,
  userId: string | undefined | null,
  orgId: string,
  min: Role = "member",
): Promise<Role> {
  if (!userId) throw new UnauthorizedError("Authentication required");
  const role = await store.roleFor(userId, orgId);
  if (!hasOrgAccess(role, min)) throw new ForbiddenError("You do not have access to this organization");
  return role as Role;
}

/** In-memory store for tests/local dev. */
export class MemoryMembershipStore implements MembershipStore {
  constructor(private memberships: Membership[] = []) {}
  add(m: Membership): void {
    this.memberships.push(m);
  }
  async roleFor(userId: string, orgId: string): Promise<Role | null> {
    const m = this.memberships.find((x) => x.userId === userId && x.orgId === orgId);
    return m?.role ?? null;
  }
}
