# 6. APIs

> 📚 [Índice da documentação](./index.md) · Contrato: [openapi.yaml](./openapi.yaml)

Todas as rotas versionadas em `/api/v1/*`. Autorização deny-by-default; rate
limiting por classe; respostas JSON.

| Método | URL | Auth | Rate class | Descrição |
|---|---|---|---|---|
| POST | `/api/v1/translate` | Bearer API key | translate (120/min) | Proxy metered de tradução |
| POST | `/api/v1/judge` | Bearer API key | translate | Judge de qualidade |
| POST | `/api/v1/keys` | Session (admin+) | write (60/min) | Emite API key (1x) |
| POST | `/api/v1/playground` | Público | public (10/min) + budget cap | Traduz 1 string ao vivo |
| POST | `/api/v1/preview` | Bearer (Scale) | translate | Overflow de UI |
| POST | `/api/v1/reviews/:id` | Session (org member) | write | approve/edit/reject |
| GET/POST | `/api/v1/orgs/:id/members` | Session (member/admin) | write | Lista/convida membros |
| POST | `/api/v1/mfa` | Session | auth (20/min) | enroll/verify TOTP |
| POST | `/api/v1/privacy/export` | Session | write | DSAR export |
| POST | `/api/v1/privacy/delete` | Session | write | Erasure |
| POST | `/api/worker` | `Bearer WORKER_SECRET` | — | Drena fila (cron) |
| POST | `/api/retention` | `Bearer WORKER_SECRET` | — | Enforce retenção (cron) |
| POST | `/api/stripe/webhook` | Assinatura Stripe | — | Sync de plano |
| GET/POST | `/api/auth/[...nextauth]` | — | auth | OAuth GitHub |

## Exemplo — `POST /api/v1/translate`
```jsonc
// Request (Bearer lcx_live_…)
{ "sourceLocale":"en","targetLocale":"de","tier":"cheap",
  "items":[{"id":"nav.save","text":"Save changes"}],
  "style":{"tone":"professional","audience":"SaaS UI","notes":""},"glossary":[] }
// 200
{ "translations":[{"id":"nav.save","text":"Änderungen speichern"}],
  "model":"claude-haiku-4-5","tokensIn":120,"tokensOut":40 }
// Erros: 401 (sem/inv. key), 402 (cota/limite), 429 (rate), 502 (upstream)
```

## Convenções
- **Versionamento:** path-based (`/v1`). Breaking ⇒ `/v2` + deprecation policy
  (6 meses, header `Sunset`).
- **Idempotência:** `translate` é idempotente via TM/cache (cache hit ⇒ $0).
- **Rate limit headers:** `x-ratelimit-limit`, `x-ratelimit-remaining`,
  `retry-after` (429).
- **Status codes:** 200, 400, 401, 402 (cota/budget), 403 (BOLA/RBAC), 404, 413
  (payload), 422 (validação), 429 (rate), 502 (upstream).

---
[← Modelo de Dados](./data-model.md) · [Índice](./index.md) · [Front-end →](./frontend.md)
