/**
 * POST /api/retention — enforce data retention (issue #16). Run by a Vercel
 * Cron; deletes records past their category's retention window. Protected by a
 * shared secret. Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { lt } from "drizzle-orm";
import { db, schema } from "../../../db/index.js";
import { DEFAULT_RETENTION_DAYS } from "../../../lib/privacy.js";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = `Bearer ${process.env.WORKER_SECRET ?? ""}`;
  if (!process.env.WORKER_SECRET || !safeEqual(req.headers.get("authorization") ?? "", expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted: Record<string, number> = {};

  if (DEFAULT_RETENTION_DAYS.usageEvents !== null) {
    const r = await db.delete(schema.usageEvents).where(lt(schema.usageEvents.createdAt, cutoff(DEFAULT_RETENTION_DAYS.usageEvents)));
    deleted.usageEvents = (r as unknown as { rowCount?: number }).rowCount ?? 0;
  }
  if (DEFAULT_RETENTION_DAYS.reviews !== null) {
    const r = await db.delete(schema.reviews).where(lt(schema.reviews.createdAt, cutoff(DEFAULT_RETENTION_DAYS.reviews)));
    deleted.reviews = (r as unknown as { rowCount?: number }).rowCount ?? 0;
  }
  // auditLog: retained (legal obligation); translationVectors: customer data, kept.

  return NextResponse.json({ deleted });
}
