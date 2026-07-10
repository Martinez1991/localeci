/**
 * Persistent job queue for the translation proxy (spec §13 trigger: proxy
 * sustains > 50 req/min → dedicated workers). Under load the proxy enqueues
 * translate jobs instead of blocking the request; workers lease and process them
 * with lease-based visibility timeouts and exponential-backoff retries.
 *
 * The state machine is pure and unit-tested here; `InMemoryJobQueue` is the
 * offline implementation and the cloud provides a Postgres-backed one
 * (SELECT … FOR UPDATE SKIP LOCKED).
 */
export type JobStatus = "queued" | "leased" | "done" | "failed";

export interface Job<T = unknown> {
  id: string;
  payload: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  /** Epoch ms; the job is invisible to claim() until this time. */
  nextRunAt: number;
  /** Epoch ms; while leased, other workers can't claim until it expires. */
  leaseUntil?: number;
  error?: string;
  result?: unknown;
}

/** Deterministic exponential backoff (no jitter → testable): 1s, 5s, 25s, capped 5m. */
export function backoffMs(attempt: number): number {
  return Math.min(5 * 60_000, 1000 * Math.pow(5, Math.max(0, attempt - 1)));
}

export interface JobQueue<T = unknown> {
  enqueue(payload: T, opts?: { maxAttempts?: number; runAt?: number }): Promise<Job<T>>;
  /** Claim the next runnable job, leasing it for `leaseMs`. Null if none. */
  claim(now: number, leaseMs: number): Promise<Job<T> | null>;
  complete(id: string, result?: unknown): Promise<void>;
  /** Record a failure: retry with backoff, or mark failed past maxAttempts. */
  fail(id: string, error: string, now: number): Promise<void>;
}

let counter = 0;
function nextId(): string {
  return `job_${(counter++).toString(36)}`;
}

export class InMemoryJobQueue<T = unknown> implements JobQueue<T> {
  jobs = new Map<string, Job<T>>();

  async enqueue(payload: T, opts: { maxAttempts?: number; runAt?: number } = {}): Promise<Job<T>> {
    const job: Job<T> = {
      id: nextId(),
      payload,
      status: "queued",
      attempts: 0,
      maxAttempts: opts.maxAttempts ?? 4,
      nextRunAt: opts.runAt ?? 0,
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async claim(now: number, leaseMs: number): Promise<Job<T> | null> {
    // Runnable = queued and due, OR leased but whose lease has expired.
    const candidates = [...this.jobs.values()]
      .filter(
        (j) =>
          (j.status === "queued" && j.nextRunAt <= now) ||
          (j.status === "leased" && (j.leaseUntil ?? 0) <= now),
      )
      .sort((a, b) => a.nextRunAt - b.nextRunAt);
    const job = candidates[0];
    if (!job) return null;
    job.status = "leased";
    job.leaseUntil = now + leaseMs;
    return job;
  }

  async complete(id: string, result?: unknown): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "done";
    job.result = result;
    delete job.leaseUntil;
  }

  async fail(id: string, error: string, now: number): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.attempts += 1;
    job.error = error;
    delete job.leaseUntil;
    if (job.attempts >= job.maxAttempts) {
      job.status = "failed";
    } else {
      job.status = "queued";
      job.nextRunAt = now + backoffMs(job.attempts);
    }
  }

  /** Test/introspection helper. */
  byStatus(status: JobStatus): Job<T>[] {
    return [...this.jobs.values()].filter((j) => j.status === status);
  }
}

export interface ProcessOptions {
  now: number;
  leaseMs?: number;
  /** Max jobs to process in this tick. */
  max?: number;
}

/**
 * Drain up to `max` runnable jobs through `handler`, completing or failing each.
 * Returns how many were processed. A worker route/cron calls this per tick.
 */
export async function processJobs<T>(
  queue: JobQueue<T>,
  handler: (payload: T, job: Job<T>) => Promise<unknown>,
  opts: ProcessOptions,
): Promise<{ processed: number; failed: number }> {
  const leaseMs = opts.leaseMs ?? 30_000;
  const max = opts.max ?? 25;
  let processed = 0;
  let failed = 0;
  for (let i = 0; i < max; i++) {
    const job = await queue.claim(opts.now, leaseMs);
    if (!job) break;
    try {
      const result = await handler(job.payload, job);
      await queue.complete(job.id, result);
      processed++;
    } catch (e) {
      await queue.fail(job.id, (e as Error).message, opts.now);
      failed++;
    }
  }
  return { processed, failed };
}
