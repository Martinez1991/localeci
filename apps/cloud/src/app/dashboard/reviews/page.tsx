/**
 * Collaborative review queue (spec: review workflow). Lists flagged strings for
 * the org and lets a reviewer approve / edit / reject each. Reference
 * implementation — a real version streams from the `reviews` table and posts to
 * /api/v1/reviews/:id.
 */
import { and, eq } from "drizzle-orm";
import { auth } from "../../../auth.js";
import { db, schema } from "../../../db/index.js";
import { reviewSummary, type ReviewItem } from "../../../lib/review.js";

async function loadPending(orgId: string): Promise<ReviewItem[]> {
  const rows = await db
    .select()
    .from(schema.reviews)
    .where(and(eq(schema.reviews.orgId, orgId), eq(schema.reviews.status, "pending")));
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    locale: r.locale,
    source: r.source,
    machineTarget: r.machineTarget,
    score: r.score,
    status: r.status,
  }));
}

export default async function ReviewsPage() {
  const session = await auth();
  if (!session?.user?.id) return <main style={{ padding: 40 }}>Please sign in.</main>;
  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, session.user.id));
  if (!org) return <main style={{ padding: 40 }}>No organization.</main>;

  const items = await loadPending(org.id);
  const summary = reviewSummary(items);

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 760, margin: "0 auto", padding: 40 }}>
      <h1>Review queue</h1>
      <p>
        {summary.pending} pending · {summary.approved} approved · {summary.edited} edited · {summary.rejected} rejected
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {items.map((it) => (
          <form
            key={it.id}
            action={`/api/v1/reviews/${it.id}`}
            method="post"
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}
          >
            <div style={{ fontSize: 12, color: "#666" }}>
              {it.key} · {it.locale} · score {it.score}
            </div>
            <div style={{ margin: "6px 0", color: "#888" }}>{it.source}</div>
            <input name="text" defaultValue={it.machineTarget} style={{ width: "100%", padding: 8 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button formAction={`/api/v1/reviews/${it.id}?type=approve`}>Approve</button>
              <button formAction={`/api/v1/reviews/${it.id}?type=edit`}>Save edit</button>
              <button formAction={`/api/v1/reviews/${it.id}?type=reject`}>Reject</button>
            </div>
          </form>
        ))}
        {items.length === 0 && <p>Nothing to review 🎉</p>}
      </div>
    </main>
  );
}
