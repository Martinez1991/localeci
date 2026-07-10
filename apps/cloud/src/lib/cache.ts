/**
 * Cache abstraction (issue #18). A hot translation-memory cache in front of the
 * proxy short-circuits repeat translations of identical strings without hitting
 * the LLM — the same idempotency the lockfile gives BYO-key users, at the
 * request layer for the cloud.
 *
 * Pure and unit-tested; production swaps `InMemoryLru` for a KV/Redis-backed
 * `Cache` with the same interface (a `KvCache` reference is provided).
 */
import { createHash } from "node:crypto";
import type { Provider, TranslateBatch, TranslateResult } from "@localeci/core";

export interface Cache<V = unknown> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V, ttlMs?: number): Promise<void>;
}

interface Entry<V> {
  value: V;
  expiresAt: number; // epoch ms; Infinity = no TTL
}

/** In-memory LRU with optional TTL (tests / single instance). */
export class InMemoryLru<V = unknown> implements Cache<V> {
  private map = new Map<string, Entry<V>>();
  constructor(private max = 1000, private now: () => number = () => Date.now()) {}

  async get(key: string): Promise<V | undefined> {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    // LRU: refresh recency.
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  async set(key: string, value: V, ttlMs?: number): Promise<void> {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: ttlMs ? this.now() + ttlMs : Infinity });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

/** Stable cache key for a single (source, target, tier) translation unit. */
export function translationKey(sourceLocale: string, targetLocale: string, tier: string, text: string): string {
  const h = createHash("sha256").update(`${sourceLocale}|${targetLocale}|${tier}|${text}`).digest("hex").slice(0, 32);
  return `tm:${h}`;
}

/**
 * Wrap a provider so `translate` serves cache hits per-item and only sends the
 * cache misses to the underlying provider (then caches the results). Judge/embed
 * pass through unchanged.
 */
export function withCache(provider: Provider, cache: Cache<string>, ttlMs = 30 * 24 * 60 * 60 * 1000): Provider {
  return {
    ...provider,
    name: `${provider.name}+cache`,
    async translate(batch: TranslateBatch): Promise<TranslateResult> {
      const hits = new Map<string, string>();
      const misses: typeof batch.items = [];
      for (const item of batch.items) {
        const key = translationKey(batch.sourceLocale, batch.targetLocale, batch.tier, item.text);
        const cached = await cache.get(key);
        if (cached !== undefined) hits.set(item.id, cached);
        else misses.push(item);
      }

      let model = `${provider.name}:cache`;
      let tokensIn = 0;
      let tokensOut = 0;
      if (misses.length > 0) {
        const res = await provider.translate({ ...batch, items: misses });
        model = res.model;
        tokensIn = res.tokensIn;
        tokensOut = res.tokensOut;
        for (const t of res.translations) {
          const src = misses.find((m) => m.id === t.id);
          if (src) {
            await cache.set(translationKey(batch.sourceLocale, batch.targetLocale, batch.tier, src.text), t.text, ttlMs);
          }
          hits.set(t.id, t.text);
        }
      }

      // Preserve input order.
      const translations = batch.items.map((it) => ({ id: it.id, text: hits.get(it.id) ?? "" }));
      return { translations, model, tokensIn, tokensOut };
    },
  };
}
