# 22. Checklists

> 📚 [Índice da documentação](./index.md)

## ✅ Desenvolvimento
- [ ] Ler CONTRIBUTING; `pnpm install && pnpm -r build && pnpm -r test`
- [ ] Feature atrás de porta/interface quando houver I/O
- [ ] Regra de ouro do diff em novos parsers (snapshot tests)
- [ ] Validadores atualizados; golden set com casos-armadilha
- [ ] Sem segredo em código/log; conteúdo do cliente redigido
- [ ] Tipos estritos; sem `any` não justificado

## ✅ QA
- [ ] Unit + integração + e2e verdes; cobertura ≥85% no core/lib
- [ ] Golden regression sem regressão vs baseline
- [ ] k6 dentro dos SLOs (p95/p99); throttling (429/402) tratado como saudável
- [ ] Casos de erro (401/402/403/422/429/502) testados
- [ ] Acessibilidade (axe) sem violações críticas (web)

## ✅ Segurança
- [ ] CodeQL/gitleaks/`pnpm audit` verdes; SBOM gerado
- [ ] Authz deny-by-default em toda rota de org (BOLA)
- [ ] Rate limit + budget cap em rotas públicas/caras
- [ ] CSP/HSTS/CSRF ativos; MFA disponível
- [ ] Zero-retention verificado; DSAR/erasure funcionam; audit `verifyChain` ok
- [ ] Segredos em vault/env; timing-safe comparisons

## ✅ Deploy
- [ ] `docs/deploy.md` seguido; env de produção completo
- [ ] `CREATE EXTENSION vector`; `db:migrate` aplicado; owners → org_members
- [ ] Wiring: `kvRateLimiter`, `kvCache`, `sentrySink`, `dbRead`
- [ ] `pnpm typecheck:full` verde; crons configurados; Stripe webhook + prices
- [ ] Action dist committado (CI freshness verde)

## ✅ Produção (go-live)
- [ ] `scripts/smoke.sh` verde (auth gates, playground cap, worker secret, CSP)
- [ ] Alertas de custo/erro por org ativos; dashboards no ar
- [ ] Backup/PITR habilitado; runbook de incidente publicado
- [ ] Rollback testado (promover deployment anterior)
- [ ] SLA/SLO/SLI monitorados; on-call definido

---
[← Premissas & Lacunas](./assumptions.md) · [Índice](./index.md)
