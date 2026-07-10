/**
 * Project Fluent (`.ftl`) parser (spec roadmap: docs/apps).
 *
 * MVP scope: simple single-line messages `id = value` are translated;
 * placeables like `{ $name }` and `{ -term }` are preserved as placeholders.
 * Multiline messages, attributes (`.attr`), and selectors (`{ $n -> ... }`) are
 * passed through verbatim — safe and honest, rather than risk mangling them.
 */
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";

type Group =
  | { kind: "raw"; text: string }
  | { kind: "message"; id: string; value: string };

const SIMPLE_RE = /^(-?[a-zA-Z][\w-]*)\s*=\s*(.+)$/;

function splitGroups(raw: string): Group[] {
  const lines = raw.split(/\r?\n/);
  const groups: Group[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    // Blank line or comment or indented → raw passthrough (accumulate run).
    const isTopLevel = /^[-a-zA-Z]/.test(line);
    if (!isTopLevel) {
      groups.push({ kind: "raw", text: line });
      i++;
      continue;
    }
    // Collect this construct: the id line + any indented continuation lines.
    const start = i;
    i++;
    let hasContinuation = false;
    while (i < lines.length && /^[ \t]/.test(lines[i]!)) {
      hasContinuation = true;
      i++;
    }
    const blockLines = lines.slice(start, i);
    const first = blockLines[0]!;
    const m = SIMPLE_RE.exec(first);
    if (m && !hasContinuation && first.startsWith(m[1]!)) {
      groups.push({ kind: "message", id: m[1]!, value: m[2]! });
    } else {
      groups.push({ kind: "raw", text: blockLines.join("\n") });
    }
  }
  return groups;
}

export const fluentParser: Parser = {
  id: "fluent",
  parse(raw: string): FlatEntry[] {
    if (raw.trim() === "") return [];
    const entries: FlatEntry[] = [];
    for (const g of splitGroups(raw)) {
      if (g.kind === "message") entries.push({ key: g.id, value: g.value });
    }
    return entries;
  },

  serialize(entries: FlatEntry[], original: string): string {
    const entryMap = new Map(entries.map((e) => [e.key, e.value]));
    const emitted = new Set<string>();
    const out: string[] = [];

    if (original.trim() !== "") {
      for (const g of splitGroups(original)) {
        if (g.kind === "raw") {
          out.push(g.text);
        } else {
          if (!entryMap.has(g.id)) continue; // orphan
          emitted.add(g.id);
          out.push(`${g.id} = ${entryMap.get(g.id)!}`);
        }
      }
    }
    for (const e of entries) {
      if (emitted.has(e.key)) continue;
      out.push(`${e.key} = ${e.value}`);
    }

    const hadTrailingNewline = original === "" || original.endsWith("\n");
    let result = out.join("\n");
    // splitGroups keeps blank lines as raw; avoid doubling the trailing newline.
    if (hadTrailingNewline && !result.endsWith("\n")) result += "\n";
    return result;
  },
};
