/**
 * API key issuance & verification (spec §8, §11).
 *
 * Format: `lcx_live_<random>`. Only the hash is stored; the full key is shown
 * once. The visible `prefix` (first chars) lets a user recognize a key in the
 * dashboard.
 *
 * Hashing uses scrypt from node:crypto (zero native deps, works everywhere).
 * Production should swap in argon2id — `hashKey`/`verifyKey` are the only two
 * functions to change; the interface stays the same.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const KEY_PREFIX = "lcx_live_";

export interface GeneratedKey {
  /** The full secret, shown to the user exactly once. */
  secret: string;
  /** First 12 chars, safe to store/display (e.g. "lcx_live_abc"). */
  prefix: string;
  /** Salted hash to store in the database. */
  hash: string;
}

export function generateApiKey(rng: () => Buffer = () => randomBytes(24)): GeneratedKey {
  const secret = KEY_PREFIX + rng().toString("base64url");
  return { secret, prefix: secret.slice(0, 12), hash: hashKey(secret) };
}

export function hashKey(secret: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, 32);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyKey(secret: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  const derived = scryptSync(secret, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length + 8;
}
