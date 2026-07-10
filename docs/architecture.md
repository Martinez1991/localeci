# 4. Arquitetura

> 📚 [Índice da documentação](./index.md)

## 4.1 Estilo & Justificativa
**Modular Monolith no núcleo (packages) + Serverless na cloud (Next.js/Vercel).**
- Núcleo é uma biblioteca pura (filesystem-free, network-free) com **portas &
  adaptadores (Hexagonal)**: `Parser` e `Provider` são as portas; JSON/YAML/PO/…
  e Anthropic/OpenAI/mock/cloud são adaptadores. Facilita testes (mock) e extensão.
- Cloud é serverless por custo (escala a zero) e simplicidade operacional (sem
  K8s). Rotas Next são **adaptadores finos** sobre *handlers* injetáveis testados
  (Clean Architecture: caso-de-uso no `lib/`, I/O na borda).
- **Event/Job-driven** apenas onde necessário (fila de tradução sob carga).

## 4.2 Padrões aplicados
| Padrão | Onde |
|---|---|
| Hexagonal (Ports & Adapters) | `Parser`, `Provider`, `SemanticMemory`, `Cache`, `RateLimiter`, `AuditLog`, `MembershipStore` |
| Clean Architecture | `lib/handlers/*` (casos de uso) ↔ rotas (borda) ↔ `server/*` (infra) |
| DDD (tático leve) | Entidades: Org, User, ApiKey, UsageEvent, Review, Invite, Job, AuditEvent |
| CQRS (leve) | Leituras de dashboard/usage → read replica; escritas → primary |
| Strategy | Roteamento de modelos (tier), escolha de provider |
| Pipeline | `parse→diff→context→batch→translate→validate→judge→score→decide` |
| Circuit Breaker | Budget cap de custo LLM (playground/org) |

## 4.3 Diagrama de containers (C4 nível 2)

```mermaid
flowchart TB
  subgraph Client
    CLI[localeci CLI]
    GA[GitHub Action]
  end
  subgraph Core[packages]
    CORE[core: parsers/pipeline/validators]
    PROV[providers: anthropic/openai/cloud/mock]
  end
  subgraph Cloud[apps/cloud - Vercel]
    MW[middleware CSP+CSRF]
    API[API routes /api/v1/*]
    HAND[lib/handlers use cases]
    AUTH[Auth.js GitHub]
  end
  DB[(Neon Postgres + pgvector)]
  KV[(Upstash KV)]
  SENTRY[(Sentry)]
  STRIPE[(Stripe)]
  LLM[(Anthropic/OpenAI)]

  CLI --> CORE --> PROV
  GA --> CORE
  PROV -->|BYO| LLM
  PROV -->|cloud| API
  MW --> API --> HAND
  HAND --> DB
  HAND --> KV
  HAND --> PROV
  API --> SENTRY
  API --> STRIPE
  AUTH --> DB
```

## 4.4 Fluxo do pipeline de tradução (sequência)

```mermaid
sequenceDiagram
  participant CLI
  participant Engine as runLocale
  participant Lock as TM lockfile
  participant Prov as Provider
  participant Val as Validators
  CLI->>Engine: source, target, config
  Engine->>Lock: diff (missing/stale/locked/orphan)
  Engine->>Engine: human learning (re-lock human)
  Engine->>Prov: translate(batch) [tier]
  Prov-->>Engine: translations
  Engine->>Val: validate (placeholders/ICU/HTML/glossary/sanity)
  Val-->>Engine: ok? issues
  Engine->>Prov: judge(batch) [cheap]
  Prov-->>Engine: scores
  opt --paranoid
    Engine->>Prov: back-translate + embed → cosine
  end
  Engine->>Engine: decide (threshold, onBelowThreshold)
  Engine->>Lock: upsert (auto/human)
  Engine-->>CLI: entries + results + cost
```

## 4.5 Decisões-chave (ADR resumido)
- **TM como lockfile** (não banco): dados do cliente, versionado, idempotente.
- **Zero-retention por padrão** no proxy: privacidade na origem.
- **Serverless (sem K8s)**: custo e simplicidade; equivalentes gerenciados.
- **Portas & adaptadores**: testabilidade (mock) e extensibilidade (formatos/providers).

---
[← Requisitos](./requirements.md) · [Índice](./index.md) · [Modelo de Dados →](./data-model.md)
