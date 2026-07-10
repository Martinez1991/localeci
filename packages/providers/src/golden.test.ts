import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  validateTranslation,
  runLocale,
  LockStore,
  parseConfig,
  resolveGlossaryForLocale,
  type FlatEntry,
} from "@localeci/core";
import { createMockProvider } from "./mock.js";

interface GoldenCase {
  id: string;
  source: string;
  targetLocale: string;
  reference: string;
  context?: string;
  glossaryNeverTranslate?: string[];
  traps: string[];
}

const here = dirname(fileURLToPath(import.meta.url));
const datasetPath = resolve(here, "../../../golden/dataset.json");
const dataset = JSON.parse(readFileSync(datasetPath, "utf8")) as { cases: GoldenCase[]; sourceLocale: string };

describe("golden set — reference integrity", () => {
  it.each(dataset.cases)("reference for $id passes all deterministic validators", (c) => {
    const glossary = c.glossaryNeverTranslate
      ? resolveGlossaryForLocale(
          { terms: c.glossaryNeverTranslate.map((t) => ({ term: t, translations: {}, note: "never translate" })) },
          c.targetLocale,
        )
      : [];
    const meta = c.source.includes(", plural,") || c.source.includes(", select,") ? { isIcu: true } : undefined;
    const res = validateTranslation({
      source: c.source,
      target: c.reference,
      targetLocale: c.targetLocale,
      glossary,
      meta,
    });
    if (!res.ok) {
      throw new Error(`${c.id} reference failed: ${res.issues.map((i) => i.message).join("; ")}`);
    }
    expect(res.ok).toBe(true);
  });
});

describe("golden set — structural regression (mock provider)", () => {
  it("no case produces a validator failure through the pipeline", async () => {
    const config = parseConfig({
      source: { locale: "en", files: "x", format: "i18next" },
      targets: ["xx"],
      provider: { name: "mock" },
      quality: { threshold: 70, onBelowThreshold: "flag" },
    });

    const byLocale = new Map<string, GoldenCase[]>();
    for (const c of dataset.cases) {
      const arr = byLocale.get(c.targetLocale) ?? [];
      arr.push(c);
      byLocale.set(c.targetLocale, arr);
    }

    const failures: string[] = [];
    let total = 0;
    for (const [locale, cases] of byLocale) {
      const source: FlatEntry[] = cases.map((c, i) => ({
        key: `${c.id}#${i}`,
        value: c.source,
        meta: c.source.includes(", plural,") || c.source.includes(", select,") ? { isIcu: true } : undefined,
      }));
      const glossaryTerms = [...new Set(cases.flatMap((c) => c.glossaryNeverTranslate ?? []))];
      const glossary = glossaryTerms.length
        ? resolveGlossaryForLocale(
            { terms: glossaryTerms.map((t) => ({ term: t, translations: {}, note: "never translate" })) },
            locale,
          )
        : [];
      const res = await runLocale({
        sourceLocale: "en",
        targetLocale: locale,
        source,
        target: [],
        lock: new LockStore(),
        provider: createMockProvider(),
        config,
        glossary,
        today: "2026-07-09",
      });
      total += res.results.length;
      for (const r of res.results) {
        if (r.decision === "failed") failures.push(`${locale}/${r.key}: ${r.issues.join("; ")}`);
      }
    }

    // Baseline: the mock preserves structure, so zero validator failures.
    expect(failures, failures.join("\n")).toHaveLength(0);
    expect(total).toBe(dataset.cases.length);
  });
});
