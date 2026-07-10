# 18. Matriz de Riscos

> 📚 [Índice da documentação](./index.md)

| Categoria | Risco | Prob. | Impacto | Sev. | Mitigação |
|---|---|---|---|---|---|
| Técnico | Rotas cloud sem `typecheck:full` no CI | Média | Médio | Média | Job de deploy com deps Next ([Premissas](./assumptions.md)) |
| Segurança | Rate limit in-memory (não distribuído) | Média | Alto | Alta | `kvRateLimiter` (pronto) no deploy |
| Operação | Sem observabilidade em prod até wiring | Média | Alto | Alta | Sentry/logs (adaptadores prontos) |
| Negócio | Feature "Team/Scale" dependia de RBAC | Baixa | Médio | Média | RBAC implementado (#14) |
| Infra | Single-region (sem DR testado) | Média | Alto | Alta | Multi-region + game day (V3) |
| Financeiro | Custo LLM descontrolado | Baixa | Alto | Média | Budget cap + alertas (feito) |
| Legal | LGPD sem DSAR/retenção | Baixa | Alto | Baixa | Implementado (#16) |
| Qualidade | Regressão de prompt/modelo | Média | Médio | Média | Golden gate + noturno |

## Mapa de calor (probabilidade × impacto)
```mermaid
quadrantChart
  title Riscos
  x-axis Baixa Prob --> Alta Prob
  y-axis Baixo Impacto --> Alto Impacto
  quadrant-1 Mitigar já
  quadrant-2 Monitorar
  quadrant-3 Aceitar
  quadrant-4 Planejar
  Rate limit in-memory: [0.6, 0.8]
  Observabilidade: [0.6, 0.8]
  Single-region/DR: [0.5, 0.85]
  typecheck:full: [0.5, 0.5]
  Custo LLM: [0.3, 0.85]
  Regressao prompt: [0.5, 0.55]
```

---
[← Roadmap](./roadmap.md) · [Índice](./index.md) · [Custos →](./costs.md)
