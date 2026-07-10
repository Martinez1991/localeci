import { describe, it, expect } from "vitest";
import { InMemoryJobQueue, processJobs, backoffMs } from "./queue.js";

describe("backoffMs", () => {
  it("is exponential and capped", () => {
    expect(backoffMs(1)).toBe(1000);
    expect(backoffMs(2)).toBe(5000);
    expect(backoffMs(3)).toBe(25000);
    expect(backoffMs(10)).toBe(300000); // capped at 5m
  });
});

describe("InMemoryJobQueue", () => {
  it("enqueues and claims in order, leasing so others can't re-claim", async () => {
    const q = new InMemoryJobQueue<{ n: number }>();
    await q.enqueue({ n: 1 });
    const job = await q.claim(1000, 30_000);
    expect(job!.payload.n).toBe(1);
    expect(job!.status).toBe("leased");
    // Still leased → not claimable again until the lease expires.
    expect(await q.claim(1000, 30_000)).toBeNull();
    expect(await q.claim(40_000, 30_000)).not.toBeNull(); // lease expired → reclaimable
  });

  it("retries with backoff, then marks failed past maxAttempts", async () => {
    const q = new InMemoryJobQueue<{ n: number }>();
    await q.enqueue({ n: 1 }, { maxAttempts: 2 });
    let job = await q.claim(0, 1000);
    await q.fail(job!.id, "boom", 0);
    // Requeued with backoff → not runnable at t=0, runnable after 1s.
    expect(await q.claim(500, 1000)).toBeNull();
    job = await q.claim(1000, 1000);
    expect(job!.attempts).toBe(1);
    await q.fail(job!.id, "boom again", 1000);
    expect(q.byStatus("failed")).toHaveLength(1); // hit maxAttempts
  });

  it("completes a job with a result", async () => {
    const q = new InMemoryJobQueue<{ n: number }>();
    await q.enqueue({ n: 7 });
    const job = await q.claim(0, 1000);
    await q.complete(job!.id, { ok: true });
    expect(q.byStatus("done")[0]!.result).toEqual({ ok: true });
  });
});

describe("processJobs", () => {
  it("drains runnable jobs through the handler", async () => {
    const q = new InMemoryJobQueue<{ n: number }>();
    for (const n of [1, 2, 3]) await q.enqueue({ n });
    const seen: number[] = [];
    const r = await processJobs(q, async (p) => { seen.push(p.n); return p.n * 2; }, { now: 0, max: 10 });
    expect(r.processed).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  it("fails a throwing job and counts it", async () => {
    const q = new InMemoryJobQueue<{ n: number }>();
    await q.enqueue({ n: 1 });
    const r = await processJobs(q, async () => { throw new Error("nope"); }, { now: 0 });
    expect(r.failed).toBe(1);
    expect(q.byStatus("queued")).toHaveLength(1); // retryable → requeued
  });
});
