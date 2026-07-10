# LocaleCI Cloud

The optional hosted side of LocaleCI (spec §8): GitHub login, API keys, a metered
translation proxy, plan limits, Stripe billing, and a usage dashboard. Next.js
(App Router) on Vercel · Postgres (Neon) + Drizzle · Auth.js · Stripe · Resend.

## What's tested in CI

The **business logic** — API key hashing, plan limits, usage metering, and the
proxy's limit-enforcement + zero-retention behaviour — lives in
[`src/lib/`](src/lib) and is fully unit-tested with the `mock` provider (no keys,
no database). Run it:

```bash
pnpm --filter @localeci/cloud test
pnpm --filter @localeci/cloud typecheck        # src/lib only (light, runs in monorepo CI)
pnpm --filter @localeci/cloud typecheck:full   # routes/pages/server — run in the deploy pipeline
```

The Next.js routes/pages are typechecked with `typecheck:full` (tsconfig.full.json)
once the deploy dependencies are installed. Access-controlled routes (`reviews`,
`keys`, `orgs/:id/members`) authorize against the resource's org via
`requireOrgAccess` (deny-by-default) + RBAC (`org_members`). Route params use the
Next 15 `Promise` signature; the worker secret is compared with `timingSafeEqual`.

## Deploying (installs the heavy deps)

The Next.js / Drizzle / Stripe / Auth.js glue is real but kept out of the
monorepo install to keep CI light. To run the app:

```bash
cd apps/cloud
pnpm add next@^15 react@^19 react-dom@^19 drizzle-orm@^0.38 drizzle-kit \
  @neondatabase/serverless next-auth@^5 @auth/core stripe@^17 resend \
  @paralleldrive/cuid2
cp .env.example .env.local   # fill it in
pnpm db:generate && pnpm db:migrate
pnpm dev
```

## Architecture notes

- **Same code path, different endpoint.** The CLI's `cloud` provider posts batches
  to `/api/v1/translate` and `/api/v1/judge`; the cloud calls the real provider
  with the platform's keys, meters usage, and enforces plan limits — otherwise it
  is the exact pipeline BYO-key users run locally.
- **Zero-retention by default** (spec §11). `usage_events` has no text column,
  ever. Only counts, tokens, model, and locale are stored; a content hash is kept
  only if `LOCALECI_RETENTION=true`.
- **API keys**: `lcx_live_…`, salted-hash stored (scrypt now; swap in argon2id for
  production — see `src/lib/apiKeys.ts`), shown once, revocable.
- **Limits**: `src/lib/plans.ts` is the single source of truth for both
  enforcement and the pricing UI.
- **Visual UI preview** (Scale tier): `src/lib/preview.ts` estimates whether each
  translation fits its element (button/nav/title/…) and flags overflow. Exposed
  at `POST /api/v1/preview` and rendered at `/dashboard/preview`. Pure logic is
  unit-tested; the page is a reference renderer.
- **Semantic translation memory** (pgvector): `src/server/semanticMemory.ts`
  implements the core `SemanticMemory` interface against Postgres + pgvector,
  suggesting the nearest approved translations as few-shot examples across
  namespaces. Needs `CREATE EXTENSION vector;`.
- **Collaborative web review**: `src/lib/review.ts` (pure, unit-tested) drives
  approve/edit/reject with the same deterministic validation the pipeline uses;
  approvals feed the semantic TM. `POST /api/v1/reviews/:id` and
  `/dashboard/reviews` are reference wrappers.
- **Persistent job queue** (spec §13): `src/lib/queue.ts` is a pure, unit-tested
  lease-based queue with exponential-backoff retries; under load the proxy
  enqueues instead of blocking. Postgres-backed `DbJobQueue` (`FOR UPDATE SKIP
  LOCKED`) + a `jobs` table + `POST /api/worker` drain endpoint.
- **Live playground**: `src/lib/playground.ts` runs the full pipeline on a single
  string (translation + score + validator issues). `POST /api/v1/playground` and
  the `/playground` page let anyone try the quality pipeline before signing up.

## Fine-tuning (spec §13)

`localeci dataset` exports human-approved translations as an OpenAI chat JSONL
(mirroring the production prompt) and reports readiness against the 50M-string
trigger. Once fine-tuned, set `provider.fineTuned["pt-BR"] = "ft:…"` in the
config and the pipeline routes that locale to your model automatically.
