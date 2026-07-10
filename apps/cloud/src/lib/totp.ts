/**
 * TOTP (RFC 6238) for optional MFA / step-up auth (issue #15). Pure, no deps
 * beyond node:crypto, and verified against the RFC 6238 Appendix B test vectors.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type TotpAlgorithm = "sha1" | "sha256" | "sha512";

export interface TotpOptions {
  time?: number; // seconds since epoch
  period?: number; // step, default 30
  digits?: number; // default 6
  algorithm?: TotpAlgorithm;
}

/** HOTP (RFC 4226): HMAC of an 8-byte counter, dynamically truncated. */
export function generateHotp(key: Buffer, counter: number, digits = 6, algorithm: TotpAlgorithm = "sha1"): string {
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (safe for counters < 2^53).
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = createHmac(algorithm, key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

export function generateTotp(key: Buffer, opts: TotpOptions = {}): string {
  const period = opts.period ?? 30;
  const time = opts.time ?? Math.floor(Date.now() / 1000);
  const counter = Math.floor(time / period);
  return generateHotp(key, counter, opts.digits ?? 6, opts.algorithm ?? "sha1");
}

// ── Base32 (RFC 4648, no padding) for shareable secrets ────────────────────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/,"").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a new base32 MFA secret (default 20 bytes / 160 bits). */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

/** otpauth:// URI for QR provisioning. */
export function otpauthUri(secret: string, account: string, issuer = "LocaleCI"): string {
  // The "issuer:account" label keeps the colon separator literal (otpauth spec).
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Verify a code against a base32 secret, tolerating ±`window` steps of clock skew. */
export function verifyTotp(secret: string, code: string, opts: TotpOptions & { window?: number } = {}): boolean {
  const key = base32Decode(secret);
  const period = opts.period ?? 30;
  const time = opts.time ?? Math.floor(Date.now() / 1000);
  const window = opts.window ?? 1;
  const digits = opts.digits ?? 6;
  const clean = code.trim();
  for (let w = -window; w <= window; w++) {
    const candidate = generateTotp(key, { ...opts, time: time + w * period });
    if (candidate.length === clean.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(clean))) return true;
  }
  return false;
}
