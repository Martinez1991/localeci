import { describe, it, expect, vi } from "vitest";
import { KvRateLimiter, type RedisLike } from "./kvRateLimiter.js";
import { sentrySink } from "./logSink.js";
import { createLogger } from "./observability.js";

/** Fake Redis: in-memory counters with TTL awareness (enough for fixed-window). */
class FakeRedis implements RedisLike {
  counts = new Map<string, number>();
  ttl = new Map<string, number>();
  async incr(key: string): Promise<number> {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n;
  }
  async pexpire(key: string, ms: number): Promise<unknown> {
    this.ttl.set(key, ms);
    return 1;
  }
}

describe("KvRateLimiter (fixed-window over Redis)", () => {
  it("allows up to the limit within a window, then blocks", async () => {
    const redis = new FakeRedis();
    const rl = new KvRateLimiter(redis);
    const now = 1_000_000;
    expect((await rl.check("ip:1", 3, 60_000, now)).allowed).toBe(true);
    expect((await rl.check("ip:1", 3, 60_000, now)).allowed).toBe(true);
    const third = await rl.check("ip:1", 3, 60_000, now);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
    expect((await rl.check("ip:1", 3, 60_000, now)).allowed).toBe(false); // 4th
  });

  it("sets a TTL on the first hit of a bucket", async () => {
    const redis = new FakeRedis();
    await new KvRateLimiter(redis).check("k", 5, 30_000, 0);
    expect([...redis.ttl.values()][0]).toBe(30_000);
  });

  it("rolls to a fresh bucket in the next window", async () => {
    const redis = new FakeRedis();
    const rl = new KvRateLimiter(redis);
    await rl.check("k", 1, 1000, 500); // bucket 0
    expect((await rl.check("k", 1, 1000, 900)).allowed).toBe(false); // same bucket, over
    expect((await rl.check("k", 1, 1000, 1500)).allowed).toBe(true); // bucket 1 → fresh
  });

  it("isolates keys", async () => {
    const rl = new KvRateLimiter(new FakeRedis());
    await rl.check("a", 1, 1000, 0);
    expect((await rl.check("b", 1, 1000, 0)).allowed).toBe(true);
  });
});

describe("sentrySink", () => {
  it("forwards error/warn lines to the reporter and everything to the base sink", () => {
    const captured: Array<[string, string | undefined]> = [];
    const reporter = { captureMessage: (m: string, l?: string) => captured.push([m, l]) };
    const base = vi.fn();
    const log = createLogger({ requestId: "r1" }, sentrySink(reporter, base));

    log.info("ok", { source: "secret" });
    log.warn("quota alert");
    log.error("boom");

    expect(base).toHaveBeenCalledTimes(3); // all lines to base
    expect(captured).toEqual([["quota alert", "warning"], ["boom", "error"]]); // only warn+error
    // Redaction still applied by createLogger before the sink sees it.
    expect(base.mock.calls[0]![0].source).toBe("[redacted]");
  });
});
