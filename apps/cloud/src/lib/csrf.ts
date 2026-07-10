/**
 * CSRF protection (issue #15). Defense in depth for state-changing requests:
 *  1. Origin/Referer must match an allowed origin (blocks cross-site form posts).
 *  2. Double-submit token: a random cookie value must equal a submitted value
 *     (form field / header), compared in constant time.
 *
 * Pure and unit-tested; the Next middleware/routes call these.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";

/** Methods that mutate state and therefore require CSRF checks. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutating(method: string): boolean {
  return MUTATING.has(method.toUpperCase());
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Verify the request originates from an allowed site. Requires an Origin (or
 * Referer) header on mutating requests and rejects if it isn't allow-listed.
 */
export function verifyOrigin(
  headers: { get(name: string): string | null },
  allowedOrigins: string[],
): { ok: boolean; reason?: string } {
  const origin = headers.get("origin") ?? originOf(headers.get("referer"));
  if (!origin) return { ok: false, reason: "Missing Origin/Referer" };
  if (!allowedOrigins.includes(origin)) return { ok: false, reason: `Origin not allowed: ${origin}` };
  return { ok: true };
}

export const CSRF_COOKIE = "localeci_csrf";
export const CSRF_HEADER = "x-csrf-token";

export function issueCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time double-submit check. */
export function verifyDoubleSubmit(cookieToken: string | null | undefined, submitted: string | null | undefined): boolean {
  if (!cookieToken || !submitted) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(submitted);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Full CSRF gate for a mutating request. Returns ok=false with a reason to map
 * to a 403. Safe (GET/HEAD) methods pass through.
 */
export function checkCsrf(params: {
  method: string;
  headers: { get(name: string): string | null };
  cookieToken?: string | null;
  submittedToken?: string | null;
  allowedOrigins: string[];
}): { ok: boolean; reason?: string } {
  if (!isMutating(params.method)) return { ok: true };
  const origin = verifyOrigin(params.headers, params.allowedOrigins);
  if (!origin.ok) return origin;
  if (!verifyDoubleSubmit(params.cookieToken, params.submittedToken ?? params.headers.get(CSRF_HEADER))) {
    return { ok: false, reason: "Invalid or missing CSRF token" };
  }
  return { ok: true };
}
