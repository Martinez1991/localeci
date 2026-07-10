# 9. Backend

> 📚 [Índice da documentação](./index.md)

## 9.1 Camadas (cloud)
```
middleware.ts            → CSP/HSTS/CSRF, headers
app/api/**/route.ts      → adaptadores finos (HTTP ↔ deps)
lib/handlers/*           → casos de uso (DI, testados)
lib/*                    → domínio puro (authz, plans, review, privacy, totp, cache…)
server/*                 → infra (Drizzle stores, redis, sentry sink, audit)
db/*                     → schema + clients (primary/replica)
```

## 9.2 Serviços / Repositories / Controllers / Middlewares
- **Controllers:** route handlers (thin).
- **Use cases:** `handleReviewAction`, `handleMemberInvite`, `handleKeyCreation`,
  `handlePrivacyExport/Deletion`, `handleMfa`, `handleTranslate/Judge`.
- **Repositories (portas):** `ReviewStore`, `MemberStore`, `KeyStore`,
  `OrgLookup`, `MfaUserStore`, `UsageStore`, `SemanticMemory`, `MembershipStore`,
  `AuditLog`, `SpendStore`, `Cache`, `RateLimiter`.
- **Middlewares:** segurança (headers/CSRF) + rate limit por rota
  (`enforceRateLimit`).

## 9.3 Núcleo (packages)
- **core:** parsers (10 formatos), diff, lockfile TM, validadores, ICU/CLDR,
  pipeline (`runLocale`), pricing, semantic memory, finetune.
- **providers:** anthropic/openai/cloud/mock, retry+Zod, embeddings.
- **cli:** init/translate/check/status/dataset, scan de contexto (AST+grep), I/O.
- **action:** wrapper da CLI para GitHub Actions.

## 9.4 Workers / Jobs / Cache / Fila / Mensageria
- **Fila:** `jobs` table + `DbJobQueue` (FOR UPDATE SKIP LOCKED) + `processJobs`
  (retry exponencial 1s/5s/25s, cap 5m). Cron `/api/worker` a cada 1 min.
- **Cache:** `InMemoryLru`/`KvCache` (TM quente) via `withCache(provider)`.
- **Cron:** `/api/retention` (03:00), `/api/worker` (1 min).
- **Mensageria:** sem broker dedicado (fila em Postgres suficiente até o gatilho
  de escala; ver [Roadmap](./roadmap.md)).

---
[← Front-end](./frontend.md) · [Índice](./index.md) · [Infraestrutura →](./infrastructure.md)
