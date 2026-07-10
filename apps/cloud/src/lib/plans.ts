/**
 * Plan definitions & limits (spec §8, landing pricing). One source of truth for
 * enforcement and for the pricing UI.
 */
export type PlanId = "free" | "pro" | "team" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  stringsPerMonth: number;
  maxLocales: number;
  maxRepos: number;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    stringsPerMonth: 500,
    maxLocales: 2,
    maxRepos: 1,
    features: ["Community support"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 29,
    stringsPerMonth: 10_000,
    maxLocales: 10,
    maxRepos: 5,
    features: ["Docs translation", "Email support"],
  },
  team: {
    id: "team",
    name: "Team",
    priceUsd: 99,
    stringsPerMonth: 100_000,
    maxLocales: 30,
    maxRepos: Infinity,
    features: ["Review workflows", "Shared glossary"],
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceUsd: 299,
    stringsPerMonth: 1_000_000,
    maxLocales: 30,
    maxRepos: Infinity,
    features: ["Visual UI previews", "Priority queue", "SLA"],
  },
};

export function planFor(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
}

/**
 * Resolve a plan from a Stripe price id using the app's price→plan map (from
 * env). Single source of truth so the checkout and the webhook agree. Falls
 * back to free for unknown/absent prices.
 */
export function planForPriceId(
  priceId: string | null | undefined,
  priceMap: Partial<Record<PlanId, string | undefined>>,
): PlanId {
  if (!priceId) return "free";
  for (const [plan, id] of Object.entries(priceMap)) {
    if (id && id === priceId) return plan as PlanId;
  }
  return "free";
}

export interface LimitCheck {
  allowed: boolean;
  reason?: string;
  remaining: number;
}

/** Check whether `requested` more strings fit within the plan for the period. */
export function checkStringLimit(plan: Plan, usedThisPeriod: number, requested: number): LimitCheck {
  const remaining = Math.max(0, plan.stringsPerMonth - usedThisPeriod);
  if (requested > remaining) {
    return {
      allowed: false,
      remaining,
      reason: `Monthly limit reached: ${usedThisPeriod}/${plan.stringsPerMonth} strings on the ${plan.name} plan. Upgrade or wait for the next period.`,
    };
  }
  return { allowed: true, remaining: remaining - requested };
}

export function checkLocaleLimit(plan: Plan, requestedLocales: number): LimitCheck {
  const allowed = requestedLocales <= plan.maxLocales;
  return {
    allowed,
    remaining: Math.max(0, plan.maxLocales - requestedLocales),
    ...(allowed ? {} : { reason: `The ${plan.name} plan supports ${plan.maxLocales} locales; ${requestedLocales} requested.` }),
  };
}
