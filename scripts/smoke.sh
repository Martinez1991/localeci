#!/usr/bin/env bash
# Post-deploy smoke test for LocaleCI Cloud (issue: deploy verification).
# Validates that each route responds with an expected status — no secrets or
# client content are printed. Read-only except the playground (cheap, capped).
#
# Usage:
#   BASE_URL=https://localeci.dev ./scripts/smoke.sh
#   BASE_URL=... API_KEY=lcx_live_... WORKER_SECRET=... ./scripts/smoke.sh
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
API_KEY="${API_KEY:-}"
WORKER_SECRET="${WORKER_SECRET:-}"

pass=0; fail=0

# check <name> <expected-status> <curl-args...>
check() {
  local name="$1"; local want="$2"; shift 2
  local got
  got="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
  if [ "$got" = "$want" ]; then
    printf '  \033[32m✓\033[0m %-48s %s\n' "$name" "$got"
    pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m %-48s got %s, want %s\n' "$name" "$got" "$want"
    fail=$((fail+1))
  fi
}

echo "LocaleCI smoke test → $BASE_URL"
echo "──────────────────────────────────────────────────"

# 1. Home renders.
check "GET /" 200 "$BASE_URL/"

# 2. Playground translates a short string (public, rate-limited/capped).
check "POST /api/v1/playground (translate)" 200 \
  -X POST "$BASE_URL/api/v1/playground" \
  -H 'content-type: application/json' \
  -d '{"source":"Save changes","sourceLocale":"en","targetLocale":"pt-BR"}'

# 3. Playground rejects oversized input (413).
BIG="$(printf 'a%.0s' $(seq 1 600))"
check "POST /api/v1/playground (too long → 413)" 413 \
  -X POST "$BASE_URL/api/v1/playground" \
  -H 'content-type: application/json' \
  -d "{\"source\":\"$BIG\",\"sourceLocale\":\"en\",\"targetLocale\":\"de\"}"

# 4. Translate proxy requires an API key (401 without one).
check "POST /api/v1/translate (no key → 401)" 401 \
  -X POST "$BASE_URL/api/v1/translate" \
  -H 'content-type: application/json' -d '{}'

# 5. Keys route requires auth (401 without a session).
check "POST /api/v1/keys (no auth → 401)" 401 \
  -X POST "$BASE_URL/api/v1/keys" -H 'content-type: application/json' -d '{}'

# 6. Privacy export requires auth (401).
check "POST /api/v1/privacy/export (no auth → 401)" 401 \
  -X POST "$BASE_URL/api/v1/privacy/export"

# 7. Worker cron rejects a wrong/absent secret (401).
check "POST /api/worker (bad secret → 401)" 401 \
  -X POST "$BASE_URL/api/worker" -H 'authorization: Bearer wrong'

# 8. Security headers present on the app.
if curl -s -D - -o /dev/null "$BASE_URL/" | grep -qi 'content-security-policy'; then
  printf '  \033[32m✓\033[0m %-48s\n' "CSP header present"; pass=$((pass+1))
else
  printf '  \033[31m✗\033[0m %-48s\n' "CSP header missing"; fail=$((fail+1))
fi

# 9. Authenticated translate (only if an API key was provided).
if [ -n "$API_KEY" ]; then
  check "POST /api/v1/translate (with key)" 200 \
    -X POST "$BASE_URL/api/v1/translate" \
    -H "authorization: Bearer $API_KEY" -H 'content-type: application/json' \
    -d '{"sourceLocale":"en","targetLocale":"de","tier":"cheap","items":[{"id":"1","text":"Save"}],"style":{"tone":"professional","audience":"SaaS","notes":""},"glossary":[]}'
fi

echo "──────────────────────────────────────────────────"
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
