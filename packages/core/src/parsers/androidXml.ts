/**
 * Android `strings.xml` parser (spec roadmap: mobile).
 *
 *   <string name="greeting">Hello, %1$s!</string>
 *   <plurals name="items">
 *     <item quantity="one">%d item</item>
 *     <item quantity="other">%d items</item>
 *   </plurals>
 *
 * `<plurals>` are surfaced as ICU MessageFormat (quantities are CLDR
 * categories) so the pipeline treats them uniformly; on serialize they expand
 * back to `<item quantity>` using the target locale's categories. Comments,
 * `<string-array>`, and `translatable="false"` entries pass through verbatim.
 */
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";
import { ParseError } from "./types.js";
import { tryParseIcu, looksLikeIcu } from "../icu/index.js";
import { pluralCategories } from "../icu/plural.js";
import { TYPE, type PluralElement } from "@formatjs/icu-messageformat-parser";

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&");
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

type Node =
  | { kind: "raw"; text: string }
  | { kind: "string"; name: string; value: string; indent: string }
  | { kind: "plurals"; name: string; items: Array<{ quantity: string; text: string }>; indent: string; raw: string };

interface Parsed {
  header: string; // everything up to and including <resources ...>
  footer: string; // </resources> + trailing
  nodes: Node[];
  language: string;
}

function langFromRaw(raw: string): string {
  // Best-effort: values-<lang> is a path concern, not in-file; default en.
  const m = raw.match(/tools:locale="([\w-]+)"/);
  return m?.[1] ?? "en";
}

function parseAndroid(raw: string): Parsed {
  const openMatch = raw.match(/<resources\b[^>]*>/);
  if (!openMatch) throw new ParseError("No <resources> element found");
  const headerEnd = openMatch.index! + openMatch[0].length;
  const closeIdx = raw.lastIndexOf("</resources>");
  if (closeIdx < 0) throw new ParseError("No closing </resources>");
  const header = raw.slice(0, headerEnd);
  const footer = raw.slice(closeIdx);
  const body = raw.slice(headerEnd, closeIdx);

  const nodes: Node[] = [];
  const NODE_RE = /(<!--[\s\S]*?-->)|(<string\b[^>]*>[\s\S]*?<\/string>)|(<plurals\b[^>]*>[\s\S]*?<\/plurals>)|(<string-array\b[^>]*>[\s\S]*?<\/string-array>)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NODE_RE.exec(body)) !== null) {
    // Preserve inter-node whitespace/text verbatim.
    if (m.index > lastIndex) nodes.push({ kind: "raw", text: body.slice(lastIndex, m.index) });
    lastIndex = m.index + m[0].length;
    const chunk = m[0];
    const indentMatch = body.slice(0, m.index).match(/([ \t]*)$/);
    const indent = indentMatch?.[1] ?? "    ";

    if (m[1]) {
      nodes.push({ kind: "raw", text: chunk });
    } else if (m[2]) {
      const nameM = chunk.match(/name="([^"]+)"/);
      const translatable = !/translatable="false"/.test(chunk);
      const valM = chunk.match(/<string\b[^>]*>([\s\S]*?)<\/string>/);
      if (nameM && translatable && valM) {
        nodes.push({ kind: "string", name: nameM[1]!, value: xmlUnescape(valM[1]!), indent });
      } else {
        nodes.push({ kind: "raw", text: chunk });
      }
    } else if (m[3]) {
      const nameM = chunk.match(/name="([^"]+)"/);
      const items: Array<{ quantity: string; text: string }> = [];
      const ITEM_RE = /<item\b[^>]*quantity="([^"]+)"[^>]*>([\s\S]*?)<\/item>/g;
      let im: RegExpExecArray | null;
      while ((im = ITEM_RE.exec(chunk)) !== null) items.push({ quantity: im[1]!, text: xmlUnescape(im[2]!) });
      if (nameM && items.length) {
        nodes.push({ kind: "plurals", name: nameM[1]!, items, indent, raw: chunk });
      } else {
        nodes.push({ kind: "raw", text: chunk });
      }
    } else {
      // string-array → verbatim passthrough
      nodes.push({ kind: "raw", text: chunk });
    }
  }
  if (lastIndex < body.length) nodes.push({ kind: "raw", text: body.slice(lastIndex) });

  return { header, footer, nodes, language: langFromRaw(raw) };
}

