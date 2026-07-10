/**
 * POST /api/v1/reviews/:id — apply a reviewer action (approve/edit/reject).
 * Access-controlled: the caller MUST be a member of the review's org (fixes
 * BOLA/A01). On approve/edit the string is human-approved and fed into the TM.
 * Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth.js";
import { db, schema } from "../../../../../db/index.js";
import { applyReviewAction, type ReviewAction, type ReviewItem } from "../../../../../lib/review.js";
import { requireOrgAccess, ForbiddenError, UnauthorizedError } from "../../../../../lib/authz.js";
import { DbMembershipStore } from "../../../../../server/membership.js";
import { platformProvider } from "../../../../../lib/platformProvider.js";
import { DbSemanticMemory } from "../../../../../server/semanticMemory.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await ctx.params; // Next 15: params is a Promise
  const session = await auth();

  const [row] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deny-by-default authorization against the review's org.
  try {
    await requireOrgAccess(new DbMembershipStore(), session?.user?.id, row.orgId);
  } catch (e) {
    const status = e instanceof ForbiddenError || e instanceof UnauthorizedError ? e.status : 403;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }

  const action = (await req.json()) as ReviewAction;
  const item: ReviewItem = {
    id: row.id,
    key: row.key,
    locale: row.locale,
    source: row.source,
    machineTarget: row.machineTarget,
    score: row.score,
    status: row.status,
  };

  const result = applyReviewAction(item, action, session!.user!.id!, new Date().toISOString());
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid edit", issues: result.issues }, { status: 422 });
  }

  await db
    .update(schema.reviews)
    .set({
      status: result.item.status,
      finalTarget: result.item.finalTarget ?? null,
      reviewerId: session!.user!.id,
      reviewedAt: new Date(),
    })
    .where(eq(schema.reviews.id, row.id));

  if (result.tmUpdate) {
    const provider = platformProvider();
    if (provider.embed) {
      const emb = await provider.embed([result.tmUpdate.source]);
      const vector = emb.vectors[0];
      if (vector) await new DbSemanticMemory(row.orgId).add([{ ...result.tmUpdate, vector }]);
    }
  }

  return NextResponse.json({ status: result.item.status, finalTarget: result.item.finalTarget ?? null });
}
