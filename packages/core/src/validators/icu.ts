/**
 * Validator #2 — ICU MessageFormat (spec §6.2). "This validator alone is blog
 * post material."
 *
 * Re-parses the translation and checks:
 *  - it is structurally valid ICU;
 *  - the same argument set is referenced;
 *  - each plural block carries exactly the CLDR categories the TARGET locale
 *    requires (e.g. Polish needs `few`; Japanese needs only `other`).
 */
import type { ValidationIssue } from "../types.js";
import {
  tryParseIcu,
  collectArguments,
  collectPluralBranches,
  requiredCardinalCategories,
} from "../icu/index.js";

/** Categories that are always allowed in addition to CLDR ones. */
function isExplicitMatch(cat: string): boolean {
  return cat.startsWith("="); // exact-value matches like =0, =1
}

export function validateIcu(source: string, target: string, targetLocale: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const srcParsed = tryParseIcu(source);
  const tgtParsed = tryParseIcu(target);

  if (!tgtParsed.ok || !tgtParsed.ast) {
    issues.push({
      validator: "icu",
      severity: "error",
      message: `Translation is not valid ICU MessageFormat: ${tgtParsed.error ?? "parse error"}`,
    });
    return issues;
  }
  if (!srcParsed.ok || !srcParsed.ast) {
    // Source itself isn't ICU — nothing structural to compare.
    return issues;
  }

  // Argument set must match.
  const srcArgs = collectArguments(srcParsed.ast);
  const tgtArgs = collectArguments(tgtParsed.ast);
  for (const a of srcArgs) {
    if (!tgtArgs.has(a)) {
      issues.push({
        validator: "icu",
        severity: "error",
        message: `Translation dropped ICU argument {${a}}`,
      });
    }
  }
  for (const a of tgtArgs) {
    if (!srcArgs.has(a)) {
      issues.push({
        validator: "icu",
        severity: "error",
        message: `Translation introduced unknown ICU argument {${a}}`,
      });
    }
  }

  // Plural branches must satisfy the target locale's CLDR categories.
  const required = new Set(requiredCardinalCategories(targetLocale));
  const branches = collectPluralBranches(tgtParsed.ast).filter((b) => !b.ordinal);
  for (const branch of branches) {
    const present = new Set(branch.categories.filter((c) => !isExplicitMatch(c)));
    const missing = [...required].filter((c) => !present.has(c));
    if (missing.length) {
      issues.push({
        validator: "icu",
        severity: "error",
        message: `Plural on {${branch.arg}} is missing CLDR categor${missing.length > 1 ? "ies" : "y"} for ${targetLocale}: ${missing.join(", ")}`,
      });
    }
  }

  return issues;
}
