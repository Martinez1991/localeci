/**
 * iOS `Localizable.strings` parser (spec roadmap: mobile).
 *
 *   /* comment *\/
 *   "key" = "value";
 *
 * Serializer preserves order and comment blocks, updates only changed values,
 * drops orphans, and appends new keys — the golden rule.
 */
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";
import { ParseError } from "./types.js";

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_m, c) => {
    switch (c) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case '"': return '"';
      case "\\": return "\\";
      default: return c;
    }
  });
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/\r/g, "\\r");
}

interface Block {
  comments: string[];
  key: string;
  value: string;
}

// Matches: "key" = "value" ;  (with escaped quotes inside)
const STMT_RE = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;

function parseStrings(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.split(/\r?\n/);
  let pendingComments: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed === "") {
      // blank line ends a comment run only if no statement follows immediately
      pendingComments = [];
      continue;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) {
      pendingComments.push(line);
      continue;
    }
    STMT_RE.lastIndex = 0;
    const m = STMT_RE.exec(line);
    if (m) {
      blocks.push({ comments: pendingComments, key: unescape(m[1]!), value: unescape(m[2]!) });
      pendingComments = [];
    }
  }
  return blocks;
}

export const stringsParser: Parser = {
  id: "strings",
  parse(raw: string): FlatEntry[] {
    if (raw.trim() === "") return [];
    try {
      return parseStrings(raw).map((b) => ({ key: b.key, value: b.value }));
    } catch (e) {
      throw new ParseError(`Invalid .strings: ${(e as Error).message}`);
    }
  },

  serialize(entries: FlatEntry[], original: string): string {
    const origBlocks = original.trim() === "" ? [] : parseStrings(original);
    const entryMap = new Map(entries.map((e) => [e.key, e.value]));
    const emitted = new Set<string>();
    const out: string[] = [];

    for (const b of origBlocks) {
      if (!entryMap.has(b.key)) continue; // orphan
      emitted.add(b.key);
      for (const c of b.comments) out.push(c);
      out.push(`"${escape(b.key)}" = "${escape(entryMap.get(b.key)!)}";`);
    }
    for (const e of entries) {
      if (emitted.has(e.key)) continue;
      out.push(`"${escape(e.key)}" = "${escape(e.value)}";`);
    }
    const hadTrailingNewline = original === "" || original.endsWith("\n");
    return out.join("\n") + (hadTrailingNewline ? "\n" : "");
  },
};
