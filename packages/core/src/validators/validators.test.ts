import { describe, it, expect } from "vitest";
import { validatePlaceholders, extractPlaceholders } from "./placeholders.js";
import { validateIcu } from "./icu.js";
import { validateHtml } from "./html.js";
import { validateGlossary } from "./glossary.js";
import { validateSanity } from "./sanity.js";
import { validateTranslation } from "./index.js";
import type { ResolvedTerm } from "../glossary.js";

describe("placeholders", () => {
  it("extracts all placeholder syntaxes", () => {
    const s = "Hi {name}, you have {{count}} items (%s) <0>link</0> $t(ref)";
    expect(extractPlaceholders(s).sort()).toEqual(
      ["$t(ref)", "%s", "{name}", "{{count}}", "</0>", "<0>"].sort(),
    );
  });

  it("flags missing and extra placeholders", () => {
    expect(validatePlaceholders("Hi {name}", "Olá")).toHaveLength(1);
    expect(validatePlaceholders("Hi", "Olá {x}")).toHaveLength(1);
    expect(validatePlaceholders("Hi {name}", "Olá {name}")).toHaveLength(0);
  });
});

describe("icu", () => {
  it("passes a valid plural translation for the locale", () => {
    const src = "{count, plural, one {# item} other {# items}}";
    const tgt = "{count, plural, one {# Artikel} other {# Artikel}}";
    expect(validateIcu(src, tgt, "de")).toHaveLength(0);
  });

  it("requires the `few` category for Polish", () => {
    const src = "{count, plural, one {# item} other {# items}}";
    const tgtMissingFew = "{count, plural, one {# element} other {# elementów}}";
    const issues = validateIcu(src, tgtMissingFew, "pl");
    expect(issues.some((i) => i.message.includes("few"))).toBe(true);
  });

  it("accepts a single `other` for Japanese", () => {
    const src = "{count, plural, one {# item} other {# items}}";
    const tgt = "{count, plural, other {#件}}";
    expect(validateIcu(src, tgt, "ja")).toHaveLength(0);
  });

  it("flags invalid ICU in the translation", () => {
    const src = "{count, plural, one {# item} other {# items}}";
    expect(validateIcu(src, "{count, plural, one {broken", "en").length).toBeGreaterThan(0);
  });

  it("flags a dropped argument", () => {
    expect(validateIcu("Hello {name}", "Hola", "es").length).toBeGreaterThan(0);
  });
});

describe("html", () => {
  it("passes matching balanced tags", () => {
    expect(validateHtml("Click <b>here</b>", "Clique <b>aqui</b>")).toHaveLength(0);
  });
  it("flags unbalanced tags", () => {
    expect(validateHtml("Click <b>here</b>", "Clique <b>aqui").length).toBeGreaterThan(0);
  });
  it("flags a missing tag", () => {
    expect(validateHtml("<b>x</b> <i>y</i>", "<b>x</b> y").length).toBeGreaterThan(0);
  });
});

describe("glossary", () => {
  const terms: ResolvedTerm[] = [
    { term: "workspace", target: "workspace", neverTranslate: true },
    { term: "board", target: "quadro", neverTranslate: false },
  ];
  it("flags a translated never-translate term", () => {
    const issues = validateGlossary("Open workspace", "Abrir área de trabalho", terms);
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
  it("passes when never-translate term kept", () => {
    expect(validateGlossary("Open workspace", "Abrir workspace", terms)).toHaveLength(0);
  });
  it("warns when a mapped term is not used", () => {
    const issues = validateGlossary("New board", "Novo painel", terms);
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });
});

describe("sanity", () => {
  it("flags empty translation", () => {
    expect(validateSanity("Save", "", { targetLocale: "pt-BR" }).length).toBeGreaterThan(0);
  });
  it("flags prompt leakage", () => {
    const issues = validateSanity("Save changes now", "Here's the translation: Salvar", { targetLocale: "pt-BR" });
    expect(issues.some((i) => i.severity === "error")).toBe(true);
  });
  it("flags absurd length ratio", () => {
    const issues = validateSanity("Hi there", "こんにちは、これは非常に長い翻訳で、元の文字列の長さをはるかに超えています", { targetLocale: "ja" });
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("validateTranslation (runner)", () => {
  it("returns ok for a clean translation", () => {
    const r = validateTranslation({ source: "Save changes", target: "Salvar alterações", targetLocale: "pt-BR" });
    expect(r.ok).toBe(true);
  });
  it("fails on a broken placeholder", () => {
    const r = validateTranslation({ source: "Hi {name}", target: "Olá", targetLocale: "pt-BR" });
    expect(r.ok).toBe(false);
  });
});
