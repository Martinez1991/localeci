# Post-deploy smoke test

After `vercel --prod`, verify the deployment end to end with
[`scripts/smoke.sh`](https://github.com/localeci/localeci/blob/main/scripts/smoke.sh). It asserts status codes only — no
secrets or client content are printed.

```bash
BASE_URL=https://localeci.dev ./scripts/smoke.sh
# with a real key + worker secret for the fuller checks:
BASE_URL=https://localeci.dev API_KEY=lcx_live_... WORKER_SECRET=... ./scripts/smoke.sh
```

## What it checks

| # | Check | Expected | Proves |
|---|---|---|---|
| 1 | `GET /` | 200 | app renders |
| 2 | `POST /api/v1/playground` | 200 | pipeline live (platform LLM key OK) |
| 3 | playground oversized input | 413 | input cap enforced |
| 4 | `POST /api/v1/translate` no key | 401 | API-key auth enforced |
| 5 | `POST /api/v1/keys` no auth | 401 | session auth enforced |
| 6 | `POST /api/v1/privacy/export` no auth | 401 | DSAR gated |
| 7 | `POST /api/worker` bad secret | 401 | cron secret enforced (timing-safe) |
| 8 | CSP header on `/` | present | security headers/middleware active |
| 9 | `POST /api/v1/translate` with key | 200 | metered proxy + hot cache OK |

## Then run the load tests

```bash
BASE_URL=https://localeci.dev k6 run load/playground.k6.js
BASE_URL=https://localeci.dev API_KEY=lcx_live_... k6 run load/translate.k6.js
```

A green smoke test + k6 within the p95/p99 SLOs is the sign-off that the
deploy-dependent items (#9 observability, #11 KV rate limiting, #12 route
correctness, #18 cache/replica) are live and healthy.
