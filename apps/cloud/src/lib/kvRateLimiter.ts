/**
 * Distributed rate limiter (issue #11) backed by Redis (Upstash / Vercel KV),
 * implementing the core `RateLimiter` interface so it drops into
 * `server/guard.ts` in place of the in-memory one — sharing limits across all
 * serverless instances.
 *
 * Fixed-window counter (INCR + PEXPIRE): simple, atomic, and cheap. The window
 * key rotates every `windowMs`, so an old bucket expires on its own. The
 * algorithm is unit-tested here against a fake Redis; production passes a real
 * Upstash client.
 */
import type { RateLimiter, RateResult } from "./ratelimit.js";

/** The tiny slice of a Redis client this needs (Upstash `Redis` satisfies it). */
export interface RedisLike {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<unknown>;
}

export class KvRateLimiter implements RateLimiter {
  constructor(private redis: RedisLike, private prefix = "rl:") {}

  async check(key: string, limit: number, windowMs: number, now: number): Promise<RateResult> {
    const bucket = Math.floor(now / windowMs);
    const redisKey = `${this.prefix}${key}:${bucket}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) await this.redis.pexpire(redisKey, windowMs);
    const resetAt = (bucket + 1) * windowMs;
    if (count > limit) return { allowed: false, remaining: 0, resetAt };
    return { allowed: true, remaining: limit - count, resetAt };
  }
}
