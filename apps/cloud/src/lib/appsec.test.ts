import { describe, it, expect } from "vitest";
import { checkCsrf, verifyOrigin, issueCsrfToken, verifyDoubleSubmit, isMutating } from "./csrf.js";
import { securityHeaders, contentSecurityPolicy } from "./headers.js";
import { generateTotp, verifyTotp, base32Encode, base32Decode, generateSecret, otpauthUri } from "./totp.js";

const ALLOWED = ["https://localeci.dev"];

describe("CSRF", () => {
  it("lets safe methods through", () => {
    expect(checkCsrf({ method: "GET", headers: new Headers(), allowedOrigins: ALLOWED }).ok).toBe(true);
  });

  it("rejects mutations with a bad/missing origin", () => {
    expect(verifyOrigin(new Headers({ origin: "https://evil.com" }), ALLOWED).ok).toBe(false);
    expect(verifyOrigin(new Headers(), ALLOWED).ok).toBe(false);
    expect(verifyOrigin(new Headers({ origin: "https://localeci.dev" }), ALLOWED).ok).toBe(true);
  });

  it("double-submit token is constant-time compared", () => {
    const t = issueCsrfToken();
    expect(verifyDoubleSubmit(t, t)).toBe(true);
    expect(verifyDoubleSubmit(t, "nope")).toBe(false);
    expect(verifyDoubleSubmit(null, t)).toBe(false);
  });

  it("full gate: origin + token must both pass on POST", () => {
    const token = issueCsrfToken();
    const good = checkCsrf({
      method: "POST",
      headers: new Headers({ origin: "https://localeci.dev", "x-csrf-token": token }),
      cookieToken: token,
      allowedOrigins: ALLOWED,
    });
    expect(good.ok).toBe(true);

    const crossSite = checkCsrf({
      method: "POST",
      headers: new Headers({ origin: "https://evil.com", "x-csrf-token": token }),
      cookieToken: token,
      allowedOrigins: ALLOWED,
    });
    expect(crossSite.ok).toBe(false);

    const noToken = checkCsrf({
      method: "POST",
      headers: new Headers({ origin: "https://localeci.dev" }),
      cookieToken: token,
      allowedOrigins: ALLOWED,
    });
    expect(noToken.ok).toBe(false);
  });

  it("classifies mutating methods", () => {
    expect(isMutating("post")).toBe(true);
    expect(isMutating("GET")).toBe(false);
  });
});

describe("security headers", () => {
  it("sets the core hardening headers", () => {
    const h = securityHeaders({ hsts: true });
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });
  it("omits HSTS unless enabled and merges connect-src", () => {
    expect(securityHeaders()["Strict-Transport-Security"]).toBeUndefined();
    expect(contentSecurityPolicy({ connectSrc: ["https://sentry.io"] })).toContain("https://sentry.io");
  });
});

describe("TOTP (RFC 6238 vectors, SHA1, 8 digits, seed '12345678901234567890')", () => {
  const seed = Buffer.from("12345678901234567890");
  const vectors: Array<[number, string]> = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];
  it.each(vectors)("T=%i → %s", (time, expected) => {
    expect(generateTotp(seed, { time, digits: 8, algorithm: "sha1", period: 30 })).toBe(expected);
  });

  it("base32 round-trips", () => {
    const b = Buffer.from("hello world");
    expect(base32Decode(base32Encode(b)).toString()).toBe("hello world");
  });

  it("verifyTotp accepts the current code and tolerates ±1 step skew", () => {
    const secret = generateSecret();
    const key = base32Decode(secret);
    const now = 1_700_000_000;
    const code = generateTotp(key, { time: now });
    expect(verifyTotp(secret, code, { time: now })).toBe(true);
    expect(verifyTotp(secret, code, { time: now + 30 })).toBe(true); // within window
    expect(verifyTotp(secret, code, { time: now + 120 })).toBe(false); // outside window
    expect(verifyTotp(secret, "000000", { time: now })).toBe(false);
  });

  it("builds an otpauth URI", () => {
    expect(otpauthUri("ABCD", "ada@example.com")).toContain("otpauth://totp/LocaleCI:ada%40example.com");
  });
});
