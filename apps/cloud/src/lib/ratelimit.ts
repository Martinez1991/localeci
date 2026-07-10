/**
 * Rate limiting (fixes the "no rate limiting anywhere" finding). Sliding-window
 * counter keyed by IP / session / org. Pure and unit-tested; the cloud swaps the
 * in-memory store for a KV/Redis-backed one with the same interface.
 */
export interface RateResult {
  allowed: boolean;
  remaining: number;
  /** Epoch ms when the window frees up (for Retry-After). */
  resetAt: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowMs: number, now: number): Promise<RateResult>;
}

/** In-memory sliding-window limiter (single instance / tests). */
export class InMemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  async check(key: string, limit: number, windowMs: number, now: number): Promise<RateResult> {
    const start = now - windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > start);
    if (arr.length >= limit) {
      const oldest = arr[0]!;
      this.hits.set(key, arr);
      return { allowed: false, remaining: 0, resetAt: oldest + windowMs };
    }
    arr.push(now);
    this.hits.set(key, arr);
    return { allowed: true, remaining: limit - arr.length, resetAt: now + windowMs };
  }

  /** Drop keys with no recent hits (call periodically to bound memory). */
  sweep(now: number, windowMs: number): void {
    for (const [key, arr] of this.hits) {
      const live = arr.filter((t) => t > now - windowMs);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }
}

/** Best-effort client IP from standard proxy headers. */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
