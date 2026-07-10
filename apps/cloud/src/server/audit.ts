/**
 * Postgres-backed hash-chained audit log (issue #16). Appends are serialized in
 * a transaction (lock the last row) so the seq/prevHash chain stays consistent
 * under concurrency. Reference implementation.
 */
import { sql, desc } from "drizzle-orm";
import type { AuditLog, AuditEvent, AuditInput } from "../lib/audit.js";
import { appendEvent, hashEvent } from "../lib/audit.js";
import { db, schema } from "../db/index.js";

export class DbAuditLog implements AuditLog {
  async append(input: AuditInput): Promise<AuditEvent> {
    return db.transaction(async (tx) => {
      // Serialize appenders: lock the tail row.
      const [prevRow] = await tx
        .select()
        .from(schema.auditLog)
        .orderBy(desc(schema.auditLog.seq))
        .limit(1)
        .for("update");
      const prev: AuditEvent | null = prevRow
        ? { ...(prevRow as unknown as AuditEvent), at: (prevRow.at as unknown as Date).toISOString() }
        : null;
      const ev = appendEvent(prev, input);
      // Recompute hash defensively (appendEvent already did).
      ev.hash = hashEvent(input, ev.seq, ev.prevHash);
      await tx.insert(schema.auditLog).values({
        seq: ev.seq,
        actorId: ev.actorId,
        orgId: ev.orgId ?? null,
        action: ev.action,
        target: ev.target ?? null,
        at: new Date(ev.at),
        meta: (ev.meta ?? null) as object,
        prevHash: ev.prevHash,
        hash: ev.hash,
      });
      return ev;
    });
  }

  async list(): Promise<AuditEvent[]> {
    const rows = await db.select().from(schema.auditLog).orderBy(schema.auditLog.seq);
    return rows.map((r) => ({
      seq: r.seq,
      actorId: r.actorId,
      orgId: r.orgId,
      action: r.action as AuditEvent["action"],
      target: r.target ?? undefined,
      at: (r.at as unknown as Date).toISOString(),
      meta: (r.meta ?? undefined) as Record<string, unknown> | undefined,
      prevHash: r.prevHash,
      hash: r.hash,
    }));
  }
}

/** Fire-and-forget audit helper for routes (never blocks the response on error). */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await new DbAuditLog().append(input);
  } catch {
    // Audit failures must not break the primary action; surfaced via monitoring.
  }
}
