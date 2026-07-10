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
pnpm --filter @localeci/cloud typecheck   # typechecks src/lib only
```

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
