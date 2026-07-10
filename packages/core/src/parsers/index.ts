import type { FormatId } from "../types.js";
import type { Parser } from "./types.js";
import { jsonParser, i18nextParser, nextIntlParser } from "./json.js";
import { yamlParser } from "./yaml.js";
import { poParser } from "./po.js";

const REGISTRY: Record<FormatId, Parser> = {
  json: jsonParser,
  i18next: i18nextParser,
  "next-intl": nextIntlParser,
  yaml: yamlParser,
  po: poParser,
};

export function getParser(format: FormatId): Parser {
  const p = REGISTRY[format];
  if (!p) throw new Error(`Unknown format: ${format}`);
  return p;
}

/** Guess a format from a file extension (used by `init`). */
export function formatFromExtension(path: string): FormatId | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".po") || lower.endsWith(".pot")) return "po";
  return null;
}

export * from "./types.js";
export * from "./flatten.js";
export { jsonParser, i18nextParser, nextIntlParser, yamlParser, poParser };
