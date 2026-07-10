/**
 * DSAR export + erasure orchestration (issues #12, #16). Thin routes over these
 * DI'd functions so the auth → gather/plan → execute → audit flows are tested.
 */
import { buildDataExport, planUserDeletion, type ExportCollections, type OwnedOrg } from "../privacy.js";
import type { AuditInput } from "../audit.js";
import type { HandlerResult } from "./reviewHandler.js";
import type { Auditor } from "./keyHandler.js";

// ── Export ──────────────────────────────────────────────────────────────────

export interface ExportGatherer {
  gather(userId: string): Promise<{ email: string; collections: ExportCollections }>;
}

export async function handlePrivacyExport(
  userId: string | undefined | null,
  deps: { gatherer: ExportGatherer; audit: Auditor; nowIso: string },
): Promise<HandlerResult> {
  if (!userId) return { status: 401, body: { error: "Unauthorized" } };
  const { email, collections } = await deps.gatherer.gather(userId);
  const bundle = buildDataExport({ userId, email }, collections, deps.nowIso);
  await deps.audit.record({ actorId: userId, action: "data.exported", target: userId, at: deps.nowIso });
  return { status: 200, body: bundle };
}

// ── Erasure ─────────────────────────────────────────────────────────────────

export interface DeletionExecutor {
  ownedOrgsWithMembers(userId: string): Promise<OwnedOrg[]>;
  transferOwnership(orgId: string, toUserId: string): Promise<void>;
  deleteOrg(orgId: string): Promise<void>;
  scrubUser(userId: string): Promise<void>;
}

export async function handlePrivacyDeletion(
  userId: string | undefined | null,
  deps: { exec: DeletionExecutor; audit: Auditor; nowIso: string; graceDays?: number },
): Promise<HandlerResult> {
  if (!userId) return { status: 401, body: { error: "Unauthorized" } };

  const ownedOrgs = await deps.exec.ownedOrgsWithMembers(userId);
  const plan = planUserDeletion({ userId, ownedOrgs, now: deps.nowIso, graceDays: deps.graceDays ?? 0 });

  // Record the erasure BEFORE scrubbing (actor becomes a dangling pseudonym).
  const audit: AuditInput = { actorId: userId, action: "data.deleted", target: userId, at: deps.nowIso };
  await deps.audit.record(audit);

  for (const step of plan.steps) {
    if (step.kind === "transfer-ownership") await deps.exec.transferOwnership(step.orgId, step.toUserId);
    else if (step.kind === "delete-org") await deps.exec.deleteOrg(step.orgId);
    else if (step.kind === "scrub-user") await deps.exec.scrubUser(step.userId);
    // "retain-audit" → no-op (the hash-chained log stays intact).
  }

  return { status: 200, body: { deleted: true, plan } };
}
