import { describe, it, expect } from "vitest";
import { MemoryAuditLog, appendEvent, verifyChain, type AuditEvent } from "./audit.js";
import {
  buildDataExport,
  planUserDeletion,
  selectExpired,
  scrubbedUserFields,
  DEFAULT_RETENTION_DAYS,
  type ExportCollections,
} from "./privacy.js";

describe("audit log (hash-chained)", () => {
  it("appends a tamper-evident chain and verifies it", async () => {
    const log = new MemoryAuditLog();
    await log.append({ actorId: "u1", action: "user.login", at: "2026-07-10T10:00:00Z" });
    await log.append({ actorId: "u1", action: "apikey.created", target: "key1", at: "2026-07-10T10:01:00Z" });
    const events = await log.list();
    expect(events).toHaveLength(2);
    expect(events[0]!.prevHash).toMatch(/^0+$/);
    expect(events[1]!.prevHash).toBe(events[0]!.hash);
    expect(verifyChain(events).ok).toBe(true);
  });

  it("detects tampering (edited action)", async () => {
    const log = new MemoryAuditLog();
    await log.append({ actorId: "u1", action: "user.login", at: "2026-07-10T10:00:00Z" });
    await log.append({ actorId: "u1", action: "plan.changed", at: "2026-07-10T10:01:00Z" });
    const events = await log.list();
    const tampered: AuditEvent[] = [{ ...events[0]!, action: "data.deleted" }, events[1]!];
    expect(verifyChain(tampered).ok).toBe(false);
    expect(verifyChain(tampered).brokenAt).toBe(0);
  });

  it("detects reordering/deletion", async () => {
    let prev = appendEvent(null, { actorId: "a", action: "user.login", at: "t0" });
    const e1 = prev;
    prev = appendEvent(prev, { actorId: "a", action: "apikey.created", at: "t1" });
    expect(verifyChain([prev, e1]).ok).toBe(false); // reordered
    expect(verifyChain([e1]).ok).toBe(true); // truncation of the tail is still a valid prefix
  });
});

describe("DSAR export", () => {
  const collections: ExportCollections = {
    user: { id: "u1", email: "ada@x.com", name: "Ada", createdAt: "2026-01-01T00:00:00Z", mfaEnabled: true },
    orgs: [{ id: "o1", name: "Ada Org", role: "owner", plan: "pro" }],
    apiKeys: [{ prefix: "lcx_live_abc", lastUsedAt: null, createdAt: "2026-02-01T00:00:00Z" }],
    usage: [{ period: "2026-07", stringsTranslated: 120, tokensIn: 1000, tokensOut: 900 }],
    auditEvents: [{ action: "user.login", at: "2026-07-10T10:00:00Z" }],
  };

  it("builds a manifested bundle with all categories and no secrets", () => {
    const out = buildDataExport({ userId: "u1", email: "ada@x.com" }, collections, "2026-07-10T12:00:00Z");
    expect(out.manifest.format).toBe("localeci-dsar-v1");
    expect(out.manifest.categories).toContain("apiKeys");
    // Only the prefix is present; there is no hash/secret field anywhere.
    const json = JSON.stringify(out);
    expect(json).toContain("lcx_live_abc");
    expect(json).not.toMatch(/scrypt\$/);
    expect(json).not.toContain("hash");
  });
});

describe("deletion plan", () => {
  it("transfers ownership to the highest-ranked remaining member", () => {
    const plan = planUserDeletion({
      userId: "u1",
      ownedOrgs: [{ orgId: "o1", members: [{ userId: "m", role: "member" }, { userId: "a", role: "admin" }] }],
      now: "2026-07-10T00:00:00Z",
      graceDays: 7,
    });
    const transfer = plan.steps.find((s) => s.kind === "transfer-ownership");
    expect(transfer).toMatchObject({ orgId: "o1", toUserId: "a" }); // admin over member
    expect(plan.steps.some((s) => s.kind === "scrub-user")).toBe(true);
    expect(plan.steps.some((s) => s.kind === "retain-audit")).toBe(true);
    expect(new Date(plan.scheduledAt).getTime()).toBeGreaterThan(new Date("2026-07-10T00:00:00Z").getTime());
  });

  it("deletes a solely-owned empty org", () => {
    const plan = planUserDeletion({ userId: "u1", ownedOrgs: [{ orgId: "o1", members: [] }], now: "2026-07-10T00:00:00Z" });
    expect(plan.steps.some((s) => s.kind === "delete-org")).toBe(true);
  });

  it("scrubbed fields remove PII", () => {
    const f = scrubbedUserFields();
    expect(f.email).toContain("invalid");
    expect(f.name).toBeNull();
    expect(f.mfaSecret).toBeNull();
  });
});

describe("retention", () => {
  it("selects records older than the retention window", () => {
    const recs = [
      { id: "old", createdAt: "2020-01-01T00:00:00Z" },
      { id: "new", createdAt: "2026-07-01T00:00:00Z" },
    ];
    const expired = selectExpired(recs, DEFAULT_RETENTION_DAYS.usageEvents, "2026-07-10T00:00:00Z");
    expect(expired.map((r) => r.id)).toEqual(["old"]);
  });
  it("null retention keeps everything (customer data)", () => {
    expect(selectExpired([{ id: "x", createdAt: "2000-01-01T00:00:00Z" }], null, "2026-07-10T00:00:00Z")).toEqual([]);
  });
});