function pluralsToIcu(items: Array<{ quantity: string; text: string }>): string {
  const branches = items.map((it) => `${it.quantity} {${it.text}}`);
  return `{count, plural, ${branches.join(" ")}}`;
}

function icuToPluralItems(icuValue: string, categories: string[], indent: string): string {
  const parsed = tryParseIcu(icuValue);
  const plural = parsed.ok && parsed.ast ? (parsed.ast.find((el) => el.type === TYPE.plural) as PluralElement | undefined) : undefined;
  const branchText = (cat: string): string => {
    const opt = plural?.options[cat];
    if (!opt) return "";
    return opt.value.map((el) => (el.type === TYPE.literal ? el.value : el.type === TYPE.pound ? "#" : "")).join("").trim();
  };
  return categories
    .map((cat) => `${indent}    <item quantity="${cat}">${xmlEscape(branchText(cat) || branchText("other"))}</item>`)
    .join("\n");
}

export const androidParser: Parser = {
  id: "android",
  parse(raw: string): FlatEntry[] {
    if (raw.trim() === "") return [];
    const { nodes } = parseAndroid(raw);
    const entries: FlatEntry[] = [];
    for (const n of nodes) {
      if (n.kind === "string") entries.push({ key: n.name, value: n.value });
      else if (n.kind === "plurals") {
        entries.push({ key: n.name, value: pluralsToIcu(n.items), meta: { isIcu: true } });
      }
    }
    return entries;
  },

  serialize(entries: FlatEntry[], original: string): string {
    if (original.trim() === "") {
      // Fresh file.
      const lines = entries.map((e) =>
        e.meta?.isIcu || looksLikeIcu(e.value)
          ? `    <plurals name="${e.key}">\n${icuToPluralItems(e.value, pluralCategories("en"), "")}\n    </plurals>`
          : `    <string name="${e.key}">${xmlEscape(e.value)}</string>`,
      );
      return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${lines.join("\n")}\n</resources>\n`;
    }

    const { header, footer, nodes, language } = parseAndroid(original);
    const categories = pluralCategories(language);
    const entryMap = new Map(entries.map((e) => [e.key, e]));
    const emitted = new Set<string>();
    const out: string[] = [];

    for (const n of nodes) {
      if (n.kind === "raw") {
        out.push(n.text);
      } else if (n.kind === "string") {
        const e = entryMap.get(n.name);
        if (!e) continue; // orphan
        emitted.add(n.name);
        out.push(`<string name="${n.name}">${xmlEscape(e.value)}</string>`);
      } else {
        const e = entryMap.get(n.name);
        if (!e) continue; // orphan
        emitted.add(n.name);
        out.push(`<plurals name="${n.name}">\n${icuToPluralItems(e.value, categories, n.indent)}\n${n.indent}</plurals>`);
      }
    }

    // Append new entries just before </resources>.
    const appended: string[] = [];
    for (const e of entries) {
      if (emitted.has(e.key)) continue;
      if (e.meta?.isIcu || looksLikeIcu(e.value)) {
        appended.push(`    <plurals name="${e.key}">\n${icuToPluralItems(e.value, categories, "")}\n    </plurals>`);
      } else {
        appended.push(`    <string name="${e.key}">${xmlEscape(e.value)}</string>`);
      }
    }

    const bodyStr = out.join("");
    const appendStr = appended.length ? "\n" + appended.join("\n") + "\n" : "";
    return header + bodyStr + appendStr + footer;
  },
};
