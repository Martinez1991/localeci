/**
 * YAML parser. Preserves comments and key order by editing the parsed
 * `Document` in place (yaml lib), then re-stringifying.
 *
 * Anchors/aliases are intentionally unsupported (spec §3): they appear in <1%
 * of i18n projects and complicate lossless string-level editing. We fail with a
 * clear error rather than silently mistranslating a shared node.
 */
import { parseDocument, isAlias, visit, Scalar, YAMLSeq } from "yaml";
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";
import { ParseError } from "./types.js";
import { flatten, splitKey } from "./flatten.js";

function assertNoAliases(doc: ReturnType<typeof parseDocument>): void {
  let found = false;
  visit(doc, {
    Alias() {
      found = true;
    },
    Node(_key, node) {
      if ((node as { anchor?: string }).anchor) found = true;
    },
  });
  if (found) {
    throw new ParseError(
      "YAML anchors/aliases are not supported. Inline the shared values, or split the file. " +
        "(This keeps per-string translation lossless — see docs.)",
    );
  }
}

function pathFor(key: string): Array<string | number> {
  return splitKey(key).map((s) => (/^\d+$/.test(s) ? Number(s) : s));
}

export const yamlParser: Parser = {
  id: "yaml",
  parse(raw: string): FlatEntry[] {
    const trimmed = raw.trim();
    if (trimmed === "") return [];
    const doc = parseDocument(raw, { keepSourceTokens: false });
    if (doc.errors.length) {
      throw new ParseError(`Invalid YAML: ${doc.errors[0]!.message}`);
    }
    assertNoAliases(doc);
    const js = doc.toJS();
    const { strings } = flatten(js);
    return strings.map(({ key, value }) => ({ key, value }));
  },

  serialize(entries: FlatEntry[], original: string): string {
    const trimmed = original.trim();
    const doc = trimmed === "" ? parseDocument("{}") : parseDocument(original);
    if (doc.errors.length) throw new ParseError(`Invalid YAML: ${doc.errors[0]!.message}`);
    assertNoAliases(doc);

    // Determine which existing string keys survive; drop orphans.
    const js = doc.toJS() ?? {};
    const { strings: origStrings } = flatten(js);
    const entryMap = new Map(entries.map((e) => [e.key, e.value]));

    // 1) Update / delete existing string leaves in place (preserves comments+order).
    for (const { key } of origStrings) {
      const path = pathFor(key);
      if (entryMap.has(key)) {
        doc.setIn(path, entryMap.get(key)!);
      } else {
        doc.deleteIn(path);
      }
    }
    // 2) Append new keys.
    const origKeys = new Set(origStrings.map((s) => s.key));
    for (const e of entries) {
      if (!origKeys.has(e.key)) {
        const node = doc.createNode(e.value) as Scalar;
        doc.setIn(pathFor(e.key), node);
      }
    }
    // Prune now-empty sequences left behind by deletions (cosmetic).
    visit(doc, {
      Seq(_k, seq) {
        if (seq instanceof YAMLSeq) {
          seq.items = seq.items.filter((it) => !(isAlias(it) === false && it == null));
        }
      },
    });

    return doc.toString({ lineWidth: 0 });
  },
};
