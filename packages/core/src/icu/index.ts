/**
 * ICU MessageFormat helpers (spec §3, §6.2).
 *
 * The engine never sends a raw ICU string to the LLM as one blob — it works
 * branch-by-branch and recomposes. These helpers parse ICU, enumerate the
 * argument/placeholder set, and expose the plural/select branch structure so
 * validators can confirm the translation keeps the branches the target locale
 * requires per CLDR.
 */
import {
  parse as icuParse,
  TYPE,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from "@formatjs/icu-messageformat-parser";
import { pluralCategories } from "./plural.js";

export interface IcuParseResult {
  ok: boolean;
  error?: string;
  ast?: MessageFormatElement[];
}

export function tryParseIcu(message: string): IcuParseResult {
  try {
    const ast = icuParse(message, { requiresOtherClause: false });
    return { ok: true, ast };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Heuristic: does this string look like it uses ICU syntax worth parsing? */
export function looksLikeIcu(message: string): boolean {
  // {arg, plural, ...} / {arg, select, ...} / {arg, selectordinal, ...}
  return /\{\s*[\w-]+\s*,\s*(plural|select|selectordinal)\s*,/.test(message);
}

/** All argument names referenced anywhere in the message (simple + complex). */
export function collectArguments(ast: MessageFormatElement[]): Set<string> {
  const out = new Set<string>();
  const walk = (els: MessageFormatElement[]): void => {
    for (const el of els) {
      switch (el.type) {
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          out.add(el.value);
          break;
        case TYPE.plural:
        case TYPE.select: {
          out.add((el as PluralElement | SelectElement).value);
          const opts = (el as PluralElement | SelectElement).options;
          for (const k of Object.keys(opts)) walk(opts[k]!.value);
          break;
        }
        case TYPE.tag:
          walk(el.children);
          break;
        default:
          break;
      }
    }
  };
  walk(ast);
  return out;
}

export interface PluralBranchInfo {
  arg: string;
  /** CLDR categories present, e.g. ["one","other"] plus explicit "=0" style keys. */
  categories: string[];
  ordinal: boolean;
}

/** Top-level plural/selectordinal blocks (the ones CLDR constrains). */
export function collectPluralBranches(ast: MessageFormatElement[]): PluralBranchInfo[] {
  const out: PluralBranchInfo[] = [];
  const walk = (els: MessageFormatElement[]): void => {
    for (const el of els) {
      if (el.type === TYPE.plural) {
        const p = el as PluralElement;
        out.push({
          arg: p.value,
          categories: Object.keys(p.options),
          ordinal: p.pluralType === "ordinal",
        });
        for (const k of Object.keys(p.options)) walk(p.options[k]!.value);
      } else if (el.type === TYPE.select) {
        const s = el as SelectElement;
        for (const k of Object.keys(s.options)) walk(s.options[k]!.value);
      } else if (el.type === TYPE.tag) {
        walk(el.children);
      }
    }
  };
  walk(ast);
  return out;
}

/**
 * CLDR cardinal categories required for a locale, in canonical order.
 * e.g. en → [one, other]; pl → [one, few, many, other]; ja → [other].
 */
export function requiredCardinalCategories(locale: string): string[] {
  return pluralCategories(locale, "cardinal");
}
