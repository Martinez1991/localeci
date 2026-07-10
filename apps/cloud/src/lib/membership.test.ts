import { describe, it, expect } from "vitest";
import { canChangeRole, canRemoveMember, canInvite, canAcceptInvite, type Member, type Invite } from "./membership.js";

const members: Member[] = [
  { userId: "owner1", role: "owner" },
  { userId: "owner2", role: "owner" },
  { userId: "admin1", role: "admin" },
  { userId: "member1", role: "member" },
];

describe("canChangeRole", () => {
  it("owner can promote a member to admin", () => {
    expect(canChangeRole(members, "owner1", "member1", "admin").ok).toBe(true);
  });
  it("member cannot change roles", () => {
    expect(canChangeRole(members, "member1", "admin1", "member").ok).toBe(false);
  });
  it("admin cannot grant owner nor touch owners", () => {
    expect(canChangeRole(members, "admin1", "member1", "owner").ok).toBe(false);
    expect(canChangeRole(members, "admin1", "owner2", "member").ok).toBe(false);
  });
  it("cannot demote the last owner", () => {
    const one: Member[] = [{ userId: "o", role: "owner" }, { userId: "m", role: "member" }];
    expect(canChangeRole(one, "o", "o", "admin").ok).toBe(false);
  });
  it("can demote an owner when another owner remains", () => {
    expect(canChangeRole(members, "owner1", "owner2", "admin").ok).toBe(true);
  });
});

describe("canRemoveMember", () => {
  it("admin removes a member; a member can remove themselves", () => {
    expect(canRemoveMember(members, "admin1", "member1").ok).toBe(true);
    expect(canRemoveMember(members, "member1", "member1").ok).toBe(true);
  });
  it("member cannot remove others", () => {
    expect(canRemoveMember(members, "member1", "admin1").ok).toBe(false);
  });
  it("cannot remove the last owner", () => {
    const one: Member[] = [{ userId: "o", role: "owner" }];
    expect(canRemoveMember(one, "o", "o").ok).toBe(false);
  });
});

describe("canInvite", () => {
  it("admin invites members/admins but not owners", () => {
    expect(canInvite(members, "admin1", "member").ok).toBe(true);
    expect(canInvite(members, "admin1", "owner").ok).toBe(false);
  });
  it("owner can invite an owner", () => {
    expect(canInvite(members, "owner1", "owner").ok).toBe(true);
  });
  it("member cannot invite", () => {
    expect(canInvite(members, "member1", "member").ok).toBe(false);
  });
});

describe("canAcceptInvite", () => {
  const base: Invite = { id: "i", orgId: "o", email: "a@b.com", role: "member", status: "pending", expiresAt: 2000 };
  it("accepts a valid pending invite", () => {
    expect(canAcceptInvite(base, 1000).ok).toBe(true);
  });
  it("rejects expired or non-pending invites", () => {
    expect(canAcceptInvite(base, 3000).ok).toBe(false);
    expect(canAcceptInvite({ ...base, status: "revoked" }, 1000).ok).toBe(false);
  });
});
