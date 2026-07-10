/**
 * Edge middleware (issue #15): applies security headers to every response and
 * issues/enforces the CSRF double-submit cookie. Reference implementation — the
 * pure logic lives in src/lib/{headers,csrf}.ts and is unit-tested.
 */
import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "./lib/headers.js";
import { CSRF_COOKIE, checkCsrf, isMutating, issueCsrfToken } from "./lib/csrf.js";

function allowedOrigins(): string[] {
  const app = process.env.APP_URL ?? "http://localhost:3000";
  return [app];
}

export function middleware(req: NextRequest): NextResponse {
  // CSRF enforcement for state-changing HTML/API requests (Bearer API clients
  // are exempt — they carry no cookies and can't be CSRF'd).
  const isBearer = (req.headers.get("authorization") ?? "").startsWith("Bearer ");
  if (isMutating(req.method) && !isBearer) {
    const check = checkCsrf({
      method: req.method,
      headers: req.headers,
      cookieToken: req.cookies.get(CSRF_COOKIE)?.value ?? null,
      submittedToken: req.headers.get("x-csrf-token"),
      allowedOrigins: allowedOrigins(),
    });
    if (!check.ok) {
      return NextResponse.json({ error: `CSRF check failed: ${check.reason}` }, { status: 403 });
    }
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(securityHeaders({ hsts: process.env.NODE_ENV === "production" }))) {
    res.headers.set(k, v);
  }
  // Ensure a CSRF cookie exists for forms (readable by JS to echo into the header).
  if (!req.cookies.get(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, issueCsrfToken(), { sameSite: "lax", secure: true, path: "/" });
  }
  return res;
}

export const config = {
  // Skip static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
