# 21. Premissas & Lacunas

> 📚 [Índice da documentação](./index.md)

## Premissas adotadas
1. **Cloud é serverless (Vercel/Neon/Upstash)** — não há K8s/containers; os
   critérios de "Kubernetes/Ingress" são N/A por decisão de arquitetura.
2. **Pagamentos 100% no Stripe** ⇒ escopo **PCI SAQ-A** (nenhum dado de cartão no
   sistema).
3. **Idiomas oficiais ~15 high-resource**; low-resource recebem score menor *por
   design*.
4. **Retenção padrão:** usage 400d, reviews 180d, audit 730d, TM do cliente
   ilimitada (revisável).
5. **RTO 4h / RPO 1h** como metas iniciais (a validar com o negócio).

## Lacunas / perguntas em aberto
Bloqueadas por decisão de negócio ou pelo deploy.

| # | Pergunta | Alternativas | Recomendação |
|---|---|---|---|
| Q1 | Domínio/marca final (`localeci.dev`?) | LocaleCI / Polylate / Glossia | LocaleCI (SEO + dev-native) |
| Q2 | Repositório público ou privado? | público (Cal.com-style) / privado | público no lançamento (transparência) |
| Q3 | Multi-region agora ou V3? | single-region / multi-region | V3 (custo/complexidade) |
| Q4 | argon2id agora? | scrypt (atual) / argon2id | argon2id em produção |
| Q5 | SLA formal por tier? | 99.9% Pro / SLA Scale | definir com jurídico/negócio |
| Q6 | SSO/SCIM na V2 ou V3? | — | V3 (enterprise) |

## Itens pendentes por depender de deploy
- **#9** Observabilidade — instalar Sentry/Pino como sinks (adaptadores prontos).
- **#11** Rate limit distribuído — trocar in-memory por `kvRateLimiter`.
- **#12** `typecheck:full` no CI com deps do Next instaladas.
- **#17** Golden 25→300 (automação e 75 casos prontos).
- **#18** KV cache + read replica + rodar k6 no ambiente.

---
[← Melhorias](./improvements.md) · [Índice](./index.md) · [Checklists →](./checklists.md)
