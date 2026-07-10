/**
 * Upstash Redis client + wired adapters (issue #9/#11/#18). Reference
 * implementation — plug credentials via env; the algorithms are already
 * unit-tested in src/lib/{kvRateLimiter,cache}.ts.
 */
import { Redis } from "@upstash/redis";
import { KvRateLimiter } from "../lib/kvRateLimiter.js";
import { KvCache } from "./kvCache.js";

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

/** Distributed rate limiter shared across all serverless instances. */
export const kvRateLimiter = new KvRateLimiter(redis as unknown as { incr(k: string): Promise<number>; pexpire(k: string, ms: number): Promise<unknown> });

/** Distributed hot TM cache. Pass to `withCache(platformProvider(), kvCache)`. */
export const kvCache = new KvCache<string>(redis as unknown as { get<T>(k: string): Promise<T | null>; set<T>(k: string, v: T, o?: { px?: number }): Promise<unknown> });
