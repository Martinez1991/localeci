# 14. Observabilidade

> 📚 [Índice da documentação](./index.md)

- **Logs:** `createLogger` (JSON estruturado, `requestId`/`orgId`, **redaction**
  de conteúdo/segredos) → stdout → Vercel/Loki/Datadog.
- **Erros:** `sentrySink` encaminha error/warn ao Sentry (config em
  `sentry.server.config.ts`/`sentry.edge.config.ts` + `src/instrumentation.ts`).
- **Métricas/Alertas:** custo LLM e taxa de erro **por org** (`costAlertLevel`:
  warning ≥80%, critical ≥100% da cota).
- **Tracing:** OpenTelemetry (planejado) → Tempo/Honeycomb.
- **Dashboards:** uso/custo por org, p95/p99, taxa de flagged, cache hit ratio.
- **Health check:** `GET /` (readiness); recomendação: `/api/health` dedicado.

## SLIs monitorados
`http_req_duration` (p95/p99), `http_req_failed` (5xx), custo/org, quota alerts,
cache hit ratio, fila (processed/failed/backlog).

---
[← IA](./ai.md) · [Índice](./index.md) · [Testes →](./testing.md)
