import type { FormatId } from "../types.js";
import type { Parser } from "./types.js";
import { jsonParser, i18nextParser, nextIntlParser } from "./json.js";
import { yamlParser } from "./yaml.js";
import { poParser } from "./po.js";
import { stringsParser } from "./strings.js";
import { androidParser } from "./androidXml.js";
import { fluentParser } from "./fluent.js";
import { markdownParser } from "./markdown.js";
import { textParser } from "./text.js";

const REGISTRY: Record<FormatId, Parser> = {
  json: jsonParser,
  i18next: i18nextParser,
  "next-intl": nextIntlParser,
  yaml: yamlParser,
  po: poParser,
  strings: stringsParser,
  android: androidParser,
  fluent: fluentParser,
  markdown: markdownParser,
  text: textParser,
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
  if (lower.endsWith(".strings")) return "strings";
  if (lower.endsWith(".xml")) return "android";
  if (lower.endsWith(".ftl")) return "fluent";
  if (lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".txt")) return "text";
  return null;
}

export * from "./types.js";
export * from "./flatten.js";
export {
  jsonParser,
  i18nextParser,
  nextIntlParser,
  yamlParser,
  poParser,
  stringsParser,
  androidParser,
  fluentParser,
  markdownParser,
  textParser,
};
