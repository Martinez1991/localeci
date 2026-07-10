/**
 * CLDR plural categories per locale, in canonical order.
 *
 * Backed by `make-plural`'s data with a defensive fallback table for the ~15
 * high-resource locales LocaleCI officially targets, so a surprising upstream
 * export shape can never crash the ICU validator.
 */
import * as pluralCategoriesData from "make-plural/pluralCategories";

const CANONICAL_ORDER = ["zero", "one", "two", "few", "many", "other"] as const;

// Fallback for officially-supported targets (spec: ~15 high-resource langs).
const FALLBACK: Record<string, { cardinal: string[]; ordinal: string[] }> = {
  en: { cardinal: ["one", "other"], ordinal: ["one", "two", "few", "other"] },
  "pt": { cardinal: ["one", "many", "other"], ordinal: ["other"] },
  es: { cardinal: ["one", "many", "other"], ordinal: ["other"] },
  fr: { cardinal: ["one", "many", "other"], ordinal: ["one", "other"] },
  de: { cardinal: ["one", "other"], ordinal: ["other"] },
  it: { cardinal: ["one", "many", "other"], ordinal: ["many", "other"] },
  nl: { cardinal: ["one", "other"], ordinal: ["other"] },
  ru: { cardinal: ["one", "few", "many", "other"], ordinal: ["other"] },
  pl: { cardinal: ["one", "few", "many", "other"], ordinal: ["other"] },
  uk: { cardinal: ["one", "few", "many", "other"], ordinal: ["few", "other"] },
  ja: { cardinal: ["other"], ordinal: ["other"] },
  ko: { cardinal: ["other"], ordinal: ["other"] },
  zh: { cardinal: ["other"], ordinal: ["other"] },
  tr: { cardinal: ["one", "other"], ordinal: ["other"] },
  ar: { cardinal: ["zero", "one", "two", "few", "many", "other"], ordinal: ["other"] },
};

type CategoryTable = Record<string, { cardinal?: string[]; ordinal?: string[] } | string[]>;

function baseLanguage(locale: string): string {
  return locale.toLowerCase().split(/[-_]/)[0]!;
}

function canonicalize(cats: string[]): string[] {
  const set = new Set(cats);
  const ordered: string[] = CANONICAL_ORDER.filter((c) => set.has(c));
  // Preserve any non-canonical categories at the end (defensive).
  for (const c of cats) if (!ordered.includes(c)) ordered.push(c);
  return ordered.length ? ordered : ["other"];
}

export function pluralCategories(locale: string, type: "cardinal" | "ordinal" = "cardinal"): string[] {
  const base = baseLanguage(locale);
  const table = pluralCategoriesData as unknown as CategoryTable | undefined;
  const entry = table?.[base] ?? table?.[locale];

  let cats: string[] | undefined;
  if (entry) {
    if (Array.isArray(entry)) cats = entry;
    else cats = entry[type];
  }
  if (!cats || cats.length === 0) {
    cats = FALLBACK[base]?.[type] ?? FALLBACK[locale]?.[type];
  }
  if (!cats || cats.length === 0) cats = ["one", "other"];
  return canonicalize(cats);
}
