import { describe, it, expect } from "vitest";
import { handleKeyCreation, type KeyStore, type OrgLookup, type Auditor } from "./keyHandler.js";
import { handlePrivacyExport, handlePrivacyDeletion, type ExportGatherer, type DeletionExecutor } from "./privacyHandler.js";
import { handleMfa, type MfaUserStore } from "./mfaHandler.js";
import { MemoryMembershipStore } from "../authz.js";
import type { AuditInput } from "../audit.js";
import type { ExportCollections, OwnedOrg } from "../privacy.js";

class FakeAuditor {
  events: AuditInput[] = [];
  async record(input: AuditInput): Promise<void> {
    this.events.push(input);
  }
}

const memberships = new MemoryMembershipStore([
  { userId: "adminA", orgId: "orgA", role: "admin" },
  { userId: "memberA", orgId: "orgA", role: "member" },
  { userId: "outsider", orgId: "orgB", role: "owner" },
]);
const orgs: OrgLookup = { async ownedOrgId() { return null; } };
const genKey = async () => ({ secret: "lcx_live_secret", prefix: "lcx_live_abc", hash: "scrypt$..." });

describe("handleKeyCreation", () => {
  const store = () => {
    const inserted: unknown[] = [];
    const keys: KeyStore = { async insert(orgId, hash, prefix) { inserted.push({ orgId, hash, prefix }); } };
    const audit = new FakeAuditor();
    return { inserted, keys, audit };
  };

  it("admin creates a key (persist + secret once)", async () => {
    const { inserted, keys, audit } = store();
    const res = await handleKeyCreation("adminA", "orgA", { memberships, orgs, keys, audit, genKey, nowIso: "t" });
    expect(res.status).toBe(200);
    expect((res.body as { apiKey: string }).apiKey).toBe("lcx_live_secret");
    expect(inserted).toHaveLength(1);
  });

  it("a plain member is denied (403, nothing inserted)", async () => {
    const { inserted, keys, audit } = store();
    const res = await handleKeyCreation("memberA", "orgA", { memberships, orgs, keys, audit, genKey, nowIso: "t" });
    expect(res.status).toBe(403);
    expect(inserted).toHaveLength(0);
  });

  it("401 without a user; 400 without an org", async () => {
    const { keys, audit } = store();
    expect((await handleKeyCreation(null, "orgA", { memberships, orgs, keys, audit, genKey, nowIso: "t" })).status).toBe(401);
    expect((await handleKeyCreation("adminA", undefined, { memberships, orgs, keys, audit, genKey, nowIso: "t" })).status).toBe(400);
  });
});

describe("handlePrivacyExport", () => {
  const collections: ExportCollections = {
    user: { id: "u1", email: "a@x.com", name: "Ada", createdAt: "2026-01-01T00:00:00Z", mfaEnabled: false },
    orgs: [], apiKeys: [{ prefix: "lcx_live_abc", lastUsedAt: null, createdAt: "2026-02-01T00:00:00Z" }], usage: [], auditEvents: [],
  };
  const gatherer: ExportGatherer = { async gather() { return { email: "a@x.com", collections }; } };

  it("returns a manifested bundle and audits the access", async () => {
    const audit = new FakeAuditor();
    const res = await handlePrivacyExport("u1", { gatherer, audit, nowIso: "2026-07-10T00:00:00Z" });
    expect(res.status).toBe(200);
    expect((res.body as { manifest: { format: string } }).manifest.format).toBe("localeci-dsar-v1");
    expect(audit.events[0]!.action).toBe("data.exported");
  });

  it("401 without a user", async () => {
    const res = await handlePrivacyExport(null, { gatherer, audit: new FakeAuditor(), nowIso: "t" });
    expect(res.status).toBe(401);
  });
});

describe("handlePrivacyDeletion", () => {
  function makeExec(owned: OwnedOrg[]) {
    const calls: string[] = [];
    const exec: DeletionExecutor = {
      async ownedOrgsWithMembers() { return owned; },
      async transferOwnership(orgId, to) { calls.push(`transfer:${orgId}:${to}`); },
      async deleteOrg(orgId) { calls.push(`delete:${orgId}`); },
      async scrubUser(uid) { calls.push(`scrub:${uid}`); },
    };
    return { exec, calls };
  }

  it("transfers shared org, deletes empty org, scrubs user, and audits first", async () => {
    const { exec, calls } = makeExec([
      { orgId: "shared", members: [{ userId: "heir", role: "admin" }] },
      { orgId: "empty", members: [] },
    ]);
    const audit = new FakeAuditor();
    const res = await handlePrivacyDeletion("u1", { exec, audit, nowIso: "2026-07-10T00:00:00Z" });
    expect(res.status).toBe(200);
    expect(calls).toContain("transfer:shared:heir");
    expect(calls).toContain("delete:empty");
    expect(calls).toContain("scrub:u1");
    expect(audit.events[0]!.action).toBe("data.deleted");
  });
});

describe("handleMfa", () => {
  function makeUsers(secret: string | null) {
    const state = { mfaEnabledAt: null as Date | null };
    const users: MfaUserStore = {
      async get() { return { email: "a@x.com", mfaSecret: secret, mfaEnabledAt: state.mfaEnabledAt }; },
      async setSecret() {},
      async enable() { state.mfaEnabledAt = new Date(); },
    };
    return { users, state };
  }

  it("enroll returns a secret + otpauth uri", async () => {
    const { users } = makeUsers(null);
    const res = await handleMfa("u1", { action: "enroll" }, { users, genSecret: () => "ABCDEF" });
    expect(res.status).toBe(200);
    expect((res.body as { secret: string }).secret).toBe("ABCDEF");
    expect((res.body as { otpauthUri: string }).otpauthUri).toContain("otpauth://totp/");
  });

  it("verify rejects a wrong code (401) and enables on a right one", async () => {
    const { users, state } = makeUsers("SECRET");
    const bad = await handleMfa("u1", { action: "verify", code: "000000" }, { users, verify: () => false });
    expect(bad.status).toBe(401);
    expect(state.mfaEnabledAt).toBeNull();
    const ok = await handleMfa("u1", { action: "verify", code: "123456" }, { users, verify: () => true });
    expect(ok.status).toBe(200);
    expect(state.mfaEnabledAt).not.toBeNull();
  });

  it("verify before enroll → 400", async () => {
    const { users } = makeUsers(null);
    expect((await handleMfa("u1", { action: "verify", code: "1" }, { users })).status).toBe(400);
  });
});
