/**
 * POST /api/v1/reviews/:id — apply a reviewer action (approve/edit/reject).
 * On approve/edit the string is human-approved and fed into the semantic TM.
 * Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth.js";
import { db, schema } from "../../../../../db/index.js";
import { applyReviewAction, type ReviewAction, type ReviewItem } from "../../../../../lib/review.js";
import { platformProvider } from "../../../../../lib/platformProvider.js";
import { DbSemanticMemory } from "../../../../../server/semanticMemory.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [row] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, params.id));
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const result = applyReviewAction(item, action, session.user.id, new Date().toISOString());
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid edit", issues: result.issues }, { status: 422 });
  }

  await db
    .update(schema.reviews)
    .set({
      status: result.item.status,
      finalTarget: result.item.finalTarget ?? null,
      reviewerId: session.user.id,
      reviewedAt: new Date(),
    })
    .where(eq(schema.reviews.id, row.id));

  // Feed approved/edited translations back into the semantic TM.
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
