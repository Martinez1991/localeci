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
}

export function decide(params: DecideParams): ScoreDecision {
  const { validation, judge, threshold, onBelowThreshold } = params;

  if (!validation.ok) {
    // Deterministic failure → score 0, never written.
    return { score: 0, decision: "failed", write: false, fail: true };
  }

  const score = judge ? judgeToScore(judge) : 100;

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
