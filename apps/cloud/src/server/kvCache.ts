/**
 * KV-backed Cache (issue #18). Implements the core `Cache` interface against a
 * Vercel KV / Upstash Redis client. Reference implementation.
 *
 * Usage: `withCache(platformProvider(), new KvCache(kv))` in the translate proxy.
 */
import type { Cache } from "../lib/cache.js";

interface KvClient {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, opts?: { px?: number }): Promise<unknown>;
}

export class KvCache<V = unknown> implements Cache<V> {
  constructor(private kv: KvClient, private prefix = "localeci:") {}
  async get(key: string): Promise<V | undefined> {
    const v = await this.kv.get<V>(this.prefix + key);
    return v ?? undefined;
  }
  async set(key: string, value: V, ttlMs?: number): Promise<void> {
    await this.kv.set(this.prefix + key, value, ttlMs ? { px: ttlMs } : undefined);
  }
}
