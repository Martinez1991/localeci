# 15. Testes

> 📚 [Índice da documentação](./index.md)

| Tipo | Estado | Ferramenta |
|---|---|---|
| Unitários | ✅ 314 | Vitest |
| Integração (handlers, e2e pipeline) | ✅ (fakes in-memory + mock provider) | Vitest |
| E2E CLI | ✅ (tmp dirs) | Vitest |
| Golden/regressão de qualidade | ✅ estrutural (mock) + noturno real | harness próprio |
| Carga/Stress | ✅ scripts | k6 (`load/*.k6.js`, SLOs p95/p99) |
| Segurança SAST | ✅ | CodeQL |
| SCA | ✅ gate | pnpm audit / Snyk |
| Secret scan | ✅ | gitleaks |
| SBOM | ✅ | CycloneDX |
| DAST | 🟡 recomendado | OWASP ZAP |
| IAST/Container/IaC scan | 🟡 quando houver IaC/containers | Trivy |
| Cobertura | Meta ≥ 85% no `lib/`/core | c8/vitest coverage |
| Chaos | 🟡 planejado | falhas de provider/DB injetadas |

## Estratégia
- **Determinismo:** provider `mock`, `today` injetado, backoff sem jitter,
  hashing-vector para embeddings — testes 100% offline.
- **Golden gate:** qualquer mudança de prompt/modelo/batching só entra se não
  regredir o golden set (estrutural sempre; real-provider noturno).
- **Handlers testados:** toda rota sensível é adaptador fino sobre handler
  injetável com fakes in-memory (authz/BOLA, 401/402/403/404/422/429).

---
[← Observabilidade](./observability.md) · [Índice](./index.md) · [Roadmap →](./roadmap.md)
