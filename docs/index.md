# LocaleCI — Documentação de Engenharia

Documentação enterprise (docs-as-code), fundamentada no código do monorepo
(v0.5.x, 314 testes). Termos técnicos e identificadores em inglês; narrativa em
português. **Fonte da verdade: o código.**

## Navegação por área

| # | Documento | Conteúdo |
|---|---|---|
| 1 | [Visão Geral](./overview.md) | Objetivo, problema, personas, casos de uso |
| 2–3 | [Requisitos](./requirements.md) | Funcionais (RF-01..27) e não-funcionais (SLA/SLO/SLI, RTO/RPO) |
| 4 | [Arquitetura](./architecture.md) | Estilo, padrões, diagramas Mermaid C4/sequência |
| 5,7 | [Modelo de Dados](./data-model.md) | MER, schema físico, banco, migrations, retenção |
| 6 | [APIs](./api.md) | Endpoints, exemplos, versionamento · [openapi.yaml](./openapi.yaml) |
| 8 | [Front-end](./frontend.md) | Telas, UX/UI, acessibilidade |
| 9 | [Backend](./backend.md) | Camadas, use cases, portas, workers, fila, cache |
| 10 | [Infraestrutura](./infrastructure.md) | Cloud, KV, banco, secrets, rede |
| 11 | [DevOps](./devops.md) | CI/CD, Git flow, deploy, rollback, flags |
| 12 | [Segurança](./security.md) | OWASP Top 10/API/LLM, STRIDE/DREAD/LINDDUN, LGPD |
| 13 | [IA](./ai.md) | LLM, RAG, embeddings, pgvector, guardrails, HITL |
| 14 | [Observabilidade](./observability.md) | Logs, métricas, tracing, alertas |
| 15 | [Testes](./testing.md) | Unit/integração/e2e/carga/SAST/DAST/SCA |
| 16–17 | [Roadmap & Backlog](./roadmap.md) | MVP→V3, backlog estruturado |
| 18 | [Riscos](./risks.md) | Matriz de riscos |
| 19 | [Custos](./costs.md) | Infra, cloud, LLM, equipe |
| 20 | [Melhorias](./improvements.md) | Arquitetura/segurança/UX/performance |
| 21 | [Premissas & Lacunas](./assumptions.md) | Perguntas em aberto e decisões |
| 22 | [Checklists](./checklists.md) | Dev, QA, segurança, deploy, produção |

## Docs operacionais relacionados
- [Deploy runbook](./deploy.md) · [Smoke test](./smoke-test.md) · [Publicação (Pages/Docker/Marketplace)](./publishing.md) · [Golden set](https://github.com/localeci/localeci/blob/main/golden/README.md)

> O documento consolidado de página única foi dividido nestes arquivos por área.
