# 19. Custos

> 📚 [Índice da documentação](./index.md)

Ordem de grandeza a baixo volume:

| Item | Estimativa/mês | Nota |
|---|---|---|
| Vercel (Pro) | US$ 20 | serverless + cron |
| Neon (Launch/Scale) | US$ 0–69 | + read replica |
| Upstash KV | US$ 0–10 | pay-as-you-go |
| Sentry (Team) | US$ 26 | erros |
| Resend | US$ 0–20 | email |
| Stripe | % por transação | sem custo fixo |
| **LLM** | **variável** | ~US$ 0,50–1,50 / 1.000 strings (modelo barato); TM+cache reduzem drasticamente |
| **Total infra fixo** | ~US$ 70–150 | LLM é o driver dominante e proporcional ao uso |
| Equipe | 1 dev sênior (build) → 1–2 (operar) | — |

Margem alvo Pro (US$ 29 vs ~US$ 5–8 pior caso) ~75–85%; uso típico é fração do
limite. **Contexto é ~70% dos tokens** — batching e compressão de contexto
importam mais que o preço unitário da string.

---
[← Riscos](./risks.md) · [Índice](./index.md) · [Melhorias →](./improvements.md)
