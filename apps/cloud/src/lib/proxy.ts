/**
 * Translation proxy core (spec §8.2). Framework-agnostic: given an authenticated
 * org, a platform provider, and a usage store, it enforces plan limits, calls
 * the provider with the platform's keys, meters usage, and returns the result.
 * Zero-retention by default.
 *
 * The Next.js route handlers are thin adapters over these functions.
 */
import type { Provider, TranslateBatch, JudgeBatch } from "@localeci/core";
import type { Plan } from "./plans.js";
import { checkStringLimit, checkLocaleLimit } from "./plans.js";
import type { UsageStore } from "./usage.js";
import { contentHashOf, currentPeriod } from "./usage.js";

export interface AuthedOrg {
  orgId: string;
  plan: Plan;
}

export interface ProxyResult<T> {
  status: number;
  body: T | { error: string };
}

export interface ProxyDeps {
  provider: Provider;
  usage: UsageStore;
  org: AuthedOrg;
  /** YYYY-MM-DD, injected for deterministic period bucketing. */
  today: string;
  /** When true, store a content hash for debugging; text is NEVER stored. */
  retention?: boolean;
}

export async function handleTranslate(
  batch: TranslateBatch,
  deps: ProxyDeps,
): Promise<ProxyResult<{ translations: unknown; model: string; tokensIn: number; tokensOut: number }>> {
  const { provider, usage, org, today } = deps;
  const period = currentPeriod(today);

  const localeCheck = checkLocaleLimit(org.plan, 1);
  if (!localeCheck.allowed) return { status: 402, body: { error: localeCheck.reason! } };

  const used = await usage.usedInPeriod(org.orgId, period);
  const limit = checkStringLimit(org.plan, used, batch.items.length);
  if (!limit.allowed) return { status: 402, body: { error: limit.reason! } };

  let result;
  try {
    result = await provider.translate(batch);
  } catch (e) {
    return { status: 502, body: { error: `Upstream provider error: ${(e as Error).message}` } };
  }

  const event = {
    orgId: org.orgId,
    period,
    stringsTranslated: result.translations.length,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    model: result.model,
    locale: batch.targetLocale,
    ...(deps.retention ? { contentHash: contentHashOf(batch.items.map((i) => i.text)) } : {}),
  };
  await usage.record(event);

  return {
    status: 200,
    body: {
      translations: result.translations,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    },
  };
}

export async function handleJudge(
  batch: JudgeBatch,
  deps: ProxyDeps,
): Promise<ProxyResult<{ scores: unknown; model: string; tokensIn: number; tokensOut: number }>> {
  // Judging doesn't consume the string quota (it's part of quality), but it is
  // metered for cost visibility.
  const { provider, usage, org, today } = deps;
  let result;
  try {
    result = await provider.judge(batch);
  } catch (e) {
    return { status: 502, body: { error: `Upstream provider error: ${(e as Error).message}` } };
  }
  await usage.record({
    orgId: org.orgId,
    period: currentPeriod(today),
    stringsTranslated: 0,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    model: result.model,
    locale: batch.targetLocale,
  });
  return {
    status: 200,
    body: { scores: result.scores, model: result.model, tokensIn: result.tokensIn, tokensOut: result.tokensOut },
  };
}
