/**
 * Validator #3 — HTML/tags (spec §6.3). Tags must be balanced and the multiset
 * of tag names must be equivalent between source and translation.
 */
import type { ValidationIssue } from "../types.js";

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

interface TagToken {
  name: string;
  kind: "open" | "close" | "self";
}

function tokenize(text: string): TagToken[] {
  const tokens: TagToken[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    const raw = m[0];
    const name = m[1]!.toLowerCase();
    if (raw.startsWith("</")) tokens.push({ name, kind: "close" });
    else if (m[2] === "/") tokens.push({ name, kind: "self" });
    else tokens.push({ name, kind: "open" });
  }
  return tokens;
}

function isBalanced(tokens: TagToken[]): boolean {
  const stack: string[] = [];
  for (const t of tokens) {
    if (t.kind === "open") stack.push(t.name);
    else if (t.kind === "close") {
      const top = stack.pop();
      if (top !== t.name) return false;
    }
  }
  return stack.length === 0;
}

function nameMultiset(tokens: TagToken[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t.name, (m.get(t.name) ?? 0) + 1);
  return m;
}

export function validateHtml(source: string, target: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const srcTokens = tokenize(source);
  const tgtTokens = tokenize(target);
  if (srcTokens.length === 0 && tgtTokens.length === 0) return issues;

  if (!isBalanced(tgtTokens)) {
    issues.push({
      validator: "html",
      severity: "error",
      message: "Translation has unbalanced HTML tags",
    });
  }

  const srcCounts = nameMultiset(srcTokens);
  const tgtCounts = nameMultiset(tgtTokens);
  const names = new Set([...srcCounts.keys(), ...tgtCounts.keys()]);
  for (const name of names) {
    const s = srcCounts.get(name) ?? 0;
    const t = tgtCounts.get(name) ?? 0;
    if (s !== t) {
      issues.push({
        validator: "html",
        severity: "error",
        message: `Tag <${name}> count differs (source ${s}, translation ${t})`,
      });
    }
  }
  return issues;
}
