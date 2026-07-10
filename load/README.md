# Load tests (k6)

Load tests and latency SLOs for the cloud (issue #18). Requires
[k6](https://k6.io) and a running/deployed cloud instance.

## Scripts

| Script | Target | SLO thresholds |
|---|---|---|
| `playground.k6.js` | public `/api/v1/playground` (ramp 0→200 VUs) | p95 < 1.5s, p99 < 3s, no 5xx |
| `translate.k6.js` | metered `/api/v1/translate` (50 VUs, 2m) | p95 < 1.2s, p99 < 2.5s, <2% failed |

Throttling responses (`429` rate limit, `402` budget cap) are treated as
**healthy** — the tests only fail on 5xx or SLO breaches.

## Run

```bash
# Public playground (no key)
BASE_URL=https://localeci.dev k6 run load/playground.k6.js

# Translate proxy (needs an API key; exercises the hot TM cache)
BASE_URL=https://localeci.dev API_KEY=lcx_live_... k6 run load/translate.k6.js
```

## Why the cache matters

`translate.k6.js` uses a small repeating string pool, so after warm-up most
requests hit the in-front TM cache (`src/lib/cache.ts`, `withCache`) and never
reach the LLM — keeping p95 low and cost at $0 for repeats. Swap the in-memory
LRU for `KvCache` (Vercel KV / Upstash) to share the cache across instances.
