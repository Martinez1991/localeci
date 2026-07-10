/**
 * Scoring & decision (spec §5.6). Deterministic validators gate first (fail →
 * score 0, never written). Otherwise the LLM judge produces the score, and the
 * config threshold + onBelowThreshold decide what happens.
 */
import type { ValidationResult } from "../types.js";
import type { JudgeScore } from "../provider.js";
import { judgeToScore } from "../provider.js";

export type Decision = "written" | "flagged" | "skipped" | "failed";

export interface ScoreDecision {
  score: number;
  decision: Decision;
  /** Whether the translation should be written to the target file. */
  write: boolean;
  /** Whether it should count as a CI failure (exit ≠ 0). */
  fail: boolean;
}

export interface DecideParams {
  validation: ValidationResult;
  judge?: JudgeScore;
  threshold: number;
  onBelowThreshold: "flag" | "fail" | "skip";
  /** Back-translation similarity 0..1 (spec §5.6, --paranoid). Undefined = not run. */
  backSimilarity?: number;
}

export function decide(params: DecideParams): ScoreDecision {
  const { validation, judge, threshold, onBelowThreshold, backSimilarity } = params;

  if (!validation.ok) {
    // Deterministic failure → score 0, never written.
    return { score: 0, decision: "failed", write: false, fail: true };
  }

  const baseScore = judge ? judgeToScore(judge) : 100;
  // Fold in back-translation: a faithful round-trip barely moves the score; a
  // divergent one pulls it down (weight 0.35 on the similarity signal).
  const score =
    backSimilarity === undefined
      ? baseScore
      : Math.round(baseScore * (0.65 + 0.35 * clamp01(backSimilarity)));

  if (score >= threshold) {
    return { score, decision: "written", write: true, fail: false };
  }

  switch (onBelowThreshold) {
    case "flag":
      return { score, decision: "flagged", write: true, fail: false };
    case "fail":
      return { score, decision: "failed", write: false, fail: true };
    case "skip":
      return { score, decision: "skipped", write: false, fail: false };
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
