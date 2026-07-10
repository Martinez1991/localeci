/**
 * POST /api/stripe/webhook — sync subscription state → org.plan.
 * Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { stripe } from "../../../../server/stripe.js";
import { db, schema } from "../../../../db/index.js";
import type { PlanId } from "../../../../lib/plans.js";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.created" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object as { customer: string; status: string; items: { data: Array<{ price: { lookup_key?: string } }> } };
    const plan: PlanId = event.type === "customer.subscription.deleted" || sub.status !== "active"
      ? "free"
      : ((sub.items.data[0]?.price.lookup_key as PlanId) ?? "pro");
    await db.update(schema.orgs).set({ plan }).where(eq(schema.orgs.stripeCustomerId, sub.customer));
  }

  return NextResponse.json({ received: true });
}
