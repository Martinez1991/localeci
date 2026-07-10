/**
 * Usage dashboard (spec §8.3): month usage, average score, locales, upgrade.
 * Server component. Reference implementation.
 */
import { and, eq, sql } from "drizzle-orm";
import { auth } from "../../auth.js";
import { db, schema } from "../../db/index.js";
import { planFor } from "../../lib/plans.js";

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <main style={{ padding: 40 }}>Please <a href="/api/auth/signin">sign in with GitHub</a>.</main>;
  }

  const [org] = await db.select().from(schema.orgs).where(eq(schema.orgs.ownerId, session.user.id));
  if (!org) return <main style={{ padding: 40 }}>No organization found.</main>;

  const plan = planFor(org.plan);
  const period = currentPeriod();

  const [usage] = await db
    .select({
      strings: sql<number>`coalesce(sum(${schema.usageEvents.stringsTranslated}), 0)`,
      tokensIn: sql<number>`coalesce(sum(${schema.usageEvents.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${schema.usageEvents.tokensOut}), 0)`,
    })
    .from(schema.usageEvents)
    .where(and(eq(schema.usageEvents.orgId, org.id), eq(schema.usageEvents.period, period)));

  const used = Number(usage?.strings ?? 0);
  const pct = Math.min(100, Math.round((used / plan.stringsPerMonth) * 100));

  return (
    <main style={{ padding: 40, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1>{org.name}</h1>
      <p>Plan: <strong>{plan.name}</strong> · {period}</p>

      <section style={{ margin: "24px 0" }}>
        <h2>Usage this month</h2>
        <div style={{ background: "#eee", borderRadius: 8, overflow: "hidden", height: 16 }}>
          <div style={{ width: `${pct}%`, background: pct > 90 ? "#e11" : "#22c", height: "100%" }} />
        </div>
        <p>{used.toLocaleString()} / {plan.stringsPerMonth.toLocaleString()} strings ({pct}%)</p>
        <p>Tokens: {Number(usage?.tokensIn ?? 0).toLocaleString()} in · {Number(usage?.tokensOut ?? 0).toLocaleString()} out</p>
      </section>

      <section>
        <form action="/api/v1/keys" method="post">
          <button type="submit">Generate API key</button>
        </form>
        <p style={{ color: "#666" }}>Keys are shown once. Store them safely.</p>
      </section>

      {plan.id === "free" && (
        <section style={{ marginTop: 24 }}>
          <a href="/api/billing/checkout?plan=pro">Upgrade to Pro — $29/mo →</a>
        </section>
      )}
    </main>
  );
}
