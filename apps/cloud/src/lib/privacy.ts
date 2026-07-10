/**
 * LGPD / GDPR data-subject rights (issue #16): access (DSAR export), erasure
 * (deletion plan), and configurable retention. Pure and unit-tested; the routes
 * gather DB rows and apply these.
 *
 * Design notes:
 *  - Export never includes secrets (api-key hashes) — only key prefixes.
 *  - Erasure scrubs PII on the user row but LEAVES the hash-chained audit log
 *    intact (integrity + legal-obligation basis); the audit `actorId` becomes a
 *    dangling pseudonym once the user's PII is gone.
 *  - A user who solely owns an org with other members triggers an ownership
 *    transfer (never orphan an org); a solely-owned empty org is deleted.
 */
import type { Role } from "./authz.js";

// ── DSAR export ────────────────────────────────────────────────────────────

export interface ExportSubject {
  userId: string;
  email: string;
}

export interface ExportCollections {
  user: { id: string; email: string; name: string | null; createdAt: string; mfaEnabled: boolean };
  orgs: Array<{ id: string; name: string; role: Role; plan: string }>;
  apiKeys: Array<{ prefix: string; lastUsedAt: string | null; createdAt: string }>; // NEVER the hash
  usage: Array<{ period: string; stringsTranslated: number; tokensIn: number; tokensOut: number }>;
  auditEvents: Array<{ action: string; at: string; target?: string | null }>;
}

export interface DataExport {
  manifest: {
    subject: ExportSubject;
    generatedAt: string;
    categories: string[];
    format: "localeci-dsar-v1";
  };
  data: ExportCollections;
}

/** Assemble a portable DSAR bundle. Assumes callers already scoped rows to the subject. */
export function buildDataExport(subject: ExportSubject, collections: ExportCollections, generatedAt: string): DataExport {
  return {
    manifest: {
      subject,
      generatedAt,
      categories: Object.keys(collections),
      format: "localeci-dsar-v1",
    },
    data: collections,
  };
}

// ── Erasure (deletion plan) ────────────────────────────────────────────────

export interface OwnedOrg {
  orgId: string;
  /** OTHER members (excluding the subject being deleted). */
  members: Array<{ userId: string; role: Role }>;
}

export type DeletionStep =
  | { kind: "transfer-ownership"; orgId: string; toUserId: string; toRoleWas: Role }
  | { kind: "delete-org"; orgId: string }
  | { kind: "scrub-user"; userId: string }
  | { kind: "retain-audit"; reason: string };

export interface DeletionPlan {
  steps: DeletionStep[];
  /** ISO timestamp when the erasure executes (after the grace window). */
  scheduledAt: string;
}

const RANK: Record<Role, number> = { member: 1, admin: 2, owner: 3 };

export function planUserDeletion(params: {
  userId: string;
  ownedOrgs: OwnedOrg[];
  now: string; // ISO
  graceDays?: number;
}): DeletionPlan {
  const steps: DeletionStep[] = [];

  for (const org of params.ownedOrgs) {
    if (org.members.length === 0) {
      steps.push({ kind: "delete-org", orgId: org.orgId });
    } else {
      // Transfer ownership to the highest-ranked remaining member.
      const heir = [...org.members].sort((a, b) => RANK[b.role] - RANK[a.role])[0]!;
      steps.push({ kind: "transfer-ownership", orgId: org.orgId, toUserId: heir.userId, toRoleWas: heir.role });
    }
  }

  steps.push({ kind: "scrub-user", userId: params.userId });
  steps.push({
    kind: "retain-audit",
    reason: "Audit log is hash-chained and retained under legal obligation; actor becomes a dangling pseudonym after scrub.",
  });

  const graceMs = (params.graceDays ?? 0) * 24 * 60 * 60 * 1000;
  const scheduledAt = new Date(new Date(params.now).getTime() + graceMs).toISOString();
  return { steps, scheduledAt };
}

/** Fields scrubbed from a user row on erasure. */
export function scrubbedUserFields(): Record<string, null | string> {
  return { email: "deleted@localeci.invalid", name: null, githubId: null, mfaSecret: null };
}

// ── Retention ──────────────────────────────────────────────────────────────

export type RetentionCategory = "usageEvents" | "auditLog" | "reviews" | "translationVectors";

/** Default retention in days per category (configurable via env/overrides). */
export const DEFAULT_RETENTION_DAYS: Record<RetentionCategory, number | null> = {
  usageEvents: 400,
  auditLog: 730, // legal/audit obligation
  reviews: 180,
  translationVectors: null, // kept until the customer deletes it (their data)
};

/** Select records whose createdAt is older than the retention window. */
export function selectExpired<T extends { id: string; createdAt: string }>(
  records: T[],
  retentionDays: number | null,
  now: string,
): T[] {
  if (retentionDays === null) return [];
  const cutoff = new Date(now).getTime() - retentionDays * 24 * 60 * 60 * 1000;
  return records.filter((r) => new Date(r.createdAt).getTime() < cutoff);
}
