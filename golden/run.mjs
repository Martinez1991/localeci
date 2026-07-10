#!/usr/bin/env node
/**
 * Quality-regression harness (spec §10, §9).
 *
 * Runs the pipeline over the golden set and reports:
 *  - validator failure rate (must stay 0),
 *  - average judge score vs a baseline,
 *  - exact-match rate against approved references,
 *  - token usage + estimated cost per 1,000 strings.
 *
 * Provider is chosen from env: set LOCALECI_PROVIDER=anthropic|openai|mock and
 * the matching API key. Defaults to `mock` (structural check, no cost). A CI job
 * fails the build if the failure rate rises or the average score regresses past
 * the baseline in golden/baseline.json.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  runLocale,
  LockStore,
  parseConfig,
  resolveGlossaryForLocale,
} from "@localeci/core";
import { createProviderFromConfig } from "@localeci/providers";

const here = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(resolve(here, "dataset.json"), "utf8"));

// Rough USD price per 1M tokens (input+output blended) for cost estimation.
const PRICE_PER_MTOK = { mock: 0, "anthropic": 3, "openai": 2.5 };

const providerName = process.env.LOCALECI_PROVIDER ?? "mock";
const config = parseConfig({
  source: { locale: dataset.sourceLocale, files: "x", format: "i18next" },
  targets: ["xx"],
  provider: { name: providerName },
  quality: { threshold: 70, onBelowThreshold: "flag" },
});
const provider = createProviderFromConfig(config, { env: process.env });

const byLocale = new Map();
for (const c of dataset.cases) {
  const arr = byLocale.get(c.targetLocale) ?? [];
  arr.push(c);
  byLocale.set(c.targetLocale, arr);
}

let total = 0;
let failures = 0;
let scoreSum = 0;
let exactMatches = 0;
let tokensIn = 0;
let tokensOut = 0;
const refByKey = new Map();

for (const [locale, cases] of byLocale) {
  const source = cases.map((c, i) => {
    const key = `${c.id}#${i}`;
    refByKey.set(key, c.reference);
    return {
      key,
      value: c.source,
      meta: c.source.includes(", plural,") || c.source.includes(", select,") ? { isIcu: true } : undefined,
    };
  });
  const glossaryTerms = cases.flatMap((c) => c.glossaryNeverTranslate ?? []);
  const glossary = glossaryTerms.length
    ? resolveGlossaryForLocale(
        { terms: [...new Set(glossaryTerms)].map((t) => ({ term: t, translations: {}, note: "never translate" })) },
        locale,
      )
    : [];

  const res = await runLocale({
    sourceLocale: dataset.sourceLocale,
    targetLocale: locale,
    source,
    target: [],
    lock: new LockStore(),
    provider,
    config,
    glossary,
    today: "2026-07-09",
  });

  tokensIn += res.tokensIn;
  tokensOut += res.tokensOut;
  for (const r of res.results) {
    total++;
    if (r.decision === "failed") failures++;
    else scoreSum += r.score;
    if (r.target.trim() === (refByKey.get(r.key) ?? "").trim()) exactMatches++;
  }
}

const scored = total - failures;
const avgScore = scored ? Math.round(scoreSum / scored) : 0;
const failureRate = total ? failures / total : 0;
const totalTokens = tokensIn + tokensOut;
const costPer1k = (totalTokens / total) * 1000 * (PRICE_PER_MTOK[providerName] ?? 0) / 1_000_000;

const report = {
  provider: providerName,
  total,
  failures,
  failureRate: Number(failureRate.toFixed(3)),
  avgScore,
  exactMatchRate: Number((exactMatches / total).toFixed(3)),
  tokensIn,
  tokensOut,
  estCostPer1kStringsUsd: Number(costPer1k.toFixed(3)),
};

console.log("\nLocaleCI golden-set quality report");
console.log("──────────────────────────────────");
for (const [k, v] of Object.entries(report)) console.log(`  ${k.padEnd(22)} ${v}`);

// Baseline gate.
const baselinePath = resolve(here, "baseline.json");
if (process.argv.includes("--update-baseline")) {
  writeFileSync(baselinePath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\n✔ baseline updated (${baselinePath})`);
  process.exit(0);
}

if (existsSync(baselinePath)) {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const regressed = [];
  if (report.failureRate > baseline.failureRate + 0.001) regressed.push(`failure rate ${baseline.failureRate} → ${report.failureRate}`);
  if (report.avgScore < baseline.avgScore - 2) regressed.push(`avg score ${baseline.avgScore} → ${report.avgScore}`);
  if (regressed.length) {
    console.error(`\n✘ Quality regression vs baseline:\n  - ${regressed.join("\n  - ")}`);
    process.exit(1);
  }
  console.log("\n✔ No regression vs baseline.");
} else {
  console.log("\n(no baseline.json yet — run with --update-baseline to create one)");
}
