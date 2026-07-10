/**
 * Validator #1 — Placeholders (spec §6.1).
 *
 * The multiset of placeholders in the translation must equal the source's.
 * Covers: {name}, {{count}}, %s/%d/%1$s, <0>…</0> tag indices, and $t(ref)
 * i18next interpolation references.
 */
import type { ValidationIssue } from "../types.js";

const PATTERNS: RegExp[] = [
  /\{\{[^}]+\}\}/g, // {{count}}
  /\{[^{}]+\}/g, // {name} and ICU args (ICU validator checks structure separately)
  /%(?:\d+\$)?[sdfeg]/gi, // %s %d %1$s
  /%\d+/g, // %1 (positional)
  /<\/?\d+>/g, // <0> </0>
  /\$t\([^)]*\)/g, // $t(key)
];

export function extractPlaceholders(text: string): string[] {
  const found: string[] = [];
  const claimed: Array<[number, number]> = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip if this span overlaps one already claimed by an earlier (higher-priority) pattern.
      const overlaps = claimed.some(([s, e]) => start < e && end > s);
      if (!overlaps) {
        claimed.push([start, end]);
        found.push(m[0]);
      }
    }
  }
  return found;
}

function multisetDiff(a: string[], b: string[]): { missing: string[]; extra: string[] } {
  const count = new Map<string, number>();
  for (const x of a) count.set(x, (count.get(x) ?? 0) + 1);
  for (const x of b) count.set(x, (count.get(x) ?? 0) - 1);
  const missing: string[] = [];
  const extra: string[] = [];
  for (const [k, v] of count) {
    for (let i = 0; i < v; i++) missing.push(k);
    for (let i = 0; i < -v; i++) extra.push(k);
  }
  return { missing, extra };
}

export function validatePlaceholders(source: string, target: string): ValidationIssue[] {
  const src = extractPlaceholders(source);
  const tgt = extractPlaceholders(target);
  const { missing, extra } = multisetDiff(src, tgt);
  const issues: ValidationIssue[] = [];
  if (missing.length) {
    issues.push({
      validator: "placeholders",
      severity: "error",
      message: `Translation is missing placeholder(s): ${missing.join(", ")}`,
    });
  }
  if (extra.length) {
    issues.push({
      validator: "placeholders",
      severity: "error",
      message: `Translation added unexpected placeholder(s): ${extra.join(", ")}`,
    });
  }
  return issues;
}
