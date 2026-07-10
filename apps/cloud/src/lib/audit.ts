/**
 * Immutable audit log (issue #16, LGPD/SOC2/ISO 27001). Every security- or
 * privacy-relevant action is appended as a hash-chained event: each event's
 * hash covers the previous hash, so any tampering (edit/reorder/delete) breaks
 * the chain and is detectable by `verifyChain`.
 *
 * Pure and unit-tested; the cloud persists events via a `DbAuditLog`.
 */
import { createHash } from "node:crypto";

export type AuditAction =
  | "user.login"
  | "user.mfa.enabled"
  | "apikey.created"
  | "apikey.revoked"
  | "org.member.invited"
  | "org.member.removed"
  | "org.role.changed"
  | "review.decided"
  | "data.exported"
  | "data.deleted"
  | "plan.changed";

export interface AuditInput {
  actorId: string | null; // null for system actions
  orgId?: string | null;
  action: AuditAction;
  target?: string; // e.g. the affected resource id
  at: string; // ISO timestamp (injected for determinism)
  meta?: Record<string, unknown>;
}

export interface AuditEvent extends AuditInput {
  seq: number;
  prevHash: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

/** Canonical, stable serialization of the event payload (sorted keys). */
function canonical(input: AuditInput, seq: number, prevHash: string): string {
  const meta = input.meta ? sortKeys(input.meta) : undefined;
  return JSON.stringify({
    seq,
    prevHash,
    actorId: input.actorId,
    orgId: input.orgId ?? null,
    action: input.action,
    target: input.target ?? null,
    at: input.at,
    meta: meta ?? null,
  });
}

function sortKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

export function hashEvent(input: AuditInput, seq: number, prevHash: string): string {
  return createHash("sha256").update(canonical(input, seq, prevHash)).digest("hex");
}

/** Build the next event in a chain given the previous one (or null for genesis). */
export function appendEvent(prev: AuditEvent | null, input: AuditInput): AuditEvent {
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.hash : GENESIS;
  const hash = hashEvent(input, seq, prevHash);
  return { ...input, orgId: input.orgId ?? null, seq, prevHash, hash };
}

/** Verify the integrity of an ordered chain. Returns the first broken seq, or null if intact. */
export function verifyChain(events: AuditEvent[]): { ok: boolean; brokenAt?: number } {
  let prevHash = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.seq !== i) return { ok: false, brokenAt: e.seq };
    if (e.prevHash !== prevHash) return { ok: false, brokenAt: e.seq };
    const expected = hashEvent(e, e.seq, e.prevHash);
    if (expected !== e.hash) return { ok: false, brokenAt: e.seq };
    prevHash = e.hash;
  }
  return { ok: true };
}

export interface AuditLog {
  append(input: AuditInput): Promise<AuditEvent>;
  list(): Promise<AuditEvent[]>;
}

/** In-memory append-only log (tests / single instance). */
export class MemoryAuditLog implements AuditLog {
  private events: AuditEvent[] = [];
  async append(input: AuditInput): Promise<AuditEvent> {
    const prev = this.events[this.events.length - 1] ?? null;
    const ev = appendEvent(prev, input);
    this.events.push(ev);
    return ev;
  }
  async list(): Promise<AuditEvent[]> {
    return [...this.events];
  }
}
