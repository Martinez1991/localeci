/**
 * POST /api/stripe/webhook — sync subscription state → org.plan.
 * Uses the same price→plan map as checkout (planForPriceId) so the two never
 * disagree. Reference implementation.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { stripe } from "../../../../server/stripe.js";
import { db, schema } from "../../../../db/index.js";
import { planForPriceId, type PlanId } from "../../../../lib/plans.js";

export const runtime = "nodejs";

function priceMap(): Partial<Record<PlanId, string | undefined>> {
  return {
    pro: process.env.STRIPE_PRICE_PRO,
    team: process.env.STRIPE_PRICE_TEAM,
    scale: process.env.STRIPE_PRICE_SCALE,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (e) {
    return NextResponse.json({ error: `Invalid signature: ${(e as Error).message}` }, { status: 400 });
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as {
      customer: string;
      status: string;
      items: { data: Array<{ price: { id?: string } }> };
    };
    const plan: PlanId =
      event.type === "customer.subscription.deleted" || sub.status !== "active"
        ? "free"
        : planForPriceId(sub.items.data[0]?.price.id, priceMap());
    await db.update(schema.orgs).set({ plan }).where(eq(schema.orgs.stripeCustomerId, sub.customer));
  }

  return NextResponse.json({ received: true });
}
