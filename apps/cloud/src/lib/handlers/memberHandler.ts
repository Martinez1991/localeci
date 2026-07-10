/**
 * Member-invite orchestration (issue #12, #14). Thin route over this DI'd
 * function so the authorize → canInvite → create-invite flow is unit-tested.
 */
import { requireOrgAccess, ForbiddenError, UnauthorizedError, type MembershipStore, type Role } from "../authz.js";
import { canInvite, type Member } from "../membership.js";
import type { HandlerResult } from "./reviewHandler.js";

export interface MemberStore {
  /** All members of an org (must already include the owner). */
  listMembers(orgId: string): Promise<Member[]>;
  createInvite(input: { orgId: string; email: string; role: Role; invitedById: string; expiresAt: string }): Promise<{ id: string }>;
}

export interface MemberInviteDeps {
  members: MemberStore;
  memberships: MembershipStore;
  nowMs: number;
  inviteTtlMs?: number;
}

export async function handleMemberInvite(
  orgId: string,
  input: { email: string; role?: Role },
  userId: string | undefined | null,
  deps: MemberInviteDeps,
): Promise<HandlerResult> {
  const role: Role = input.role ?? "member";
  if (!input.email) return { status: 400, body: { error: "email is required" } };

  try {
    await requireOrgAccess(deps.memberships, userId, orgId, "admin");
  } catch (e) {
    const status = e instanceof ForbiddenError || e instanceof UnauthorizedError ? e.status : 403;
    return { status, body: { error: (e as Error).message } };
  }

  const members = await deps.members.listMembers(orgId);
  const check = canInvite(members, userId!, role);
  if (!check.ok) return { status: 403, body: { error: check.error } };

  const ttl = deps.inviteTtlMs ?? 7 * 24 * 60 * 60 * 1000;
  const invite = await deps.members.createInvite({
    orgId,
    email: input.email,
    role,
    invitedById: userId!,
    expiresAt: new Date(deps.nowMs + ttl).toISOString(),
  });
  return { status: 200, body: { inviteId: invite.id, email: input.email, role } };
}
