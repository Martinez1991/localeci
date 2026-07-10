/**
 * Markdown / MDX parser (spec roadmap: docs translation).
 *
 * A document is split into ordered *segments* that exactly repartition the
 * lines: prose blocks are translatable; frontmatter, fenced code, HTML/JSX,
 * MDX `import`/`export`, tables, thematic breaks, reference-link definitions,
 * and blank gaps are marked non-translatable and copied verbatim.
 *
 * Prose blocks are keyed by a content hash so the translation memory stays
 * stable when blocks are reordered; verbatim segments get positional keys.
 * Reconstruction is exact: joining every segment value with "\n" reproduces the
 * original file.
 */
import { createHash } from "node:crypto";
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";

interface Segment {
  key: string;
  value: string; // lines joined by "\n"
  translatable: boolean;
}

function hashKey(text: string): string {
  return "md:" + createHash("sha1").update(text, "utf8").digest("hex").slice(0, 12);
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function isProseBlock(blockLines: string[]): boolean {
  const first = blockLines[0]!.trim();
  if (first === "") return false;
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(first)) return false; // thematic break
  if (first.startsWith("<")) return false; // HTML / JSX
  if (/^(import|export)\s/.test(first)) return false; // MDX
  if (/^\[[^\]]+\]:\s/.test(first)) return false; // reference link def
  if (first.startsWith("<!--")) return false; // comment
  // Table: a block whose second line is a separator row like |---|---|
  if (blockLines.length >= 2 && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(blockLines[1]!) && blockLines[0]!.includes("|")) {
    return false;
  }
  return true;
}

function segmentize(raw: string): Segment[] {
  const lines = raw.split("\n");
  const segs: Segment[] = [];
  const seen = new Map<string, number>();
  let i = 0;
  let rawIdx = 0;

  const pushRaw = (arr: string[]): void => {
    segs.push({ key: `raw:${rawIdx++}`, value: arr.join("\n"), translatable: false });
  };
  const pushProse = (arr: string[]): void => {
    const value = arr.join("\n");
    let key = hashKey(value);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n > 0) key = `${key}#${n}`;
    segs.push({ key, value, translatable: true });
  };

  // Frontmatter: leading --- ... --- block.
  if (lines[0] === "---") {
    let j = 1;
    while (j < lines.length && lines[j] !== "---") j++;
    if (j < lines.length) {
      pushRaw(lines.slice(0, j + 1));
      i = j + 1;
    }
  }

  while (i < lines.length) {
    // Blank gap.
    if (isBlank(lines[i]!)) {
      const start = i;
      while (i < lines.length && isBlank(lines[i]!)) i++;
      pushRaw(lines.slice(start, i));
      continue;
    }
    // Fenced code block.
    const fence = lines[i]!.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const marker = fence[1]!;
      const start = i;
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith(marker)) i++;
      if (i < lines.length) i++; // include closing fence
      pushRaw(lines.slice(start, i));
      continue;
    }
    // Content block: consecutive non-blank, non-fence lines.
    const start = i;
    while (i < lines.length && !isBlank(lines[i]!) && !/^\s*(```+|~~~+)/.test(lines[i]!)) i++;
    const block = lines.slice(start, i);
    if (isProseBlock(block)) pushProse(block);
    else pushRaw(block);
  }

  return segs;
}

export const markdownParser: Parser = {
  id: "markdown",
  parse(raw: string): FlatEntry[] {
    if (raw === "") return [];
    return segmentize(raw).map((s) => ({
      key: s.key,
      value: s.value,
      meta: s.translatable ? undefined : { translatable: false },
    }));
  },

  serialize(entries: FlatEntry[]): string {
    // Every line lives in exactly one segment; joining values with "\n" is exact.
    return entries.map((e) => e.value).join("\n");
  },
};
