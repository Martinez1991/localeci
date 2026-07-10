# 16–17. Roadmap & Backlog

> 📚 [Índice da documentação](./index.md)

## 16. Roadmap

| Fase | Escopo |
|---|---|
| **MVP** (feito) | CLI (init/translate/check/status), 3 formatos, pipeline de qualidade, TM lockfile, GitHub Action, cloud mínima |
| **V1** (feito) | 10 formatos, AST context, back-translation embeddings, aprendizado humano, custo+JSON, RBAC, LGPD, DevSecOps |
| **V2** (parcial) | TM semântica pgvector, review web, playground, fine-tuning export, fila persistente, cache KV — *fechar wiring no deploy* |
| **V3** | SSO/SCIM, import Lokalise/Crowdin, SDK versionado + webhooks, multi-region/DR testado, SOC2 Type I |
| **Longo prazo** | fine-tuning real (>50M strings), pgvector avançado/sharding, app store metadata avançado, marketplace de conectores |

## 17. Backlog (amostra estruturada)

| Epic | Feature | User Story | Task/Subtask | Critérios de aceitação | Prio | Est. | Depende |
|---|---|---|---|---|---|---|---|
| Observability | Sinks de produção | Como SRE quero erros no Sentry e alertas de custo | Wire `sentrySink`; alert rules; OTel | Erros no Sentry; alerta dispara ≥80% cota | Alta | 3d | deploy |
| Scale | KV distribuído | Como PM quero rate limit consistente | Trocar limiter→`kvRateLimiter`; cache→`kvCache` | 429 consistente entre instâncias; cache hit>60% | Alta | 2d | Upstash |
| Quality | Golden 300 | Como TL quero regressão robusta | Curar +225 casos; job noturno real | 300 casos válidos; baseline estável | Média | 10d | — |
| RBAC | Convites por email | Como admin quero convidar por email | Resend template; aceitar convite | Convite expira 7d; aceite cria membership | Média | 3d | Resend |
| DR | IaC + restore | Como CISO quero DR testado | Terraform; runbook; game day | RTO<4h/RPO<1h validados | Alta | 8d | — |
| UX | Design System | Como usuário quero UI acessível | Tokens; componentes; WCAG AA | axe sem violações críticas | Média | 15d | — |

O backlog completo é derivável das issues abertas (#9, #11, #12, #17, #18) e das
[Melhorias](./improvements.md).

---
[← Testes](./testing.md) · [Índice](./index.md) · [Riscos →](./risks.md)
