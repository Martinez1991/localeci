/**
 * Stripe helpers (spec §8). We use Checkout + Customer Portal — no custom billing
 * UI. Reference implementation; needs `stripe` at deploy time.
 */
import Stripe from "stripe";
import type { PlanId } from "../lib/plans.js";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-12-18.acacia" });

/** Map plan → Stripe Price ID (from env). */
export function priceIdFor(plan: PlanId): string | null {
  const map: Record<PlanId, string | undefined> = {
    free: undefined,
    pro: process.env.STRIPE_PRICE_PRO,
    team: process.env.STRIPE_PRICE_TEAM,
    scale: process.env.STRIPE_PRICE_SCALE,
  };
  return map[plan] ?? null;
}

export async function createCheckoutSession(params: {
  plan: PlanId;
  customerId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string | null> {
  const price = priceIdFor(params.plan);
  if (!price) return null;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
  return session.url;
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
  return session.url;
}
