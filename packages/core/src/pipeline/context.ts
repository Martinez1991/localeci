/**
 * Context building (spec §5.2) — the real technical differentiator.
 *
 * File-level context is pure and lives here: the key path, same-namespace
 * neighbors, and any attached comment. Code-level context (ripgrep over the
 * source) touches the filesystem and is injected by the CLI via `codeContext`.
 */
import type { FlatEntry } from "../types.js";

export interface ContextBundle {
  /** One-line human-readable context string handed to the LLM. */
  summary: string;
  neighbors: string[];
}

function namespaceOf(key: string): string {
  const idx = key.lastIndexOf(".");
  return idx === -1 ? "" : key.slice(0, idx);
}

export interface BuildContextOptions {
  /** Max neighbor strings to include. */
  maxNeighbors?: number;
  /** Optional per-key code context, e.g. "button label (src/Nav.tsx)". */
  codeContext?: Map<string, string>;
}

export function buildContext(
  entry: FlatEntry,
  allSource: FlatEntry[],
  opts: BuildContextOptions = {},
): ContextBundle {
  const maxNeighbors = opts.maxNeighbors ?? 4;
  const ns = namespaceOf(entry.key);

  const neighbors = allSource
    .filter((e) => e.key !== entry.key && namespaceOf(e.key) === ns)
    .slice(0, maxNeighbors)
    .map((e) => `${e.key}: ${e.value}`);

  const parts: string[] = [];
  const code = opts.codeContext?.get(entry.key);
  if (code) parts.push(code);
  if (entry.meta?.comment) parts.push(entry.meta.comment);
  if (entry.meta?.context) parts.push(`context: ${entry.meta.context}`);
  if (!code && ns) parts.push(`key namespace: ${ns}`);

  return { summary: parts.join(" · ") || `key: ${entry.key}`, neighbors };
}
