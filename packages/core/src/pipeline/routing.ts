/**
 * Deterministic model routing (spec §5.5). No LLM decides the tier — a cheap
 * classifier does, so cost is predictable and testable.
 */
import type { ModelTier } from "../provider.js";
import { looksLikeIcu } from "../icu/index.js";

/** Locales considered lower-resource → always routed to the top model. */
const LOW_RESOURCE = new Set(["ja", "ko", "zh", "ar", "hi", "th", "he", "fa", "uk"]);

/** Namespaces whose copy is marketing-grade and worth the top model. */
const MARKETING_NAMESPACES = [/^landing\./, /^marketing\./, /^emails?\./, /^onboarding\./, /^pricing\./];

function baseLanguage(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0]!;
}

export interface RoutingInput {
  key: string;
  text: string;
  targetLocale: string;
  isIcu?: boolean;
}

export function classifyTier(input: RoutingInput): ModelTier {
  if (input.text.length > 80) return "top";
  if (input.isIcu || looksLikeIcu(input.text)) return "top";
  if (/<[a-z]/i.test(input.text)) return "top"; // contains HTML
  if (MARKETING_NAMESPACES.some((re) => re.test(input.key))) return "top";
  if (LOW_RESOURCE.has(baseLanguage(input.targetLocale))) return "top";
  return "cheap";
}
