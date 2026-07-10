/**
 * Shared API request guards (issues #11, #9). Reference glue over the pure
 * libs: one rate limiter + logger per instance (swap the limiter for a
 * KV-backed one in production). Routes call `enforceRateLimit` at the top.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { InMemoryRateLimiter, rateGuard, clientIp, RATE_DEFAULTS, type RateClass } from "../lib/ratelimit.js";
import { createLogger, type Logger } from "../lib/observability.js";

// Production: replace with an Upstash/@vercel/kv-backed RateLimiter.
const limiter = new InMemoryRateLimiter();

/** Rate-limit key: prefer the authenticated subject, else the client IP. */
function rateKey(req: NextRequest, cls: RateClass, subjectId?: string): string {
  const id = subjectId ?? clientIp(req.headers);
  return `${cls}:${id}`;
}

/**
 * Enforce a rate limit for a route class. Returns a 429 NextResponse to short-
 * circuit, or null to proceed. Adds ratelimit headers to a shared bag the route
 * can spread onto its response.
 */
export async function enforceRateLimit(
  req: NextRequest,
  cls: RateClass,
  opts: { subjectId?: string; limit?: number } = {},
): Promise<NextResponse | null> {
  const limit = opts.limit ?? Number(process.env[`RATE_${cls.toUpperCase()}`] ?? RATE_DEFAULTS[cls]);
  const decision = await rateGuard({ limiter, key: rateKey(req, cls, opts.subjectId), limit, now: Date.now() });
  if (!decision.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: decision.headers });
  }
  return null;
}

/** Per-request structured logger with a request id (issue #9). */
export function requestLogger(req: NextRequest, route: string, orgId?: string): { log: Logger; requestId: string } {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  return { log: createLogger({ requestId, route, ...(orgId ? { orgId } : {}) }), requestId };
}
