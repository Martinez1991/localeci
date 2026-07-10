/**
 * POST /api/v1/reviews/:id — thin adapter over the tested `handleReviewAction`
 * orchestration (issue #12). All logic (resolve → authorize → validate →
 * persist → feed TM) lives in src/lib/handlers/reviewHandler.ts and is
 * unit-tested; this file only maps HTTP ↔ deps.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth.js";
import { db, schema } from "../../../../../db/index.js";
import { handleReviewAction, type ReviewStore } from "../../../../../lib/handlers/reviewHandler.js";
import { type ReviewAction } from "../../../../../lib/review.js";
import { DbMembershipStore } from "../../../../../server/membership.js";
import { DbSemanticMemory } from "../../../../../server/semanticMemory.js";
import { platformProvider } from "../../../../../lib/platformProvider.js";
import { enforceRateLimit } from "../../../../../server/guard.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params;
  const session = await auth();
  const limited = await enforceRateLimit(req, "write", { subjectId: session?.user?.id });
  if (limited) return limited;

  const action = (await req.json()) as ReviewAction;

  const reviews: ReviewStore = {
    async findById(rid) {
      const [row] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, rid));
      return row ?? null;
    },
    async saveDecision(rid, patch) {
      await db
        .update(schema.reviews)
        .set({ status: patch.status as never, finalTarget: patch.finalTarget, reviewerId: patch.reviewerId, reviewedAt: new Date(patch.reviewedAt) })
        .where(eq(schema.reviews.id, rid));
    },
  };

  const provider = platformProvider();
  const result = await handleReviewAction(id, action, session?.user?.id, {
    reviews,
    memberships: new DbMembershipStore(),
    ...(provider.embed
      ? { embedder: { embed: (t) => provider.embed!(t) }, tmFor: (orgId: string) => new DbSemanticMemory(orgId) }
      : {}),
    nowIso: new Date().toISOString(),
  });

  return NextResponse.json(result.body, { status: result.status });
}
