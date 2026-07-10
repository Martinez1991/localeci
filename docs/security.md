# Security & data handling

_One page, on purpose. Last reviewed: 2026-07._

## Where do my strings go?

- **CLI, bring-your-own-key (default):** your strings go **only** to the LLM
  provider you configured (Anthropic/OpenAI), using your own API key, directly
  from your machine or CI. LocaleCI has no server in this path.
- **CLI, cloud mode / the GitHub Action with a LocaleCI key:** batches are sent
  to the LocaleCI proxy, which calls the provider with our keys. The proxy is
  **zero-retention by default**: we store counts, token totals, model, and
  locale — **never the source or translated text**. A content hash is stored only
  if an operator explicitly sets `LOCALECI_RETENTION=true`.

## Web app defenses

- **CSRF:** state-changing requests are protected by an Origin/Referer check plus
  a double-submit cookie token (`src/lib/csrf.ts`); Bearer API clients are exempt
  (no cookies to forge). Enforced in `middleware.ts`.
- **Security headers:** CSP, HSTS (production), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` set
  on every response (`src/lib/headers.ts`).
- **MFA:** optional TOTP (RFC 6238) step-up, verified against the RFC test
  vectors (`src/lib/totp.ts`); secret stored per user, enabled only after a
  verified code.
- **Rate limiting & spend caps:** per-IP sliding window + daily LLM-spend circuit
  breaker on public endpoints (`src/lib/{ratelimit,budget}.ts`).
- **Authorization:** deny-by-default org access (`requireOrgAccess`) + RBAC
  (`org_members`) on every org-scoped route.

## Prompt injection

All client string content is treated strictly as **data**. It is passed to the
model as JSON, never interpolated into instructions, and the system prompt tells
the model to translate suspicious-looking text literally and never obey it. A
deterministic sanity validator flags prompt/assistant leakage in outputs
(`Here is the translation…`, code fences, refusals).

## API keys

`lcx_live_…` keys are salted-hashed at rest (scrypt today; argon2id in
production), shown exactly once, carry a visible prefix for recognition, and are
revocable. Bring-your-own provider keys are read from environment variables and
never written to disk or logs.

## Supply chain

- Dependencies are pinned via the lockfile; Dependabot is enabled.
- npm packages are published with `--provenance`.
- In docs and examples the GitHub Action is pinned by commit SHA:
  `uses: localeci/localeci/packages/action@<40-char-sha>`.
- The Action requests minimal permissions: `contents: write`,
  `pull-requests: write`. Fork PRs run **read-only** (`check`) — no secrets, no
  commits.

## Privacy & data subject rights (LGPD / GDPR)

- **Access (DSAR):** `POST /api/v1/privacy/export` returns a portable JSON bundle
  of the user's data (LGPD Art. 18 / GDPR Art. 15). API-key **hashes are never
  exported** — only prefixes.
- **Erasure:** `POST /api/v1/privacy/delete` computes a deletion plan
  (`src/lib/privacy.ts`): transfer ownership of shared orgs to the highest-ranked
  remaining member, delete solely-owned empty orgs, and scrub PII from the user
  row. The **hash-chained audit log is retained** (legal obligation); the
  actor id becomes a dangling pseudonym after the scrub.
- **Audit log:** every security/privacy action is appended to an immutable,
  **hash-chained** log (`src/lib/audit.ts`); `verifyChain` detects any
  edit/reorder/deletion.
- **Retention:** configurable per category (`DEFAULT_RETENTION_DAYS`), enforced
  by `POST /api/retention` (cron): usage 400d, reviews 180d, audit 730d, customer
  translation memory kept until the customer deletes it.

## Reporting a vulnerability

Email security@localeci.dev. Please do not open a public issue for security
reports.
