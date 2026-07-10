/**
 * Translation memory lockfile (`localeci.lock.json`) — the central
 * architectural decision (spec §4).
 *
 * The hash key = sha256(sourceLocale|key|sourceText|targetLocale). A string
 * whose hash is already in the lock never goes to the LLM again, making
 * `translate` idempotent and cheap. `approvedBy: "human"` entries are immutable
 * to the pipeline.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Lockfile, LockEntry, Locale } from "./types.js";

export const LockEntrySchema = z.object({
  source: z.string(),
  target: z.string(),
  locale: z.string(),
  score: z.number().min(0).max(100),
  model: z.string(),
  approvedBy: z.enum(["human", "auto"]),
  translatedAt: z.string(),
});

export const LockfileSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), LockEntrySchema),
});

export function emptyLockfile(): Lockfile {
  return { version: 1, entries: {} };
}

export function parseLockfile(raw: string): Lockfile {
  if (raw.trim() === "") return emptyLockfile();
  const json = JSON.parse(raw);
  return LockfileSchema.parse(json);
}

/** Deterministic content hash identifying a (source string, target) pair. */
export function lockHash(params: {
  sourceLocale: Locale;
  key: string;
  sourceText: string;
  targetLocale: Locale;
}): string {
  const material = `${params.sourceLocale}|${params.key}|${params.sourceText}|${params.targetLocale}`;
  return createHash("sha256").update(material, "utf8").digest("hex");
}

export class LockStore {
  constructor(private lock: Lockfile = emptyLockfile()) {}

  static from(raw: string): LockStore {
    return new LockStore(parseLockfile(raw));
  }

  get(hash: string): LockEntry | undefined {
    return this.lock.entries[hash];
  }

  lookup(params: { sourceLocale: Locale; key: string; sourceText: string; targetLocale: Locale }): LockEntry | undefined {
    return this.get(lockHash(params));
  }

  /**
   * Upsert an entry. A `human`-approved existing entry is never overwritten by
   * an `auto` write (spec §4: human entries are immutable to the pipeline).
   */
  set(hash: string, entry: LockEntry): void {
    const existing = this.lock.entries[hash];
    if (existing?.approvedBy === "human" && entry.approvedBy !== "human") return;
    this.lock.entries[hash] = entry;
  }

  delete(hash: string): void {
    delete this.lock.entries[hash];
  }

  get data(): Lockfile {
    return this.lock;
  }

  /** Stable, pretty JSON with sorted keys for clean diffs. */
  serialize(): string {
    const sortedKeys = Object.keys(this.lock.entries).sort();
    const entries: Record<string, LockEntry> = {};
    for (const k of sortedKeys) entries[k] = this.lock.entries[k]!;
    return JSON.stringify({ version: this.lock.version, entries }, null, 2) + "\n";
  }
}
