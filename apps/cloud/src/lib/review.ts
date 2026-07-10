/**
 * Collaborative web review (spec non-goals → now a cloud feature).
 *
 * Reviewers approve, edit, or reject flagged machine translations in the web UI.
 * Every approve/edit becomes a human-approved translation that feeds back into
 * the translation memory (the §5.7 learning loop, driven from the web instead of
 * a Git diff). Edits are validated with the same deterministic checks the
 * pipeline uses, so a human can't ship a placeholder-breaking correction.
 *
 * Pure and framework-free; the Next.js routes/page are thin wrappers.
 */
import { validateTranslation, type ValidationIssue } from "@localeci/core";

export type ReviewStatus = "pending" | "approved" | "edited" | "rejected";

export interface ReviewItem {
  id: string;
  key: string;
  locale: string;
  source: string;
  machineTarget: string;
  score: number;
  status: ReviewStatus;
  finalTarget?: string;
  reviewer?: string;
  reviewedAt?: string;
  meta?: { isIcu?: boolean };
}

export type ReviewAction =
  | { type: "approve" }
  | { type: "edit"; text: string }
  | { type: "reject"; reason?: string };

export interface TmUpdate {
  source: string;
  target: string;
  locale: string;
}

export interface ApplyResult {
  ok: boolean;
  item: ReviewItem;
  /** A human-approved (source→target) pair to persist into the TM, if any. */
  tmUpdate: TmUpdate | null;
  /** Validation issues that blocked an edit, if any. */
  issues?: ValidationIssue[];
}

/**
 * Apply a reviewer's action to an item. Approvals/edits mark the string
 * human-approved and yield a TM update; a broken edit is rejected with issues.
 */
export function applyReviewAction(
  item: ReviewItem,
  action: ReviewAction,
  reviewer: string,
  at: string,
): ApplyResult {
  const base = { ...item, reviewer, reviewedAt: at };

  if (action.type === "approve") {
    const next: ReviewItem = { ...base, status: "approved", finalTarget: item.machineTarget };
    return { ok: true, item: next, tmUpdate: { source: item.source, target: item.machineTarget, locale: item.locale } };
  }

  if (action.type === "edit") {
    const text = action.text.trim();
    if (text === "") {
      return { ok: false, item, tmUpdate: null, issues: [{ validator: "review", severity: "error", message: "Edited translation is empty" }] };
    }
    const validation = validateTranslation({
      source: item.source,
      target: text,
      targetLocale: item.locale,
      ...(item.meta ? { meta: item.meta } : {}),
    });
    if (!validation.ok) {
      return { ok: false, item, tmUpdate: null, issues: validation.issues.filter((i) => i.severity === "error") };
    }
    const next: ReviewItem = { ...base, status: "edited", finalTarget: text };
    return { ok: true, item: next, tmUpdate: { source: item.source, target: text, locale: item.locale } };
  }

  // reject
  const next: ReviewItem = { ...base, status: "rejected", finalTarget: undefined };
  return { ok: true, item: next, tmUpdate: null };
}

export interface ReviewSummary {
  total: number;
  pending: number;
  approved: number;
  edited: number;
  rejected: number;
  /** Safe to merge: everything reviewed and nothing rejected. */
  readyToMerge: boolean;
}

export function reviewSummary(items: ReviewItem[]): ReviewSummary {
  const by = (s: ReviewStatus): number => items.filter((i) => i.status === s).length;
  const pending = by("pending");
  const rejected = by("rejected");
  return {
    total: items.length,
    pending,
    approved: by("approved"),
    edited: by("edited"),
    rejected,
    readyToMerge: items.length > 0 && pending === 0 && rejected === 0,
  };
}
