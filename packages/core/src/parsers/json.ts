/**
 * JSON parser for i18next / next-intl style files.
 *
 * Serializer strategy (golden rule): keep the ORIGINAL key order for keys that
 * still exist, drop keys not present in `entries` (orphan removal), append new
 * keys at the end of their object, and preserve the detected indentation and
 * trailing newline. Non-string leaves (numbers/booleans) are preserved as-is.
 */
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";
import { ParseError } from "./types.js";
import { flatten, unflatten } from "./flatten.js";

function detectIndent(raw: string): number | "\t" {
  const m = raw.match(/\n([ \t]+)\S/);
  if (!m) return 2;
  const ws = m[1]!;
  if (ws.includes("\t")) return "\t";
  return ws.length;
}

function makeParser(id: "i18next" | "next-intl" | "json"): Parser {
  return {
    id,
    parse(raw: string): FlatEntry[] {
      const trimmed = raw.trim();
      if (trimmed === "") return [];
      let obj: unknown;
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        throw new ParseError(`Invalid JSON: ${(e as Error).message}`);
      }
      const { strings } = flatten(obj);
      return strings.map(({ key, value }) => ({ key, value }));
    },

    serialize(entries: FlatEntry[], original: string): string {
      const indent = detectIndent(original);
      const hadTrailingNewline = original.length === 0 || original.endsWith("\n");

      // Original structure: source of key ordering + non-string leaves.
      let originalObj: unknown = {};
      const trimmed = original.trim();
      if (trimmed !== "") {
        try {
          originalObj = JSON.parse(original);
        } catch {
          originalObj = {};
        }
      }
      const { strings: origStrings, nonStrings } = flatten(originalObj);

      const entryMap = new Map(entries.map((e) => [e.key, e.value]));
      const seen = new Set<string>();
      const ordered: Array<{ key: string; value: string }> = [];

      // 1) Existing keys keep their position (updated value; dropped if orphaned).
      for (const { key } of origStrings) {
        if (entryMap.has(key)) {
          ordered.push({ key, value: entryMap.get(key)! });
          seen.add(key);
        }
      }
      // 2) New keys appended in entry order.
      for (const e of entries) {
        if (!seen.has(e.key)) {
          ordered.push({ key: e.key, value: e.value });
          seen.add(e.key);
        }
      }

      const rebuilt = unflatten(ordered, nonStrings);
      const json = JSON.stringify(rebuilt, null, indent);
      return hadTrailingNewline ? json + "\n" : json;
    },
  };
}

export const jsonParser = makeParser("json");
export const i18nextParser = makeParser("i18next");
export const nextIntlParser = makeParser("next-intl");
