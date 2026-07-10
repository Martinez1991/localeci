/**
 * Flatten/unflatten nested objects into dotted-key maps.
 *
 * Pitfalls handled (spec §3):
 *  - `.` inside a key is escaped as `\.` so round-tripping is lossless.
 *  - Arrays become numeric-index segments (`items.0`, `items.1`) and are
 *    reconstructed as arrays on unflatten.
 *  - Only string leaves are treated as translatable; numbers/booleans/null are
 *    preserved verbatim through a separate non-string channel.
 */

export interface FlattenResult {
  /** Translatable string leaves, in source order. */
  strings: Array<{ key: string; value: string }>;
  /** Non-string leaves (numbers/booleans/null) keyed the same way, preserved as-is. */
  nonStrings: Record<string, unknown>;
}

const SEP = ".";

function escapeSegment(seg: string): string {
  return seg.replace(/\\/g, "\\\\").replace(/\./g, "\\.");
}

export function joinKey(path: Array<string | number>): string {
  return path.map((p) => (typeof p === "number" ? String(p) : escapeSegment(p))).join(SEP);
}

/** Split a dotted key back into raw segments, honoring `\.` escapes. */
export function splitKey(key: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (ch === "\\" && i + 1 < key.length) {
      cur += key[i + 1];
      i++;
      continue;
    }
    if (ch === SEP) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function flatten(obj: unknown): FlattenResult {
  const strings: Array<{ key: string; value: string }> = [];
  const nonStrings: Record<string, unknown> = {};

  const walk = (node: unknown, path: Array<string | number>): void => {
    if (typeof node === "string") {
      strings.push({ key: joinKey(path), value: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...path, i]));
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, [...path, k]);
      }
      return;
    }
    // number | boolean | null leaf
    nonStrings[joinKey(path)] = node;
  };

  walk(obj, []);
  return { strings, nonStrings };
}

/**
 * Set a value at a dotted path inside `root`, creating intermediate
 * objects/arrays as needed. A numeric segment implies an array container.
 */
export function setAtPath(root: Record<string, unknown> | unknown[], key: string, value: unknown): void {
  const segs = splitKey(key);
  let node: any = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]!;
    const nextSeg = segs[i + 1]!;
    const wantArray = /^\d+$/.test(nextSeg);
    const idx: string | number = /^\d+$/.test(seg) ? Number(seg) : seg;
    if (node[idx] === undefined || node[idx] === null || typeof node[idx] !== "object") {
      node[idx] = wantArray ? [] : {};
    }
    node = node[idx];
  }
  const last = segs[segs.length - 1]!;
  const lastIdx: string | number = /^\d+$/.test(last) ? Number(last) : last;
  node[lastIdx] = value;
}

/** Rebuild a nested structure from string + non-string leaves. */
export function unflatten(
  strings: Array<{ key: string; value: string }>,
  nonStrings: Record<string, unknown> = {},
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const { key, value } of strings) setAtPath(root, key, value);
  for (const [key, value] of Object.entries(nonStrings)) setAtPath(root, key, value);
  return root;
}
