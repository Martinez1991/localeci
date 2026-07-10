# 2–3. Requisitos

> 📚 [Índice da documentação](./index.md)

## 2. Requisitos Funcionais

| ID | Nome | Descrição | Entradas | Saídas | Regras de negócio | Prio | Depende |
|---|---|---|---|---|---|---|---|
| RF-01 | Detectar setup i18n | `init` detecta lib (i18next/next-intl/vue-i18n/svelte-i18n), pasta, formato e locale-fonte | cwd, package.json, pasta locales | `localeci.config.json` + glossário seed | Escolhe locale mais completo; extensão→formato | Must | — |
| RF-02 | Traduzir faltantes/mudadas | `translate` compara fonte×lock×alvo e traduz `missing`/`stale` | config, arquivos, lock | arquivos alvo + lock atualizados | String em lock não vai ao LLM; `human` imutável | Must | RF-01 |
| RF-03 | Validação determinística | 5 validadores antes do judge | source, target, locale, glossário | ok + issues | Falha ⇒ score 0, não escreve | Must | RF-02 |
| RF-04 | Score de qualidade | LLM-judge (0–5×4) → 0–100; opcional back-translation | source, target, contexto | score, decisão | `flag`/`fail`/`skip` por threshold | Must | RF-03 |
| RF-05 | Translation Memory | Lockfile hash sha256(srcLocale\|key\|src\|tgt) | — | `localeci.lock.json` | Ordenado, diffs limpos; `human` protegido | Must | RF-02 |
| RF-06 | Glossário | Termos never-translate/mapeados no prompt e validados | glossário JSON | issues | Prompt não garante ⇒ validar | Should | RF-03 |
| RF-07 | Contexto | Namespace, vizinhos, comentários + scan de código (AST/grep) | arquivos de código | ContextBundle | AST se TS disponível; fallback grep | Should | RF-02 |
| RF-08 | ICU por-braço | Plural/select traduzidos por braço com categorias CLDR do alvo | string ICU | ICU recomposto | pl exige `few`; ja só `other` | Must | RF-03 |
| RF-09 | `check` (CI) | Valida sem traduzir; exit≠0 em missing/broken/low/store-limit | config, arquivos, lock | relatório + exit code | strict opcional; `--json` | Must | RF-03 |
| RF-10 | `status` | Cobertura por locale | config, arquivos | tabela | — | Should | RF-09 |
| RF-11 | Roteamento de modelos | Classificador determinístico tier cheap/top | key, texto, locale | tier | >80c, ICU, HTML, marketing, low-resource ⇒ top | Should | RF-02 |
| RF-12 | Back-translation `--paranoid` | Traduz de volta; similaridade (embeddings/tokens) modula score | target | score ajustado | Peso 0.35; embeddings se provider suporta | Could | RF-04 |
| RF-13 | Aprendizado humano | Edição humana no PR ⇒ re-lock `human` + few-shot | fonte, alvo, lock | lock + exemplos | Detecta target≠lock com fonte igual | Should | RF-05 |
| RF-14 | Formatos | JSON/i18next/next-intl, YAML, PO, iOS .strings, Android XML, Fluent, Markdown, texto | arquivo | FlatEntry[] | Regra de ouro do diff | Must | — |
| RF-15 | GitHub Action | Traduz no PR, commita `[skip-localeci]`, upsert 1 comentário | evento PR, inputs | commit + comment + outputs | Fork ⇒ read-only `check` | Must | RF-02 |
| RF-16 | Emissão de API key | Cloud emite `lcx_live_…`, hash argon2/scrypt, mostrada 1x | sessão, orgId | secret (1x) + prefix | admin+; auditado | Must | RF-19 |
| RF-17 | Proxy metered | `/translate` chama provider com chaves da plataforma, mede uso, aplica limites | batch, Bearer key | tradução + uso | Zero-retention; cota de plano | Must | RF-16 |
| RF-18 | Planos & billing | Free/Pro/Team/Scale via Stripe | webhook | plano do org | `planForPriceId` fonte única | Should | RF-17 |
| RF-19 | Auth & Org | GitHub OAuth; org por usuário; RBAC (owner/admin/member) | OAuth | sessão + org | Deny-by-default | Must | — |
| RF-20 | Revisão colaborativa | approve/edit/reject validado; alimenta TM | ação, sessão | decisão + TM | Edit quebrado ⇒ 422 | Should | RF-19 |
| RF-21 | Preview visual UI | Detecta overflow por elemento | strings, locale | verdicts | Scale tier | Could | RF-17 |
| RF-22 | Playground | Traduz 1 string ao vivo com pipeline | source, locales | tradução+score | Público, rate-limit + budget cap | Should | RF-04 |
| RF-23 | TM semântica | pgvector kNN sugere aprovadas como few-shot | vetor, locale | matches | minScore 0.6 | Could | RF-13 |
| RF-24 | Fine-tuning | `dataset` exporta JSONL; roteia locale→modelo FT | lock | JSONL + readiness | Gate 50M strings | Could | RF-05 |
| RF-25 | Fila persistente | Enfileira sob carga; workers com retry/backoff | job | resultado | FOR UPDATE SKIP LOCKED | Could | RF-17 |
| RF-26 | LGPD (DSAR/erasure/audit/retention) | Export, exclusão, audit hash-chained, retenção | sessão | bundle/plan | Audit retido; transfere ownership | Must | RF-19 |
| RF-27 | MFA (TOTP) | Enroll/verify RFC 6238 | sessão, código | secret/enabled | Habilita só após verificar | Should | RF-19 |

