/**
 * Review-action orchestration (issue #12). The Next route is a thin adapter over
 * this pure, dependency-injected function, so the full flow — resolve →
 * authorize (fixes BOLA) → validate → persist → feed the semantic TM — is
 * unit-tested with in-memory fakes instead of living in an untested route.
 */
import { applyReviewAction, type ReviewAction, type ReviewItem } from "../review.js";
import { requireOrgAccess, ForbiddenError, UnauthorizedError, type MembershipStore } from "../authz.js";
import type { SemanticMemory } from "@localeci/core";

export interface ReviewRow {
  id: string;
  orgId: string;
  key: string;
  locale: string;
  source: string;
  machineTarget: string;
  score: number;
  status: ReviewItem["status"];
}

export interface ReviewStore {
  findById(id: string): Promise<ReviewRow | null>;
  saveDecision(id: string, patch: { status: string; finalTarget: string | null; reviewerId: string; reviewedAt: string }): Promise<void>;
}

export interface Embedder {
  embed(texts: string[]): Promise<{ vectors: number[][] }>;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

export interface ReviewHandlerDeps {
  reviews: ReviewStore;
  memberships: MembershipStore;
  /** Optional org-scoped TM factory to feed approved/edited translations into. */
  tmFor?: (orgId: string) => SemanticMemory;
  embedder?: Embedder;
  nowIso: string;
}

export async function handleReviewAction(
  reviewId: string,
  action: ReviewAction,
  userId: string | undefined | null,
  deps: ReviewHandlerDeps,
): Promise<HandlerResult> {
  const row = await deps.reviews.findById(reviewId);
  if (!row) return { status: 404, body: { error: "Not found" } };

  // Deny-by-default authorization against the review's org.
  try {
    await requireOrgAccess(deps.memberships, userId, row.orgId);
  } catch (e) {
    const status = e instanceof ForbiddenError || e instanceof UnauthorizedError ? e.status : 403;
    return { status, body: { error: (e as Error).message } };
  }

  const item: ReviewItem = {
    id: row.id,
    key: row.key,
    locale: row.locale,
    source: row.source,
    machineTarget: row.machineTarget,
    score: row.score,
    status: row.status,
  };
  const result = applyReviewAction(item, action, userId!, deps.nowIso);
  if (!result.ok) return { status: 422, body: { error: "Invalid edit", issues: result.issues } };

  await deps.reviews.saveDecision(row.id, {
    status: result.item.status,
    finalTarget: result.item.finalTarget ?? null,
    reviewerId: userId!,
    reviewedAt: deps.nowIso,
  });

  // Feed approved/edited translations into the org-scoped semantic TM.
  if (result.tmUpdate && deps.tmFor && deps.embedder) {
    const emb = await deps.embedder.embed([result.tmUpdate.source]);
    const vector = emb.vectors[0];
    if (vector) await deps.tmFor(row.orgId).add([{ ...result.tmUpdate, vector }]);
  }

  return { status: 200, body: { status: result.item.status, finalTarget: result.item.finalTarget ?? null } };
}
