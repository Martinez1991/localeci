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

/** Sensible per-route-class defaults (requests per 60s window). Override via env. */
export const RATE_DEFAULTS = {
  auth: 20, // login / mfa
  write: 60, // keys, reviews, members
  translate: 120, // metered translate/judge
  public: 10, // playground
} as const;

export type RateClass = keyof typeof RATE_DEFAULTS;

export interface GuardDecision {
  ok: boolean;
  status: number; // 200 when ok, 429 when limited
  retryAfterSec: number;
  headers: Record<string, string>;
}

/**
 * Enforce a rate limit and return a response decision + headers. Pure over the
 * injected limiter/clock so it's fully unit-testable; routes map the decision to
 * a NextResponse.
 */
export async function rateGuard(params: {
  limiter: RateLimiter;
  key: string;
  limit: number;
  windowMs?: number;
  now: number;
}): Promise<GuardDecision> {
  const windowMs = params.windowMs ?? 60_000;
  const r = await params.limiter.check(params.key, params.limit, windowMs, params.now);
  const remaining = Math.max(0, r.remaining);
  const headers: Record<string, string> = {
    "x-ratelimit-limit": String(params.limit),
    "x-ratelimit-remaining": String(remaining),
  };
  if (r.allowed) return { ok: true, status: 200, retryAfterSec: 0, headers };
  const retryAfterSec = Math.max(1, Math.ceil((r.resetAt - params.now) / 1000));
  return { ok: false, status: 429, retryAfterSec, headers: { ...headers, "retry-after": String(retryAfterSec) } };
}
