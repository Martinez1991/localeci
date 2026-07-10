import { describe, it, expect } from "vitest";
import { generateApiKey, hashKey, verifyKey, looksLikeApiKey, KEY_PREFIX } from "./apiKeys.js";
import { PLANS, planFor, checkStringLimit, checkLocaleLimit } from "./plans.js";
import { MemoryUsageStore, currentPeriod } from "./usage.js";
import { handleTranslate, handleJudge, type AuthedOrg } from "./proxy.js";
import { createMockProvider } from "@localeci/providers";
import type { TranslateBatch, JudgeBatch } from "@localeci/core";

describe("apiKeys", () => {
  it("generates a prefixed key and verifies its hash", () => {
    const k = generateApiKey();
    expect(k.secret.startsWith(KEY_PREFIX)).toBe(true);
    expect(k.prefix.length).toBe(12);
    expect(verifyKey(k.secret, k.hash)).toBe(true);
    expect(verifyKey("lcx_live_wrong", k.hash)).toBe(false);
  });
  it("hash is salted (two hashes of same key differ)", () => {
    expect(hashKey("lcx_live_abc")).not.toBe(hashKey("lcx_live_abc"));
    expect(verifyKey("lcx_live_abc", hashKey("lcx_live_abc"))).toBe(true);
  });
  it("recognizes key shape", () => {
    expect(looksLikeApiKey("lcx_live_abcdefghijklmnop")).toBe(true);
    expect(looksLikeApiKey("nope")).toBe(false);
  });
});

describe("plans & limits", () => {
  it("free plan limits", () => {
    expect(planFor("free").stringsPerMonth).toBe(500);
    expect(planFor(null).id).toBe("free");
    expect(planFor("bogus").id).toBe("free");
  });
  it("string limit blocks over-quota requests", () => {
    expect(checkStringLimit(PLANS.free, 490, 5).allowed).toBe(true);
    const over = checkStringLimit(PLANS.free, 498, 5);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(2);
  });
  it("locale limit enforced", () => {
    expect(checkLocaleLimit(PLANS.free, 2).allowed).toBe(true);
    expect(checkLocaleLimit(PLANS.free, 3).allowed).toBe(false);
  });
});

const org: AuthedOrg = { orgId: "org1", plan: PLANS.free };

function batch(n: number): TranslateBatch {
  return {
    sourceLocale: "en",
    targetLocale: "pt-BR",
    tier: "cheap",
    items: Array.from({ length: n }, (_, i) => ({ id: `k${i}`, text: `String number ${i}` })),
    style: { tone: "professional", audience: "SaaS", notes: "" },
    glossary: [],
  };
}

describe("proxy handleTranslate", () => {
  it("translates and meters usage (zero-retention: no content hash by default)", async () => {
    const usage = new MemoryUsageStore();
    const res = await handleTranslate(batch(3), { provider: createMockProvider(), usage, org, today: "2026-07-09" });
    expect(res.status).toBe(200);
    expect(usage.events).toHaveLength(1);
    expect(usage.events[0]!.stringsTranslated).toBe(3);
    expect(usage.events[0]!.contentHash).toBeUndefined();
    expect(await usage.usedInPeriod("org1", "2026-07")).toBe(3);
  });

  it("stores a content hash only when retention is enabled", async () => {
    const usage = new MemoryUsageStore();
    await handleTranslate(batch(2), { provider: createMockProvider(), usage, org, today: "2026-07-09", retention: true });
    expect(usage.events[0]!.contentHash).toBeTruthy();
  });

  it("enforces the monthly string limit (402)", async () => {
    const usage = new MemoryUsageStore();
    await usage.record({ orgId: "org1", period: "2026-07", stringsTranslated: 499, tokensIn: 0, tokensOut: 0, model: "m", locale: "pt-BR" });
    const res = await handleTranslate(batch(5), { provider: createMockProvider(), usage, org, today: "2026-07-09" });
    expect(res.status).toBe(402);
    expect((res.body as { error: string }).error).toContain("limit");
  });

  it("period bucketing is monthly", () => {
    expect(currentPeriod("2026-07-09")).toBe("2026-07");
  });
});

describe("proxy handleJudge", () => {
  it("meters judging without consuming string quota", async () => {
    const usage = new MemoryUsageStore();
    const jb: JudgeBatch = { sourceLocale: "en", targetLocale: "pt-BR", items: [{ id: "a", source: "Save", target: "Salvar" }] };
    const res = await handleJudge(jb, { provider: createMockProvider(), usage, org, today: "2026-07-09" });
    expect(res.status).toBe(200);
    expect(usage.events[0]!.stringsTranslated).toBe(0);
  });
});
