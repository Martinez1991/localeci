/**
 * Validator #4 — Glossary (spec §6.4). Prompt alone does not guarantee
 * terminology; verify post-translation.
 *
 *  - "never translate" terms must appear verbatim in the translation.
 *  - mapped terms should use the required target form when the source used the
 *    term (best-effort, case-insensitive, word-boundary aware).
 */
import type { ValidationIssue } from "../types.js";
import type { ResolvedTerm } from "../glossary.js";

function wordBoundaryRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use lookarounds so terms containing non-word chars still match sanely.
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu");
}

function contains(haystack: string, term: string): boolean {
  return wordBoundaryRegex(term).test(haystack);
}

export function validateGlossary(
  source: string,
  target: string,
  terms: ResolvedTerm[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const t of terms) {
    const usedInSource = contains(source, t.term);
    if (!usedInSource) continue;

    if (t.neverTranslate) {
      if (!contains(target, t.term)) {
        issues.push({
          validator: "glossary",
          severity: "error",
          message: `Glossary term "${t.term}" must not be translated but is missing from the translation`,
        });
      }
      continue;
    }

    if (t.target) {
      if (!contains(target, t.target)) {
        issues.push({
          validator: "glossary",
          severity: "warning",
          message: `Glossary term "${t.term}" should be translated as "${t.target}"`,
        });
      }
    }
  }
  return issues;
}
