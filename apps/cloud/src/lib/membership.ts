/**
 * Organization membership management (issue #14 — enables Team/Scale). Pure
 * transition rules layered on top of the `authz.ts` role model:
 *  - only owners/admins can change roles or remove members;
 *  - only owners can grant the owner role;
 *  - the last owner can never be demoted or removed (no orphaned orgs);
 *  - members can only manage roles at or below their own.
 *
 * Unit-tested here; the routes call these and persist via Drizzle.
 */
import type { Role } from "./authz.js";

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export interface Member {
  userId: string;
  role: Role;
}

export interface MemberActionResult {
  ok: boolean;
  error?: string;
}

/** Can `actor` change `target`'s role to `newRole` given the full member list? */
export function canChangeRole(members: Member[], actorId: string, targetId: string, newRole: Role): MemberActionResult {
  const actor = members.find((m) => m.userId === actorId);
  const target = members.find((m) => m.userId === targetId);
  if (!actor) return { ok: false, error: "Actor is not a member" };
  if (!target) return { ok: false, error: "Target is not a member" };
  if (RANK[actor.role] < RANK.admin) return { ok: false, error: "Only owners/admins can change roles" };
  // Admins can't touch owners or grant owner.
  if (RANK[actor.role] < RANK.owner && (RANK[target.role] >= RANK.owner || newRole === "owner")) {
    return { ok: false, error: "Only an owner can manage owners" };
  }
  // Never demote the last owner.
  if (target.role === "owner" && newRole !== "owner" && owners(members).length <= 1) {
    return { ok: false, error: "Cannot demote the last owner" };
  }
  return { ok: true };
}

/** Can `actor` remove `targetId` from the org? */
export function canRemoveMember(members: Member[], actorId: string, targetId: string): MemberActionResult {
  const actor = members.find((m) => m.userId === actorId);
  const target = members.find((m) => m.userId === targetId);
  if (!actor) return { ok: false, error: "Actor is not a member" };
  if (!target) return { ok: false, error: "Target is not a member" };
  if (actorId !== targetId && RANK[actor.role] < RANK.admin) {
    return { ok: false, error: "Only owners/admins can remove members" };
  }
  if (RANK[actor.role] < RANK.owner && RANK[target.role] >= RANK.owner) {
    return { ok: false, error: "Only an owner can remove an owner" };
  }
  if (target.role === "owner" && owners(members).length <= 1) {
    return { ok: false, error: "Cannot remove the last owner" };
  }
  return { ok: true };
}

/** Can `actor` invite someone at `role`? */
export function canInvite(members: Member[], actorId: string, role: Role): MemberActionResult {
  const actor = members.find((m) => m.userId === actorId);
  if (!actor) return { ok: false, error: "Actor is not a member" };
  if (RANK[actor.role] < RANK.admin) return { ok: false, error: "Only owners/admins can invite" };
  if (role === "owner" && actor.role !== "owner") return { ok: false, error: "Only an owner can invite an owner" };
  return { ok: true };
}

function owners(members: Member[]): Member[] {
  return members.filter((m) => m.role === "owner");
}

// ── Invite tokens ──────────────────────────────────────────────────────────

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  status: InviteStatus;
  expiresAt: number; // epoch ms
}

/** Validate an invite for acceptance at time `now`. */
export function canAcceptInvite(invite: Invite, now: number): MemberActionResult {
  if (invite.status !== "pending") return { ok: false, error: `Invite is ${invite.status}` };
  if (invite.expiresAt <= now) return { ok: false, error: "Invite has expired" };
  return { ok: true };
}
