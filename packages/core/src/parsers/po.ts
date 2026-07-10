/**
 * gettext PO parser/serializer (spec §3).
 *
 * Handles: header block, `msgctxt` (context-qualified keys), `msgid_plural` /
 * `msgstr[n]`, translator/extracted/reference comments, `#, fuzzy` flags, and
 * multiline concatenated strings.
 *
 * Plural entries are surfaced to the pipeline as ICU MessageFormat so the rest
 * of the engine (validators, judge, per-branch translation) treats them
 * uniformly. On serialize, the ICU translation is expanded back into
 * `msgstr[n]` using the target locale's CLDR categories (from the PO
 * `Language:` header).
 */
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";
import { ParseError } from "./types.js";
import { tryParseIcu, looksLikeIcu } from "../icu/index.js";
import { pluralCategories } from "../icu/plural.js";
import { TYPE, type PluralElement } from "@formatjs/icu-messageformat-parser";

/** gettext uses EOT () to join context and id into a unique key. */
const CTX_SEP = "";

interface PoBlock {
  comments: string[]; // raw comment lines including leading '#...'
  flags: string[]; // from '#,' e.g. ["fuzzy"]
  msgctxt?: string;
  msgid: string;
  msgidPlural?: string;
  msgstr?: string; // singular
  msgstrPlural?: string[]; // plural forms
  isHeader: boolean;
}

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_m, c) => {
    switch (c) {
      case "n":
        return "\n";
      case "t":
        return "\t";
      case "r":
        return "\r";
      case '"':
        return '"';
      case "\\":
        return "\\";
      default:
        return c;
    }
  });
}

function escape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
}

/** Parse the string payload following a keyword on one line + continuation lines. */
function collectString(lines: string[], startIdx: number): { value: string; next: number } {
  let value = "";
  const first = lines[startIdx]!;
  const firstQuote = first.indexOf('"');
  if (firstQuote >= 0) value += unescape(first.slice(firstQuote + 1, first.lastIndexOf('"')));
  let i = startIdx + 1;
  while (i < lines.length) {
    const l = lines[i]!.trim();
    if (l.startsWith('"')) {
      value += unescape(l.slice(1, l.lastIndexOf('"')));
      i++;
    } else break;
  }
  return { value, next: i };
}

function parsePo(raw: string): { blocks: PoBlock[]; language: string } {
  const lines = raw.split(/\r?\n/);
  const blocks: PoBlock[] = [];
  let cur: Partial<PoBlock> & { comments: string[]; flags: string[] } = { comments: [], flags: [] };

  const flush = (): void => {
    if (cur.msgid !== undefined || cur.comments.length || cur.flags.length) {
      blocks.push({
        comments: cur.comments,
        flags: cur.flags,
        msgctxt: cur.msgctxt,
        msgid: cur.msgid ?? "",
        msgidPlural: cur.msgidPlural,
        msgstr: cur.msgstr,
        msgstrPlural: cur.msgstrPlural,
        isHeader: (cur.msgid ?? "") === "" && cur.msgctxt === undefined && cur.msgidPlural === undefined,
      });
    }
    cur = { comments: [], flags: [] };
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    if (t === "") {
      flush();
      i++;
      continue;
    }
    if (t.startsWith("#")) {
      if (t.startsWith("#,")) cur.flags.push(...t.slice(2).split(",").map((f) => f.trim()).filter(Boolean));
      cur.comments.push(line);
      i++;
      continue;
    }
    if (t.startsWith("msgctxt")) {
      const r = collectString(lines, i);
      cur.msgctxt = r.value;
      i = r.next;
      continue;
    }
    if (t.startsWith("msgid_plural")) {
      const r = collectString(lines, i);
      cur.msgidPlural = r.value;
      i = r.next;
      continue;
    }
    if (t.startsWith("msgid")) {
      const r = collectString(lines, i);
      cur.msgid = r.value;
      i = r.next;
      continue;
    }
    const pluralMatch = t.match(/^msgstr\[(\d+)\]/);
    if (pluralMatch) {
      const idx = Number(pluralMatch[1]);
      const r = collectString(lines, i);
      cur.msgstrPlural = cur.msgstrPlural ?? [];
      cur.msgstrPlural[idx] = r.value;
      i = r.next;
      continue;
    }
    if (t.startsWith("msgstr")) {
      const r = collectString(lines, i);
      cur.msgstr = r.value;
      i = r.next;
      continue;
    }
    i++;
  }
  flush();

  const header = blocks.find((b) => b.isHeader);
  const language = header?.msgstr?.match(/Language:\s*([\w-]+)/i)?.[1] ?? "en";
  return { blocks, language };
}

function keyOf(b: PoBlock): string {
  return b.msgctxt !== undefined ? `${b.msgctxt}${CTX_SEP}${b.msgid}` : b.msgid;
}

function icuFromPluralForms(forms: Array<string | undefined>, categories: string[], fallback: string[]): string {
  const branches: string[] = [];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]!;
    const text = forms[i] && forms[i] !== "" ? forms[i]! : (fallback[i] ?? fallback[fallback.length - 1] ?? "");
    branches.push(`${cat} {${text}}`);
  }
  return `{count, plural, ${branches.join(" ")}}`;
}

