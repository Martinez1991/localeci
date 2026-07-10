/**
 * Deterministic mock provider (spec §10): no network, no key. Contributors and
 * CI use `provider: "mock"`.
 *
 * It "translates" by pseudo-localizing literal text (accenting vowels, so the
 * output is visibly different but exactly the same length — never tripping the
 * length validator) while preserving every placeholder, HTML tag and ICU branch
 * structure. ICU strings are rebuilt with the target locale's CLDR categories,
 * so a mock translation for Polish or Japanese passes the ICU validator.
 */
import {
  type Provider,
  type TranslateBatch,
  type TranslateResult,
  type JudgeBatch,
  type JudgeResult,
  tryParseIcu,
  requiredCardinalCategories,
  looksLikeIcu,
} from "@localeci/core";
import {
  TYPE,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from "@formatjs/icu-messageformat-parser";

const VOWELS: Record<string, string> = {
  a: "à", e: "è", i: "ì", o: "ò", u: "ù",
  A: "À", E: "È", I: "Ì", O: "Ò", U: "Ù",
};

// Combined placeholder matcher (spans to leave untouched).
const PLACEHOLDER_RE = /(\{\{[^}]+\}\}|\{[^{}]+\}|%(?:\d+\$)?[sdfeg]|%\d+|<\/?[a-zA-Z0-9]+\b[^>]*>|\$t\([^)]*\))/g;

export interface MockGlossaryTerm {
  term: string;
  target: string | null;
  neverTranslate: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pseudo-localize literal text: accent vowels everywhere EXCEPT inside
 * placeholders and glossary terms. Never-translate terms are kept verbatim;
 * mapped terms are replaced with their target form (also kept verbatim).
 */
function pseudoLiteral(text: string, glossary: MockGlossaryTerm[] = []): string {
  const guards: RegExp[] = [PLACEHOLDER_RE];
  const termMap = new Map<string, string>(); // matched source term → output
  for (const g of glossary) {
    const out = g.neverTranslate ? g.term : (g.target ?? g.term);
    termMap.set(g.term.toLowerCase(), out);
    guards.push(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(g.term)}(?![\\p{L}\\p{N}])`, "giu"));
  }
  // Find all guarded spans, then accent the gaps between them.
  const spans: Array<{ start: number; end: number; out: string }> = [];
  for (const re of guards) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (spans.some((s) => start < s.end && end > s.start)) continue;
      const mapped = termMap.get(m[0].toLowerCase());
      spans.push({ start, end, out: mapped ?? m[0] });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  let out = "";
  let last = 0;
  for (const s of spans) {
    out += accentVowels(text.slice(last, s.start));
    out += s.out;
    last = s.end;
  }
  out += accentVowels(text.slice(last));
  return out;
}

function accentVowels(s: string): string {
  return s.replace(/[aeiouAEIOU]/g, (c) => VOWELS[c] ?? c);
}

/** Reconstruct an ICU AST to a string, pseudo-localizing literals and rebuilding
 *  plural branches for the target locale. */
function icuToString(els: MessageFormatElement[], locale: string, glossary: MockGlossaryTerm[]): string {
  let out = "";
  for (const el of els) {
    switch (el.type) {
      case TYPE.literal:
        out += pseudoLiteral(el.value, glossary);
        break;
      case TYPE.pound:
        out += "#";
        break;
      case TYPE.argument:
        out += `{${el.value}}`;
        break;
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        out += `{${el.value}}`;
        break;
      case TYPE.plural: {
        const p = el as PluralElement;
        const cats = requiredCardinalCategories(locale);
        // Reference branch = "other", else first available.
        const refKey = p.options.other ? "other" : Object.keys(p.options)[0]!;
        const refValue = p.options[refKey]!.value;
        const branches = cats.map((c) => `${c} {${icuToString(refValue, locale, glossary)}}`);
        // Preserve any explicit "=N" branches from source.
        for (const k of Object.keys(p.options)) {
          if (k.startsWith("=")) branches.unshift(`${k} {${icuToString(p.options[k]!.value, locale, glossary)}}`);
        }
        const kind = p.pluralType === "ordinal" ? "selectordinal" : "plural";
        out += `{${p.value}, ${kind}, ${branches.join(" ")}}`;
        break;
      }
      case TYPE.select: {
        const s = el as SelectElement;
        const branches = Object.keys(s.options).map(
          (k) => `${k} {${icuToString(s.options[k]!.value, locale, glossary)}}`,
        );
        out += `{${s.value}, select, ${branches.join(" ")}}`;
        break;
      }
      case TYPE.tag:
        out += `<${el.value}>${icuToString(el.children, locale, glossary)}</${el.value}>`;
        break;
      default:
        break;
    }
  }
  return out;
}

function mockTranslateOne(text: string, locale: string, isIcu: boolean, glossary: MockGlossaryTerm[]): string {
  if (isIcu || looksLikeIcu(text)) {
    const parsed = tryParseIcu(text);
    if (parsed.ok && parsed.ast) return icuToString(parsed.ast, locale, glossary);
  }
  return pseudoLiteral(text, glossary);
}

export interface MockOptions {
  /** Force a score for judge (default 96). */
  score?: number;
  /** Model id to report. */
  model?: string;
}

export function createMockProvider(opts: MockOptions = {}): Provider {
  const model = opts.model ?? "mock/pseudo-1";
  return {
    name: "mock",
    async translate(batch: TranslateBatch): Promise<TranslateResult> {
      const glossary: MockGlossaryTerm[] = batch.glossary.map((g) => ({
        term: g.term,
        target: g.target,
        neverTranslate: g.neverTranslate,
      }));
      const translations = batch.items.map((it) => ({
        id: it.id,
        text: mockTranslateOne(it.text, batch.targetLocale, it.isIcu === true, glossary),
      }));
      const tokensIn = batch.items.reduce((a, it) => a + Math.ceil(it.text.length / 4), 0);
      const tokensOut = translations.reduce((a, t) => a + Math.ceil(t.text.length / 4), 0);
      return { translations, model, tokensIn, tokensOut };
    },
    async judge(batch: JudgeBatch): Promise<JudgeResult> {
      const base = opts.score ?? 96;
      // Map a 0–100 target score back to 0–5 dimensions (accuracy weight 2).
      const per = Math.round((base / 100) * 5 * 10) / 10;
      const scores = batch.items.map((it) => ({
        id: it.id,
        accuracy: per,
        fluency: per,
        terminology: per,
        uiFitness: per,
        issues: [] as string[],
      }));
      return { scores, model, tokensIn: 0, tokensOut: 0 };
    },
  };
}
