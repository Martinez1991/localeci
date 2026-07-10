/**
 * Postgres-backed job queue (spec §13). Implements the core `JobQueue`
 * interface with `FOR UPDATE SKIP LOCKED` so multiple workers can claim
 * concurrently without contention. Reference implementation (needs Drizzle).
 */
import { sql, eq } from "drizzle-orm";
import type { Job, JobQueue } from "../lib/queue.js";
import { backoffMs } from "../lib/queue.js";
import { db, schema } from "../db/index.js";

export class DbJobQueue<T = unknown> implements JobQueue<T> {
  constructor(private orgId?: string) {}

  async enqueue(payload: T, opts: { maxAttempts?: number; runAt?: number } = {}): Promise<Job<T>> {
    const [row] = await db
      .insert(schema.jobs)
      .values({
        orgId: this.orgId ?? null,
        payload: payload as unknown as object,
        maxAttempts: opts.maxAttempts ?? 4,
        nextRunAt: new Date(opts.runAt ?? Date.now()),
      })
      .returning();
    return this.toJob(row!);
  }

  async claim(now: number, leaseMs: number): Promise<Job<T> | null> {
    const nowTs = new Date(now);
    const leaseTs = new Date(now + leaseMs);
    // Atomically pick one runnable row and lease it.
    const rows = await db.execute(sql`
      UPDATE ${schema.jobs} SET status = 'leased', lease_until = ${leaseTs}
      WHERE id = (
        SELECT id FROM ${schema.jobs}
        WHERE (status = 'queued' AND next_run_at <= ${nowTs})
           OR (status = 'leased' AND lease_until <= ${nowTs})
        ORDER BY next_run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `);
    const row = (rows as unknown as { rows: Array<Record<string, unknown>> }).rows?.[0];
    return row ? this.toJob(row) : null;
  }

  async complete(id: string, result?: unknown): Promise<void> {
    await db
      .update(schema.jobs)
      .set({ status: "done", result: (result ?? null) as object, leaseUntil: null })
      .where(eq(schema.jobs.id, id));
  }

  async fail(id: string, error: string, now: number): Promise<void> {
    const [row] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
    if (!row) return;
    const attempts = row.attempts + 1;
    if (attempts >= row.maxAttempts) {
      await db.update(schema.jobs).set({ status: "failed", attempts, error, leaseUntil: null }).where(eq(schema.jobs.id, id));
    } else {
      await db
        .update(schema.jobs)
        .set({ status: "queued", attempts, error, leaseUntil: null, nextRunAt: new Date(now + backoffMs(attempts)) })
        .where(eq(schema.jobs.id, id));
    }
  }

  private toJob(row: Record<string, unknown>): Job<T> {
    return {
      id: String(row.id),
      payload: (row.payload ?? {}) as T,
      status: row.status as Job["status"],
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? row.maxAttempts ?? 4),
      nextRunAt: new Date((row.next_run_at ?? row.nextRunAt) as string).getTime(),
    };
  }
}
