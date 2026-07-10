/**
 * Plain-text parser (spec roadmap: app store metadata).
 *
 * The whole file is a single translatable string. This covers Fastlane-style
 * app store metadata, where each field is its own file
 * (`fastlane/metadata/en-US/description.txt`, `name.txt`, `keywords.txt`, …) and
 * the locale is a directory segment handled by the target-path mapper.
 */
import type { FlatEntry } from "../types.js";
import type { Parser } from "./types.js";

export const textParser: Parser = {
  id: "text",
  parse(raw: string): FlatEntry[] {
    if (raw.trim() === "") return [];
    return [{ key: "content", value: raw.replace(/\n+$/, "") }];
  },
  serialize(entries: FlatEntry[], original: string): string {
    const value = entries[0]?.value ?? "";
    const hadTrailingNewline = original === "" || original.endsWith("\n");
    return hadTrailingNewline ? value + "\n" : value;
  },
};
