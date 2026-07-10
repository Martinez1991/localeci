/**
 * Provider interface (spec §5.5): a single adapter surface behind which live
 * Anthropic, OpenAI, the mock, or the cloud proxy. The pipeline depends only on
 * this interface, never on a concrete provider.
 */
import { z } from "zod";

export type ModelTier = "cheap" | "top";

export interface TranslateItem {
  id: string;
  text: string;
  /** Human-readable context, e.g. "error message in checkout (src/Form.tsx)". */
  context?: string;
  /** Sibling strings from the same namespace to disambiguate. */
  neighbors?: string[];
  /** ICU source flag — providers must translate branch-by-branch. */
  isIcu?: boolean;
  /** Human-approved (source→target) few-shot examples from the same namespace (spec §5.7). */
  examples?: Array<{ source: string; target: string }>;
}

export interface TranslateBatch {
  sourceLocale: string;
  targetLocale: string;
  items: TranslateItem[];
  tier: ModelTier;
  style: { tone: string; audience: string; notes: string };
  glossary: Array<{ term: string; target: string | null; neverTranslate: boolean }>;
  /** Force a specific model (e.g. a fine-tuned one for this locale). Overrides tier. */
  modelOverride?: string;
}

export interface TranslateOutputItem {
  id: string;
  text: string;
}

export interface TranslateResult {
  translations: TranslateOutputItem[];
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export const TranslateResponseSchema = z.object({
  translations: z.array(z.object({ id: z.string(), text: z.string() })),
});

export interface JudgeItem {
  id: string;
  source: string;
  target: string;
  context?: string;
}

export interface JudgeBatch {
  sourceLocale: string;
  targetLocale: string;
  items: JudgeItem[];
}

export interface JudgeScore {
  id: string;
  accuracy: number; // 0–5
  fluency: number; // 0–5
  terminology: number; // 0–5
  uiFitness: number; // 0–5
  issues: string[];
}

export interface JudgeResult {
  scores: JudgeScore[];
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export const JudgeResponseSchema = z.object({
  scores: z.array(
    z.object({
      id: z.string(),
      accuracy: z.number().min(0).max(5),
      fluency: z.number().min(0).max(5),
      terminology: z.number().min(0).max(5),
      uiFitness: z.number().min(0).max(5),
      issues: z.array(z.string()).default([]),
    }),
  ),
});

export interface EmbedResult {
  vectors: number[][];
  model: string;
  tokens: number;
}

export interface Provider {
  name: string;
  translate(batch: TranslateBatch): Promise<TranslateResult>;
  judge(batch: JudgeBatch): Promise<JudgeResult>;
  /**
   * Optional embeddings for back-translation similarity (spec §5.6). Providers
   * without a native embeddings API leave this undefined; `--paranoid` falls
   * back to token-set similarity.
   */
  embed?(texts: string[]): Promise<EmbedResult>;
}

/** Weighted average of a judge score, normalized to 0–100 (accuracy weight 2). */
export function judgeToScore(s: JudgeScore): number {
  const weighted = s.accuracy * 2 + s.fluency + s.terminology + s.uiFitness;
  const max = 5 * 2 + 5 + 5 + 5; // 25
  return Math.round((weighted / max) * 100);
}
