/**
 * POST /api/worker — drain a batch of queued translate jobs (spec §13).
 * Called by a Vercel Cron (or an external worker) on a schedule. Protected by a
 * shared secret. Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processJobs } from "../../../lib/queue.js";
import { DbJobQueue } from "../../../server/dbQueue.js";
import { handleTranslate, type ProxyDeps } from "../../../lib/proxy.js";
import { platformProvider } from "../../../lib/platformProvider.js";
import { DbUsageStore } from "../../../server/dbUsage.js";
import { planFor } from "../../../lib/plans.js";

export const runtime = "nodejs";

interface TranslateJob {
  orgId: string;
  plan: string;
  batch: Parameters<typeof handleTranslate>[0];
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = `Bearer ${process.env.WORKER_SECRET ?? ""}`;
  const got = req.headers.get("authorization") ?? "";
  if (!process.env.WORKER_SECRET || !safeEqual(got, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queue = new DbJobQueue<TranslateJob>();
  const result = await processJobs(
    queue,
    async (payload) => {
      const deps: ProxyDeps = {
        provider: platformProvider(),
        usage: new DbUsageStore(),
        org: { orgId: payload.orgId, plan: planFor(payload.plan) },
        today: new Date().toISOString().slice(0, 10),
      };
      return handleTranslate(payload.batch, deps);
    },
    { now: Date.now(), max: 50 },
  );

  return NextResponse.json(result);
}
