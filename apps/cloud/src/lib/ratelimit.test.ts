import { describe, it, expect } from "vitest";
import { InMemoryRateLimiter, clientIp } from "./ratelimit.js";
import { checkBudget, MemorySpendStore, dailyKey } from "./budget.js";

describe("InMemoryRateLimiter", () => {
  it("allows up to the limit, then blocks within the window", async () => {
    const rl = new InMemoryRateLimiter();
    for (let i = 0; i < 3; i++) {
      const r = await rl.check("ip:1.2.3.4", 3, 60_000, 1000 + i);
      expect(r.allowed).toBe(true);
    }
    const blocked = await rl.check("ip:1.2.3.4", 3, 60_000, 1005);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetAt).toBeGreaterThan(1005);
  });

  it("frees up after the window slides", async () => {
    const rl = new InMemoryRateLimiter();
    await rl.check("k", 1, 1000, 0);
    expect((await rl.check("k", 1, 1000, 500)).allowed).toBe(false);
    expect((await rl.check("k", 1, 1000, 1500)).allowed).toBe(true); // window passed
  });

  it("isolates keys", async () => {
    const rl = new InMemoryRateLimiter();
    await rl.check("a", 1, 1000, 0);
    expect((await rl.check("b", 1, 1000, 0)).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(clientIp(h)).toBe("9.9.9.9");
  });
});

describe("budget guardrail", () => {
  it("allows spend under the cap and blocks over it", async () => {
    const store = new MemorySpendStore();
    const key = dailyKey("global", "2026-07-10T12:00:00Z");
    expect((await checkBudget(store, key, 5, 10)).allowed).toBe(true);
    await store.add(key, 8);
    const d = await checkBudget(store, key, 5, 10);
    expect(d.allowed).toBe(false); // 8 spent + 5 > 10
    expect(d.remaining).toBe(2);
  });

  it("dailyKey resets per day", () => {
    expect(dailyKey("global", "2026-07-10T23:59:59Z")).not.toBe(dailyKey("global", "2026-07-11T00:00:01Z"));
  });
});
