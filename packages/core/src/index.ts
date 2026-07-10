/**
 * @localeci/core — the engine. Zero network deps beyond whatever a provider
 * package brings. Everything here runs offline and is unit-tested.
 */
export * from "./types.js";
export * from "./config.js";
export * from "./glossary.js";
export * from "./lockfile.js";
export * from "./diff.js";
export * from "./provider.js";
export * from "./pipeline/index.js";
export { estimateCost, rateForModel } from "./pricing.js";
export { storeFieldLimit, checkStoreLimit } from "./storeMetadata.js";
export type { StoreLimitCheck } from "./storeMetadata.js";
export { MemorySemanticMemory } from "./semantic.js";
export type { SemanticMemory, SemanticEntry, SemanticMatch } from "./semantic.js";

// Parsers
export {
  getParser,
  formatFromExtension,
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
  flatten,
  unflatten,
  splitKey,
  joinKey,
} from "./parsers/index.js";
export type { Parser } from "./parsers/types.js";
export { ParseError } from "./parsers/types.js";

// ICU
export {
  tryParseIcu,
  looksLikeIcu,
  collectArguments,
  collectPluralBranches,
  requiredCardinalCategories,
} from "./icu/index.js";
export { pluralCategories } from "./icu/plural.js";

// Validators
export {
  validateTranslation,
  validatePlaceholders,
  extractPlaceholders,
  validateIcu,
  validateHtml,
  validateGlossary,
  validateSanity,
} from "./validators/index.js";
export type { ValidateParams } from "./validators/index.js";
