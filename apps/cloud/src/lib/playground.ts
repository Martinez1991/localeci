/**
 * Live translation playground (spec: a web playground to test translations
 * live). Runs the real pipeline on a single string and returns the translation,
 * quality score, decision, and the validator/judge issues — so anyone can try
 * LocaleCI's quality pipeline in the browser before wiring up their repo.
 *
 * Pure and framework-free; the Next.js route/page are thin wrappers.
 */
import {
  runLocale,
  LockStore,
  parseConfig,
  resolveGlossaryForLocale,
  type Provider,
  type Glossary,
} from "@localeci/core";

export interface PlaygroundRequest {
  source: string;
  sourceLocale: string;
  targetLocale: string;
  glossary?: Glossary;
  style?: { tone?: string; audience?: string; notes?: string };
  paranoid?: boolean;
}

export interface PlaygroundResult {
  source: string;
  targetLocale: string;
  translation: string;
  score: number;
  decision: "written" | "flagged" | "skipped" | "failed";
  issues: string[];
  tier: "cheap" | "top";
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export async function playgroundTranslate(
  req: PlaygroundRequest,
  provider: Provider,
  today = new Date().toISOString().slice(0, 10),
): Promise<PlaygroundResult> {
  const config = parseConfig({
    source: { locale: req.sourceLocale, files: "x", format: "i18next" },
    targets: [req.targetLocale],
    provider: { name: "mock" }, // provider is injected; name is just for schema
    quality: { threshold: 85, onBelowThreshold: "flag", paranoid: req.paranoid ?? false },
    ...(req.style ? { style: { tone: req.style.tone ?? "professional", audience: req.style.audience ?? "SaaS product UI", notes: req.style.notes ?? "" } } : {}),
  });

  const glossary = req.glossary ? resolveGlossaryForLocale(req.glossary, req.targetLocale) : [];

  const res = await runLocale({
    sourceLocale: req.sourceLocale,
    targetLocale: req.targetLocale,
    source: [{ key: "playground.string", value: req.source }],
    target: [],
    lock: new LockStore(),
    provider,
    config,
    glossary,
    today,
  });

  const r = res.results[0];
  return {
    source: req.source,
    targetLocale: req.targetLocale,
    translation: r?.target ?? "",
    score: r?.score ?? 0,
    decision: r?.decision ?? "failed",
    issues: r?.issues ?? [],
    tier: r?.tier ?? "cheap",
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
  };
}