export const poParser: Parser = {
  id: "po",
  parse(raw: string): FlatEntry[] {
    if (raw.trim() === "") return [];
    let parsed: ReturnType<typeof parsePo>;
    try {
      parsed = parsePo(raw);
    } catch (e) {
      throw new ParseError(`Invalid PO: ${(e as Error).message}`);
    }
    const { blocks, language } = parsed;
    const entries: FlatEntry[] = [];
    for (const b of blocks) {
      if (b.isHeader) continue;
      if (b.msgid === "" && b.msgctxt === undefined) continue;

      if (b.msgidPlural !== undefined) {
        const categories = pluralCategories(language, "cardinal");
        const englishForms = [b.msgid, b.msgidPlural];
        const forms = b.msgstrPlural && b.msgstrPlural.some((s) => s && s !== "")
          ? b.msgstrPlural
          : englishForms;
        const value = icuFromPluralForms(forms, categories, englishForms);
        const meta: FlatEntry["meta"] = { isIcu: true, pluralSource: b.msgidPlural };
        if (b.msgctxt !== undefined) meta.context = b.msgctxt;
        if (b.flags.includes("fuzzy")) meta.fuzzy = true;
        entries.push({ key: keyOf(b), value, meta });
      } else {
        const value = b.msgstr && b.msgstr !== "" ? b.msgstr : b.msgid;
        const meta: FlatEntry["meta"] = {};
        if (b.msgctxt !== undefined) meta.context = b.msgctxt;
        if (b.flags.includes("fuzzy")) meta.fuzzy = true;
        entries.push({ key: keyOf(b), value, meta: Object.keys(meta).length ? meta : undefined });
      }
    }
    return entries;
  },

  serialize(entries: FlatEntry[], original: string): string {
    const { blocks, language } = original.trim() === ""
      ? { blocks: [] as PoBlock[], language: "en" }
      : parsePo(original);
    const categories = pluralCategories(language, "cardinal");
    const entryMap = new Map(entries.map((e) => [e.key, e]));
    const out: string[] = [];
    const emittedKeys = new Set<string>();

    const emitBlock = (b: PoBlock): void => {
      for (const c of b.comments) out.push(c);
      if (b.msgctxt !== undefined) out.push(`msgctxt "${escape(b.msgctxt)}"`);
      if (b.isHeader) {
        out.push(`msgid ""`);
        out.push(`msgstr "${escape(b.msgstr ?? "")}"`);
        // Header can be multiline; re-emit as literal escaped single string is valid.
        return;
      }
      out.push(`msgid "${escape(b.msgid)}"`);
      if (b.msgidPlural !== undefined) {
        out.push(`msgid_plural "${escape(b.msgidPlural)}"`);
        const forms = b.msgstrPlural ?? [];
        const n = Math.max(categories.length, forms.length, 1);
        for (let i = 0; i < n; i++) out.push(`msgstr[${i}] "${escape(forms[i] ?? "")}"`);
      } else {
        out.push(`msgstr "${escape(b.msgstr ?? "")}"`);
      }
    };

    for (const b of blocks) {
      if (b.isHeader) {
        emitBlock(b);
        out.push("");
        continue;
      }
      const key = keyOf(b);
      const entry = entryMap.get(key);
      if (!entry) continue; // orphan: drop
      emittedKeys.add(key);
      const updated: PoBlock = { ...b };
      if (b.msgidPlural !== undefined) {
        updated.msgstrPlural = expandIcuToForms(entry.value, categories);
      } else {
        updated.msgstr = entry.value;
      }
      emitBlock(updated);
      out.push("");
    }

    // Append new entries not present in the original target file.
    for (const e of entries) {
      if (emittedKeys.has(e.key)) continue;
      const [ctx, id] = e.key.includes(CTX_SEP) ? e.key.split(CTX_SEP) : [undefined, e.key];
      const block: PoBlock = {
        comments: [],
        flags: [],
        msgctxt: ctx,
        msgid: id!,
        isHeader: false,
      };
      if (e.meta?.pluralSource !== undefined) {
        block.msgidPlural = e.meta.pluralSource;
        block.msgstrPlural = expandIcuToForms(e.value, categories);
      } else {
        block.msgstr = e.value;
      }
      emitBlock(block);
      out.push("");
    }

    return out.join("\n").replace(/\n+$/, "\n");
  },
};

/** Turn a translated ICU plural message into gettext msgstr[n] forms. */
function expandIcuToForms(icuValue: string, categories: string[]): string[] {
  if (!looksLikeIcu(icuValue)) {
    // Not ICU (single form given) → put it in the first slot.
    return categories.map((_, i) => (i === 0 ? icuValue : ""));
  }
  const parsed = tryParseIcu(icuValue);
  if (!parsed.ok || !parsed.ast) return categories.map((_, i) => (i === 0 ? icuValue : ""));
  const plural = parsed.ast.find((el) => el.type === TYPE.plural) as PluralElement | undefined;
  if (!plural) return categories.map((_, i) => (i === 0 ? icuValue : ""));
  const branchText = (cat: string): string => {
    const opt = plural.options[cat];
    if (!opt) return "";
    return opt.value
      .map((el) => (el.type === TYPE.literal ? el.value : ""))
      .join("")
      .trim();
  };
  return categories.map((cat) => branchText(cat) || branchText("other"));
}