## 3. Requisitos Não Funcionais

| Categoria | Requisito / Meta |
|---|---|
| **Performance** | `translate` 200 strings×5 locales < 90s (paralelismo 4); no-op (tudo no lock) < 2s e $0; API p95 < 1.2s (translate), p99 < 2.5s |
| **Escalabilidade** | Core stateless; cloud serverless (Vercel); TM cache KV; read replica; pgvector HNSW; fila para picos (>50 req/min) |
| **Disponibilidade** | Alvo 99.9% (Pro), SLA Scale; multi-AZ via Vercel/Neon (multi-region futura) |
| **Segurança** | OWASP ASVS L2, Top 10 mitigado; deny-by-default authz; rate limiting; CSRF/CSP/HSTS; MFA; scrypt/argon2; DevSecOps no CI |
| **Observabilidade** | Logs estruturados (Pino) com redaction; Sentry; métricas/alertas de custo LLM por org; OpenTelemetry (planejado) |
| **Auditoria** | `audit_log` imutável hash-chained; ações sensíveis registradas; `verifyChain` |
| **LGPD** | Zero-retention default; DSAR export/erasure; retenção configurável; base legal documentada |
| **PCI** | Fora de escopo — pagamentos delegados ao **Stripe** (SAQ-A); nenhum dado de cartão trafega/armazena no sistema |
| **ISO 27001** | Controles de acesso (RBAC), gestão de chaves, log de auditoria, gestão de vulnerabilidades (Dependabot/SCA), SDLC seguro |
| **Resiliência** | Retry exponencial (provider e fila), circuit breaker de custo, fallback grep (AST), fallback token-sim (embeddings) |
| **Backup** | Neon PITR (retenção ≥ 7 dias); lockfile é backup natural da TM (no Git do cliente) |
| **Disaster Recovery** | **RTO 4h · RPO 1h** (metas). Runbook + restore de branch Neon; IaC futura para reprovisionamento |
| **SLA/SLO/SLI** | **SLA** 99.9% (planos pagos). **SLOs:** disponibilidade 99.9%, p95 translate < 1.2s, taxa de erro 5xx < 0.5%. **SLIs:** `http_req_duration`, `http_req_failed`, cost/org, quota alerts |

---
[← Visão Geral](./overview.md) · [Índice](./index.md) · [Arquitetura →](./architecture.md)
