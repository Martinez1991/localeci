# Deploying LocaleCI Cloud

A step-by-step runbook to take `apps/cloud` from repo to production. This closes
the deploy-dependent tail of the hardening work (observability sinks, KV rate
limiting, route typecheck, load tests).

> The whole platform runs serverless: **Vercel** (app) · **Neon** (Postgres +
> pgvector) · **Upstash** (KV/Redis) · **Sentry** (errors) · **Stripe** (billing)
> · **Resend** (email). Budget for production is roughly $0–50/mo at low volume.

## 0. Prerequisites

- A GitHub account (OAuth app) and the `Martinez1991/localeci` repo.
- Accounts: Vercel, Neon, Upstash, Sentry, Stripe, Resend.
- `pnpm` and the Vercel CLI (`npm i -g vercel`).

## 1. Install deploy dependencies

The monorepo keeps these out of CI to stay light; install them in `apps/cloud`:

```bash
cd apps/cloud
pnpm add next@^15 react@^19 react-dom@^19 \
  drizzle-orm@^0.38 drizzle-kit @neondatabase/serverless \
  next-auth@^5 @auth/core stripe@^17 resend @paralleldrive/cuid2 \
  @upstash/ratelimit @upstash/redis @sentry/nextjs
```

## 2. Provision the database (Neon + pgvector)

```sql
-- In the Neon SQL editor, once:
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
# Generate and apply the Drizzle schema (users, orgs, org_members, org_invites,
# api_keys, usage_events, translation_vectors, reviews, jobs, audit_log, ...):
pnpm db:generate
pnpm db:migrate
# Seed each existing org owner into org_members as 'owner' (RBAC back-compat):
# INSERT INTO org_members (org_id, user_id, role)
#   SELECT id, owner_id, 'owner' FROM orgs ON CONFLICT DO NOTHING;
```

## 3. Wire the production sinks (closes #9, #11, #18)

- **Observability (#9):** `SENTRY_DSN` + `@sentry/nextjs` (`sentry.server.config.ts`).
  The structured logger (`src/lib/observability.ts`) already redacts content; pipe
  its JSON to Vercel/Datadog. Set an alert on the `quotaAlert` / cost log fields.
- **Rate limiting KV (#11):** implement a `RateLimiter` over `@upstash/ratelimit`
  and swap it into `src/server/guard.ts` (the in-memory limiter is the fallback).
- **Hot TM cache (#18):** swap `InMemoryLru` for `KvCache(new Redis(...))` in
  `src/lib/platformProvider.ts`. Point dashboard reads at `DATABASE_URL_REPLICA`.

## 4. Typecheck the routes (closes #12)

```bash
pnpm --filter @localeci/cloud typecheck:full   # now that next/drizzle/... are installed
```
Add this to the deploy pipeline (a Vercel "Ignored Build Step" or a CI job with
the deploy deps installed).

## 5. Environment variables

Copy `apps/cloud/.env.example` and fill it in. Set the same in Vercel Project →
Settings → Environment Variables:

| Var | Notes |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_REPLICA` | Neon primary / read replica |
| `AUTH_SECRET`, `AUTH_GITHUB_ID/SECRET` | Auth.js + GitHub OAuth app |
| `APP_URL` | e.g. `https://localeci.dev` (CSRF origin allow-list) |
| `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) | platform LLM key |
| `LOCALECI_RETENTION` | `false` (zero-retention default) |
| `KV_REST_API_URL/TOKEN` | Upstash |
| `SENTRY_DSN` | error tracking |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_{PRO,TEAM,SCALE}` | billing |
| `WORKER_SECRET` | protects `/api/worker` and `/api/retention` |
| `PLAYGROUND_RATE_LIMIT`, `PLAYGROUND_DAILY_CAP_USD`, `ORG_DAILY_CAP_USD` | guardrails |
| `RESEND_API_KEY` | transactional email |

## 6. Cron jobs (Vercel Cron)

`vercel.json`:

```json
{
  "crons": [
    { "path": "/api/worker", "schedule": "*/1 * * * *" },
    { "path": "/api/retention", "schedule": "0 3 * * *" }
  ]
}
```
Both require `Authorization: Bearer $WORKER_SECRET` — configure the cron secret.

## 7. Stripe

- Create the Pro/Team/Scale prices; put their ids in `STRIPE_PRICE_*`.
- Add a webhook to `/api/stripe/webhook` for `customer.subscription.*`; put the
  signing secret in `STRIPE_WEBHOOK_SECRET`.

## 8. Deploy & verify

```bash
vercel --prod
```
Smoke test:
- `/playground` translates and throttles (429) under load — see `load/`.
- `POST /api/v1/keys` (as an admin) issues a key; the action is in `audit_log`.
- `POST /api/v1/privacy/export` returns your data; `.../delete` scrubs PII.
- `k6 run load/playground.k6.js` meets the p95/p99 SLOs.

## 9. GitHub Action (public product)

The Action ships its compiled `packages/action/dist` (committed; CI verifies
freshness). Tag a release and reference it as
`uses: localeci/localeci/packages/action@<sha>`.
