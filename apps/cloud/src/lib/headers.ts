/**
 * Security response headers (issue #15, OWASP A05). Applied by the Next
 * middleware to every response.
 *
 * Note on CSP: the reference pages use inline styles, so `style-src` allows
 * 'unsafe-inline'. Scripts are locked to 'self' (no inline JS). Tighten as the
 * UI adopts nonces/hashed styles.
 */
export interface HeaderOptions {
  /** Enable HSTS (only meaningful over HTTPS in production). */
  hsts?: boolean;
  /** Extra CSP connect-src origins (e.g. Sentry, analytics). */
  connectSrc?: string[];
}

export function contentSecurityPolicy(opts: HeaderOptions = {}): string {
  const connect = ["'self'", ...(opts.connectSrc ?? [])].join(" ");
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function securityHeaders(opts: HeaderOptions = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(opts),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (opts.hsts) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}
