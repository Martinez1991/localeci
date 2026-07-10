/**
 * Core domain types shared across the LocaleCI engine.
 *
 * A `FlatEntry` is the atomic unit the whole pipeline speaks in: a single
 * translatable string identified by a dotted key, decoupled from whatever
 * on-disk format (JSON/YAML/PO) it came from.
 */

export type Locale = string;

/** Format identifiers understood by the parser registry. */
export type FormatId = "i18next" | "next-intl" | "json" | "yaml" | "po";

/**
 * Per-entry metadata a parser can attach and a serializer must be able to
 * round-trip. Everything here is optional — a bare JSON value carries none of it.
 */
export interface EntryMeta {
  /** Developer comment associated with the entry (PO `#.`, JSON sibling `_comment`, YAML comment). */
  comment?: string;
  /** gettext `msgctxt` disambiguation context. */
  context?: string;
  /** True when the source value is an ICU MessageFormat string. */
  isIcu?: boolean;
  /** gettext plural: the untranslated plural source (`msgid_plural`). */
  pluralSource?: string;
  /** gettext fuzzy flag. */
  fuzzy?: boolean;
}

/**
 * A flattened translatable entry. `key` uses `.` as the nesting separator for
 * JSON/YAML; for PO it is the `msgid` (optionally namespaced by `msgctxt`).
 */
export interface FlatEntry {
  key: string;
  value: string;
  meta?: EntryMeta;
}

/** Result of parsing a raw file: entries plus enough to serialize back losslessly. */
export interface ParseResult {
  entries: FlatEntry[];
  format: FormatId;
}

/** A translation-memory lock entry. Hash key = sha256(sourceLocale|key|sourceText|targetLocale). */
export interface LockEntry {
  source: string;
  target: string;
  locale: Locale;
  score: number;
  model: string;
  approvedBy: "human" | "auto";
  translatedAt: string; // YYYY-MM-DD
}

export interface Lockfile {
  version: 1;
  entries: Record<string, LockEntry>;
}

/** Per-string state produced by the diff stage. */
export type EntryState =
  | "missing" // no translation yet → translate
  | "stale" // source changed since lock → retranslate
  | "locked-human" // human-approved, immutable
  | "locked-auto" // machine translation still valid
  | "orphan"; // key gone from source → candidate for removal

export interface DiffEntry {
  key: string;
  locale: Locale;
  state: EntryState;
  source: string;
  /** Current target value on disk, if any. */
  target?: string;
  /** Matching lock entry, if any. */
  lock?: LockEntry;
  meta?: EntryMeta;
}

/** A validation problem found by a deterministic validator. */
export interface ValidationIssue {
  validator: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}
