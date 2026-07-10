/**
 * Validator #5 — Sanity (spec §6.5). Cheap guards against the most common LLM
 * failure modes: empty output, untranslated echo, prompt leakage, and absurd
 * length ratios per language pair.
 */
import type { ValidationIssue } from "../types.js";

/** Max target/source char-length ratio by target base language (spec §6.5 table). */
const MAX_RATIO: Record<string, number> = {
  de: 1.6,
  fr: 1.5,
  es: 1.45,
  "pt": 1.45,
  it: 1.45,
  nl: 1.5,
  ru: 1.5,
  pl: 1.5,
  uk: 1.5,
  tr: 1.35,
  ja: 0.9,
  ko: 0.9,
  zh: 0.8,
  ar: 1.4,
  en: 1.3,
};
const DEFAULT_MAX_RATIO = 1.7;
const MIN_RATIO = 0.25;

const PROMPT_LEAK_PATTERNS: RegExp[] = [
  /here('| i)s the translation/i,
  /\bas an ai\b/i,
  /I (cannot|can't) translate/i,
  /\bsure[,!]?\s+here\b/i,
  /translation:\s*$/i,
  /```/,
];

function baseLanguage(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0]!;
}

export interface SanityOptions {
  /** Terms allowed to appear identical to the source (brands, never-translate). */
  allowedIdentical?: string[];
  targetLocale: string;
}

export function validateSanity(source: string, target: string, opts: SanityOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trimmed = target.trim();

  if (trimmed === "") {
    issues.push({ validator: "sanity", severity: "error", message: "Translation is empty" });
    return issues;
  }

  // Prompt leakage.
  for (const re of PROMPT_LEAK_PATTERNS) {
    if (re.test(target)) {
      issues.push({
        validator: "sanity",
        severity: "error",
        message: "Translation appears to contain prompt/assistant leakage",
      });
      break;
    }
  }

  // Identical to source: allowed only for very short strings or whitelisted terms.
  if (trimmed === source.trim() && source.trim() !== "") {
    const allowed = opts.allowedIdentical ?? [];
    const isAllowed =
      allowed.includes(source.trim()) ||
      source.trim().length <= 2 || // punctuation / single glyph
      /^[\d\s\p{P}\p{S}]+$/u.test(source.trim()); // numbers/symbols only
    if (!isAllowed) {
      issues.push({
        validator: "sanity",
        severity: "warning",
        message: "Translation is identical to the source (possible untranslated string)",
      });
    }
  }

  // Length ratio.
  const srcLen = source.trim().length;
  if (srcLen >= 8) {
    const ratio = trimmed.length / srcLen;
    const max = MAX_RATIO[baseLanguage(opts.targetLocale)] ?? DEFAULT_MAX_RATIO;
    // Allow a little slack over the table value for short strings.
    const effectiveMax = max + (srcLen < 20 ? 0.6 : 0.2);
    if (ratio > effectiveMax) {
      issues.push({
        validator: "sanity",
        severity: "warning",
        message: `Translation is unusually long (ratio ${ratio.toFixed(2)}x, expected ≤ ${max}x for ${opts.targetLocale})`,
      });
    }
    if (ratio < MIN_RATIO) {
      issues.push({
        validator: "sanity",
        severity: "warning",
        message: `Translation is unusually short (ratio ${ratio.toFixed(2)}x)`,
      });
    }
  }

  return issues;
}
