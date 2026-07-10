/**
 * POST /api/v1/playground — translate a single string live with the full
 * pipeline. Public but defended (fixes the financial-exhaustion DoS):
 *   - per-IP sliding-window rate limit,
 *   - a global daily LLM-spend cap (circuit breaker),
 *   - a hard input-size cap.
 * Reference implementation (in-memory limiter/spend; swap for KV in production).
 */
import { NextRequest, NextResponse } from "next/server";
import { estimateCost } from "@localeci/core";
import { playgroundTranslate, type PlaygroundRequest } from "../../../../lib/playground.js";
import { platformProvider } from "../../../../lib/platformProvider.js";
import { InMemoryRateLimiter, clientIp } from "../../../../lib/ratelimit.js";
import { checkBudget, MemorySpendStore, dailyKey } from "../../../../lib/budget.js";

export const runtime = "nodejs";

// Module-scoped singletons (per serverless instance). Production: KV-backed.
const limiter = new InMemoryRateLimiter();
const spend = new MemorySpendStore();

const RATE_LIMIT = Number(process.env.PLAYGROUND_RATE_LIMIT ?? 10); // requests
const RATE_WINDOW_MS = 60_000;
const DAILY_CAP_USD = Number(process.env.PLAYGROUND_DAILY_CAP_USD ?? 5);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const now = Date.now();
  const ip = clientIp(req.headers);

  const rate = await limiter.check(`pg:${ip}`, RATE_LIMIT, RATE_WINDOW_MS, now);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "retry-after": String(Math.ceil((rate.resetAt - now) / 1000)) } },
    );
  }

  const body = (await req.json()) as PlaygroundRequest;
  if (!body?.source || !body.targetLocale) {
    return NextResponse.json({ error: "source and targetLocale are required" }, { status: 400 });
  }
  if (body.source.length > 500) {
    return NextResponse.json({ error: "source too long (500 char max in the playground)" }, { status: 413 });
  }

  // Circuit breaker: refuse if today's global spend is near the cap.
  const key = dailyKey("playground", new Date(now).toISOString());
  const estimate = estimateCost({ model: "claude-sonnet-5", tokensIn: 400, tokensOut: 200 });
  const budget = await checkBudget(spend, key, estimate, DAILY_CAP_USD);
  if (!budget.allowed) {
    return NextResponse.json(
      { error: "The playground has hit its daily budget. Sign up for your own key to keep going." },
      { status: 402 },
    );
  }

  const result = await playgroundTranslate({ ...body, sourceLocale: body.sourceLocale || "en" }, platformProvider());
  await spend.add(key, result.costUsd || estimate);
  return NextResponse.json(result);
}
