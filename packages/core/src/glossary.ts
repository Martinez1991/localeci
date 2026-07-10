/**
 * `localeci.glossary.json` — terminology control (spec §4).
 * Terms feed the prompt AND are enforced post-translation by the validator.
 */
import { z } from "zod";

export const GlossaryTermSchema = z.object({
  term: z.string().min(1),
  /** Per-locale forced translation. Absent locale ⇒ not constrained for that locale. */
  translations: z.record(z.string(), z.string()).default({}),
  /** e.g. "never translate" keeps the term identical to the source. */
  note: z.string().optional(),
});

export const GlossarySchema = z.object({
  terms: z.array(GlossaryTermSchema).default([]),
});

export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;
export type Glossary = z.infer<typeof GlossarySchema>;

export function parseGlossary(raw: unknown): Glossary {
  return GlossarySchema.parse(raw);
}

/** True when a term is marked never-translate. */
export function isNeverTranslate(term: GlossaryTerm): boolean {
  return (term.note ?? "").toLowerCase().includes("never translate");
}

/** The terms relevant to a given target locale, with the forced target (if any). */
export interface ResolvedTerm {
  term: string;
  target: string | null; // null ⇒ keep as-is (never translate) or unconstrained
  neverTranslate: boolean;
  note?: string;
}

export function resolveGlossaryForLocale(glossary: Glossary, locale: string): ResolvedTerm[] {
  return glossary.terms.map((t) => {
    const never = isNeverTranslate(t);
    const target = never ? t.term : (t.translations[locale] ?? null);
    const resolved: ResolvedTerm = { term: t.term, target, neverTranslate: never };
    if (t.note !== undefined) resolved.note = t.note;
    return resolved;
  });
}
