/**
 * Deterministic validation runner (spec §6). Runs before the LLM judge; any
 * error means score 0 and the translation is never written to a file.
 */
import type { ValidationIssue, ValidationResult, FlatEntry } from "../types.js";
import type { ResolvedTerm } from "../glossary.js";
import { looksLikeIcu } from "../icu/index.js";
import { validatePlaceholders } from "./placeholders.js";
import { validateIcu } from "./icu.js";
import { validateHtml } from "./html.js";
import { validateGlossary } from "./glossary.js";
import { validateSanity } from "./sanity.js";

export interface ValidateParams {
  source: string;
  target: string;
  targetLocale: string;
  /** Resolved glossary terms for this target locale. */
  glossary?: ResolvedTerm[];
  /** Source entry meta (to know if it's an ICU string). */
  meta?: FlatEntry["meta"];
}

export function validateTranslation(params: ValidateParams): ValidationResult {
  const { source, target, targetLocale, glossary = [], meta } = params;
  const issues: ValidationIssue[] = [];

  const isIcu = meta?.isIcu || looksLikeIcu(source);

  if (isIcu) {
    // ICU validator subsumes placeholder checks for ICU strings.
    issues.push(...validateIcu(source, target, targetLocale));
  } else {
    issues.push(...validatePlaceholders(source, target));
  }

  issues.push(...validateHtml(source, target));
  issues.push(...validateGlossary(source, target, glossary));

  const allowedIdentical = glossary.filter((t) => t.neverTranslate).map((t) => t.term);
  issues.push(...validateSanity(source, target, { targetLocale, allowedIdentical }));

  const hasError = issues.some((i) => i.severity === "error");
  return { ok: !hasError, issues };
}

export { validatePlaceholders, extractPlaceholders } from "./placeholders.js";
export { validateIcu } from "./icu.js";
export { validateHtml } from "./html.js";
export { validateGlossary } from "./glossary.js";
export { validateSanity } from "./sanity.js";
