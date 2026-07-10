import { describe, it, expect } from "vitest";
import { handleReviewAction, type ReviewRow, type ReviewStore } from "./reviewHandler.js";
import { handleMemberInvite, type MemberStore } from "./memberHandler.js";
import { MemoryMembershipStore } from "../authz.js";
import { MemorySemanticMemory } from "@localeci/core";
import { createMockProvider } from "@localeci/providers";
import type { Member } from "../membership.js";

// ── Review handler ─────────────────────────────────────────────────────────

class FakeReviewStore implements ReviewStore {
  saved: Array<{ id: string; patch: unknown }> = [];
  constructor(private rows: Record<string, ReviewRow>) {}
  async findById(id: string): Promise<ReviewRow | null> {
    return this.rows[id] ?? null;
  }
  async saveDecision(id: string, patch: { status: string; finalTarget: string | null; reviewerId: string; reviewedAt: string }): Promise<void> {
    this.saved.push({ id, patch });
  }
}

const row: ReviewRow = {
  id: "r1", orgId: "orgA", key: "nav.save", locale: "pt-BR",
  source: "Save {name}", machineTarget: "Salvar {name}", score: 82, status: "pending",
};

const memberships = new MemoryMembershipStore([
  { userId: "member1", orgId: "orgA", role: "member" },
  { userId: "outsider", orgId: "orgB", role: "owner" },
]);

describe("handleReviewAction", () => {
  it("404 when the review does not exist", async () => {
    const store = new FakeReviewStore({});
    const res = await handleReviewAction("nope", { type: "approve" }, "member1", { reviews: store, memberships, nowIso: "t" });
    expect(res.status).toBe(404);
  });

  it("BOLA: a user from another org is denied (403)", async () => {
    const store = new FakeReviewStore({ r1: row });
    const res = await handleReviewAction("r1", { type: "approve" }, "outsider", { reviews: store, memberships, nowIso: "t" });
    expect(res.status).toBe(403);
    expect(store.saved).toHaveLength(0); // nothing persisted
  });

  it("401 when unauthenticated", async () => {
    const store = new FakeReviewStore({ r1: row });
    const res = await handleReviewAction("r1", { type: "approve" }, null, { reviews: store, memberships, nowIso: "t" });
    expect(res.status).toBe(401);
  });

  it("approve: persists and feeds the TM", async () => {
    const store = new FakeReviewStore({ r1: row });
    const tm = new MemorySemanticMemory();
    const mock = createMockProvider();
    const res = await handleReviewAction("r1", { type: "approve" }, "member1", {
      reviews: store, memberships, tmFor: () => tm, embedder: { embed: (t) => mock.embed!(t) }, nowIso: "2026-07-10",
    });
    expect(res.status).toBe(200);
    expect(store.saved[0]!.patch).toMatchObject({ status: "approved", finalTarget: "Salvar {name}", reviewerId: "member1" });
    expect(tm.size).toBe(1);
  });

  it("422 when a human edit breaks a placeholder", async () => {
    const store = new FakeReviewStore({ r1: row });
    const res = await handleReviewAction("r1", { type: "edit", text: "Salvar" }, "member1", { reviews: store, memberships, nowIso: "t" });
    expect(res.status).toBe(422);
    expect(store.saved).toHaveLength(0);
  });
});

// ── Member-invite handler ──────────────────────────────────────────────────

class FakeMemberStore implements MemberStore {
  created: unknown[] = [];
  constructor(private members: Record<string, Member[]>) {}
  async listMembers(orgId: string): Promise<Member[]> {
    return this.members[orgId] ?? [];
  }
  async createInvite(input: { orgId: string; email: string; role: string; invitedById: string; expiresAt: string }): Promise<{ id: string }> {
    this.created.push(input);
    return { id: "inv1" };
  }
}

const orgMembers: Member[] = [
  { userId: "ownerA", role: "owner" },
  { userId: "adminA", role: "admin" },
  { userId: "memberA", role: "member" },
];
const inviteMemberships = new MemoryMembershipStore([
  { userId: "ownerA", orgId: "orgA", role: "owner" },
  { userId: "adminA", orgId: "orgA", role: "admin" },
  { userId: "memberA", orgId: "orgA", role: "member" },
  { userId: "outsider", orgId: "orgB", role: "owner" },
]);

describe("handleMemberInvite", () => {
  const store = () => new FakeMemberStore({ orgA: orgMembers });

  it("admin invites a member", async () => {
    const s = store();
    const res = await handleMemberInvite("orgA", { email: "new@x.com", role: "member" }, "adminA", { members: s, memberships: inviteMemberships, nowMs: 0 });
    expect(res.status).toBe(200);
    expect(s.created).toHaveLength(1);
  });

  it("outsider is denied (403) and creates nothing", async () => {
    const s = store();
    const res = await handleMemberInvite("orgA", { email: "x@x.com" }, "outsider", { members: s, memberships: inviteMemberships, nowMs: 0 });
    expect(res.status).toBe(403);
    expect(s.created).toHaveLength(0);
  });

  it("admin cannot invite an owner (403)", async () => {
    const s = store();
    const res = await handleMemberInvite("orgA", { email: "x@x.com", role: "owner" }, "adminA", { members: s, memberships: inviteMemberships, nowMs: 0 });
    expect(res.status).toBe(403);
  });

  it("a plain member cannot invite (403 from requireOrgAccess admin gate)", async () => {
    const s = store();
    const res = await handleMemberInvite("orgA", { email: "x@x.com" }, "memberA", { members: s, memberships: inviteMemberships, nowMs: 0 });
    expect(res.status).toBe(403);
  });

  it("400 without an email", async () => {
    const s = store();
    const res = await handleMemberInvite("orgA", { email: "" }, "adminA", { members: s, memberships: inviteMemberships, nowMs: 0 });
    expect(res.status).toBe(400);
  });
});
