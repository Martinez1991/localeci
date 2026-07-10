import { describe, it, expect } from "vitest";
import {
  hasOrgAccess,
  requireOrgAccess,
  MemoryMembershipStore,
  ForbiddenError,
  UnauthorizedError,
} from "./authz.js";

describe("hasOrgAccess", () => {
  it("denies by default (no role)", () => {
    expect(hasOrgAccess(null)).toBe(false);
    expect(hasOrgAccess(undefined)).toBe(false);
  });
  it("enforces the role hierarchy", () => {
    expect(hasOrgAccess("member", "member")).toBe(true);
    expect(hasOrgAccess("member", "admin")).toBe(false);
    expect(hasOrgAccess("admin", "member")).toBe(true);
    expect(hasOrgAccess("owner", "admin")).toBe(true);
  });
});

describe("requireOrgAccess", () => {
  const store = new MemoryMembershipStore([
    { userId: "u1", orgId: "orgA", role: "owner" },
    { userId: "u2", orgId: "orgA", role: "member" },
  ]);

  it("throws Unauthorized without a user", async () => {
    await expect(requireOrgAccess(store, null, "orgA")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("allows a member and returns the role", async () => {
    await expect(requireOrgAccess(store, "u1", "orgA")).resolves.toBe("owner");
  });

  it("BOLA: denies a user accessing an org they are not a member of", async () => {
    await expect(requireOrgAccess(store, "u2", "orgB")).rejects.toBeInstanceOf(ForbiddenError);
    // And a stranger cannot touch orgA at all.
    await expect(requireOrgAccess(store, "attacker", "orgA")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("enforces minimum role (member cannot do admin action)", async () => {
    await expect(requireOrgAccess(store, "u2", "orgA", "admin")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
