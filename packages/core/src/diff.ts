/**
 * Diff stage (spec §5.1): compare source × lock × target files and assign a
 * state to every (key, targetLocale) pair.
 *
 *  - missing       no translation yet → translate
 *  - stale         source changed since the lock → retranslate
 *  - locked-human  human-approved, immutable
 *  - locked-auto   machine translation still valid, skip
 *  - orphan        key gone from source → candidate for removal
 */
import type { DiffEntry, FlatEntry, Locale } from "./types.js";
import type { LockStore } from "./lockfile.js";

export interface DiffInput {
  sourceLocale: Locale;
  targetLocale: Locale;
  source: FlatEntry[];
  target: FlatEntry[];
  lock: LockStore;
}

export function diffLocale(input: DiffInput): DiffEntry[] {
  const { sourceLocale, targetLocale, source, target, lock } = input;
  const sourceMap = new Map(source.map((e) => [e.key, e]));
  const targetMap = new Map(target.map((e) => [e.key, e]));
  const out: DiffEntry[] = [];

  // Walk the source keys → missing / stale / locked / ok.
  for (const s of source) {
    const lockEntry = lock.lookup({
      sourceLocale,
      key: s.key,
      sourceText: s.value,
      targetLocale,
    });
    const targetEntry = targetMap.get(s.key);
    const base: DiffEntry = {
      key: s.key,
      locale: targetLocale,
      state: "missing",
      source: s.value,
    };
    if (targetEntry) base.target = targetEntry.value;
    if (lockEntry) base.lock = lockEntry;
    if (s.meta) base.meta = s.meta;

    if (lockEntry) {
      // Hash matched → source text is identical to when it was locked.
      if (lockEntry.approvedBy === "human") {
        base.state = "locked-human";
      } else {
        base.state = "locked-auto";
      }
      out.push(base);
      continue;
    }

    // No lock match for the current source text.
    if (!targetEntry) {
      base.state = "missing";
    } else {
      // Target exists but no lock entry for this exact source ⇒ source changed
      // since the translation was written (or lock lost) ⇒ stale.
      base.state = "stale";
    }
    out.push(base);
  }

  // Orphans: keys present in the target but gone from the source.
  for (const t of target) {
    if (!sourceMap.has(t.key)) {
      out.push({
        key: t.key,
        locale: targetLocale,
        state: "orphan",
        source: "",
        target: t.value,
        ...(t.meta ? { meta: t.meta } : {}),
      });
    }
  }

  return out;
}

/** Entries that must be sent to the translator. */
export function needsTranslation(entries: DiffEntry[]): DiffEntry[] {
  return entries.filter((e) => e.state === "missing" || e.state === "stale");
}

export interface CoverageRow {
  locale: Locale;
  total: number;
  translated: number;
  missing: number;
  stale: number;
  orphan: number;
  percent: number;
}

export function coverage(locale: Locale, entries: DiffEntry[]): CoverageRow {
  const total = entries.filter((e) => e.state !== "orphan").length;
  const missing = entries.filter((e) => e.state === "missing").length;
  const stale = entries.filter((e) => e.state === "stale").length;
  const orphan = entries.filter((e) => e.state === "orphan").length;
  const translated = total - missing - stale;
  return {
    locale,
    total,
    translated,
    missing,
    stale,
    orphan,
    percent: total === 0 ? 100 : Math.round((translated / total) * 100),
  };
}
