import type { FlatEntry, FormatId } from "../types.js";

/**
 * A format adapter. `serialize` receives the ORIGINAL raw text so it can
 * preserve key order, indentation and comments — the golden rule (spec §3):
 * the diff of a translated file must contain ONLY the new/changed strings.
 */
export interface Parser {
  id: FormatId;
  parse(raw: string): FlatEntry[];
  serialize(entries: FlatEntry[], original: string): string;
}

export class ParseError extends Error {
  override name = "ParseError";
}
