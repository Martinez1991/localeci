/**
 * Fine-tuning dataset export (spec §13: deferred until > 50M strings with human
 * feedback). We build the training data now so the readiness gate is honest and
 * the day it triggers is a one-command export — using the SAME prompt structure
 * as production so a fine-tune matches the deployed pipeline.
 */
import type { StyleConfig } from "./config.js";
import type { TranslateBatch } from "./provider.js";
import { buildTranslatePrompt } from "./pipeline/prompt.js";

export interface FineTunePair {
  source: string;
  target: string;
  locale: string;
}

export type DatasetFormat = "openai" | "plain";

export interface DatasetOptions {
  format: DatasetFormat;
  sourceLocale: string;
  style?: StyleConfig;
}

const DEFAULT_STYLE: StyleConfig = { tone: "professional", audience: "SaaS product UI", notes: "" };

/** One OpenAI chat fine-tuning example mirroring the production translate prompt. */
export function buildOpenAIExample(pair: FineTunePair, sourceLocale: string, style: StyleConfig = DEFAULT_STYLE) {
  const batch: TranslateBatch = {
    sourceLocale,
    targetLocale: pair.locale,
    tier: "cheap",
    items: [{ id: "1", text: pair.source }],
    style,
    glossary: [],
  };
  const { system, user } = buildTranslatePrompt(batch);
  const assistant = JSON.stringify({ translations: [{ id: "1", text: pair.target }] });
  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: assistant },
    ],
  };
}

/** Serialize approved pairs to a JSONL fine-tuning dataset. */
export function buildFineTuneDataset(pairs: FineTunePair[], opts: DatasetOptions): string {
  const style = opts.style ?? DEFAULT_STYLE;
  const lines = pairs.map((p) => {
    if (opts.format === "openai") return JSON.stringify(buildOpenAIExample(p, opts.sourceLocale, style));
    return JSON.stringify({ source: p.source, target: p.target, locale: p.locale });
  });
  return lines.join("\n") + (lines.length ? "\n" : "");
}

export interface FineTuneReadiness {
  ready: boolean;
  count: number;
  threshold: number;
  needed: number;
  /** Per-locale counts, useful to know which languages have enough data. */
  byLocale: Record<string, number>;
}

/**
 * Is there enough human-approved data to fine-tune? The spec's trigger is 50M
 * strings; the threshold is configurable for smaller per-locale experiments.
 */
export function fineTuneReadiness(pairs: FineTunePair[], threshold = 50_000_000): FineTuneReadiness {
  const byLocale: Record<string, number> = {};
  for (const p of pairs) byLocale[p.locale] = (byLocale[p.locale] ?? 0) + 1;
  const count = pairs.length;
  return { ready: count >= threshold, count, threshold, needed: Math.max(0, threshold - count), byLocale };
}
