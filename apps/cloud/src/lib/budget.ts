/**
 * LLM spend guardrail / circuit breaker (fixes the financial-exhaustion risk of
 * the public playground and caps per-org spend). Tracks estimated USD spend in a
 * rolling day bucket and refuses new work past the cap. Pure and unit-tested;
 * the cloud backs it with the usage store / KV.
 */
export interface SpendStore {
  /** USD spent under `key` in the current period. */
  spent(key: string): Promise<number>;
  /** Add estimated spend to `key`. */
  add(key: string, usd: number): Promise<void>;
}

export interface BudgetDecision {
  allowed: boolean;
  spent: number;
  cap: number;
  remaining: number;
}

/** Would `estimatedUsd` more spend fit under `capUsd` for this key? */
export async function checkBudget(
  store: SpendStore,
  key: string,
  estimatedUsd: number,
  capUsd: number,
): Promise<BudgetDecision> {
  const spent = await store.spent(key);
  const remaining = Math.max(0, capUsd - spent);
  return { allowed: estimatedUsd <= remaining, spent, cap: capUsd, remaining };
}

/** In-memory day-bucketed spend store (tests / single instance). */
export class MemorySpendStore implements SpendStore {
  private buckets = new Map<string, number>();
  async spent(key: string): Promise<number> {
    return this.buckets.get(key) ?? 0;
  }
  async add(key: string, usd: number): Promise<void> {
    this.buckets.set(key, (this.buckets.get(key) ?? 0) + usd);
  }
}

/** Bucket key: `<scope>:<YYYY-MM-DD>` so the cap resets daily. */
export function dailyKey(scope: string, isoDate: string): string {
  return `${scope}:${isoDate.slice(0, 10)}`;
}
