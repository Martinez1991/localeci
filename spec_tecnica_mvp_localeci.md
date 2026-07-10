# Especificação Técnica do MVP — LocaleCI

> **Princípio de escopo:** tudo neste documento cabe em 4–6 semanas de um dev sênior solo. Cada decisão prioriza (1) o GIF de demo impressionante, (2) o pipeline de qualidade — que é o produto — e (3) custo operacional próximo de zero. O que não serve a esses três fins foi cortado e está listado em "Non-goals".

---

## 0. Escopo

### Entregáveis do MVP

| # | Componente | Definição de pronto |
|---|---|---|
| 1 | **CLI open-source** (`localeci`) | `init`, `translate`, `check` funcionando para JSON (i18next/next-intl), YAML e PO; memória de tradução em lockfile; glossário; quality score por string |
| 2 | **GitHub Action** | Roda em PR, commita traduções, posta comentário com relatório de qualidade |
| 3 | **Cloud mínimo** | Login GitHub, API key, medição de uso, Stripe (Free/Pro/Team), página de uso |
| 4 | **Golden set de testes** | 300 strings de referência com traduções aprovadas, rodando em CI para detectar regressão de prompt/modelo |

### Non-goals do MVP (anotar no repo para não ceder à tentação)

Preview visual de UI · revisão colaborativa na web · Vue/Svelte/Angular · mobile (`.strings`/XML) · tradução de Markdown/docs · self-host enterprise · SSO · fine-tuning · UI de glossário (edita-se o arquivo) · mais de 15 idiomas-alvo oficiais.

---

## 1. Estrutura do repositório

Monorepo (pnpm workspaces + Turborepo) — um repo público único simplifica contribuição e o lançamento:

```
localeci/
├── packages/
│   ├── core/          # engine: parsers, pipeline, validadores, TM, scoring (zero deps de rede além do provider)
│   ├── cli/           # comandos, output bonito no terminal, config
│   ├── providers/     # adaptadores LLM (anthropic, openai, custom/self-host) atrás de interface única
│   └── action/        # GitHub Action (wrapper fino sobre a CLI)
├── apps/
│   └── cloud/         # Next.js: site + dashboard + API (privado? NÃO — público, mas deploy é seu)
├── examples/          # 2 apps de exemplo (next-intl e i18next) usados no GIF e nos testes e2e
├── golden/            # golden set de qualidade
└── LICENSE            # FSL-1.1
```

**Decisão:** `apps/cloud` fica no repo público também (modelo Cal.com/Plausible). Transparência total gera confiança e contribuições; a proteção comercial vem da licença FSL + da operação, não do segredo do código. Se preferir conservador: só `packages/*` público. Ambos defensáveis; recomendo público.

**Stack:** TypeScript estrito em tudo. Node ≥ 20. Zod para todos os schemas (config, lockfile, respostas de LLM). Vitest. tsup para build. Distribuição: npm + `npx`.

---

## 2. CLI — Interface e configuração

### Comandos

```bash
localeci init                    # detecta setup i18n, gera config interativamente
localeci translate               # traduz o que falta/mudou para todos os locales-alvo
localeci translate --to de,ja    # subconjunto
localeci check                   # valida SEM traduzir: strings faltantes, quebradas, score < threshold → exit code ≠ 0 (uso em CI)
localeci status                  # tabela de cobertura por locale
```

### `localeci.config.json` (schema Zod, validado com mensagens de erro úteis)

```jsonc
{
  "$schema": "https://localeci.dev/schema.json",
  "source": { "locale": "en", "files": "locales/en/**/*.json", "format": "i18next" },
  "targets": ["pt-BR", "es", "de", "fr", "ja"],
  "provider": { "name": "anthropic", "apiKeyEnv": "LOCALECI_KEY" },   // ou key da cloud
  "quality": { "threshold": 85, "onBelowThreshold": "flag" },          // flag | fail | skip
  "glossary": "localeci.glossary.json",
  "context": { "scanCode": true, "include": ["src/**/*.{tsx,jsx,ts}"] },
  "style": { "tone": "professional", "audience": "SaaS product UI", "notes": "Prefer 'você' over 'tu' in pt-BR" }
}
```

### Detecção automática no `init` (o momento "uau" do onboarding)

Heurísticas em ordem: existe `next-intl`/`i18next`/`react-i18next` no `package.json`? → existe pasta `locales|i18n|lang|messages`? → qual formato dos arquivos? → qual locale parece ser o fonte (o mais completo)? Gerar config preenchida e pedir só confirmação. Meta: `init` → `translate` em menos de 90 segundos num projeto Next.js típico.

---

## 3. Formatos e parsers (`packages/core/parsers`)

Interface única:

```ts
interface Parser {
  parse(raw: string): FlatEntry[];          // { key, value, meta (comentários, contexto ICU) }
  serialize(entries: FlatEntry[], original: string): string;  // preserva ordem, indentação e comentários do original
}
```

| Formato | Cobertura MVP | Armadilhas a tratar desde o dia 1 |
|---|---|---|
| JSON aninhado (i18next, next-intl) | Total | Flatten/unflatten com `.` em chaves; preservar ordem de chaves do fonte; arrays |
| YAML | Total | Âncoras/aliases: não suportar (erro claro), <1% dos projetos usam |
| gettext PO | Total | `msgid_plural`/`msgstr[n]`, headers, fuzzy flags |

**Regra de ouro do serializer:** o diff do arquivo traduzido deve conter APENAS as strings novas/alteradas. Um serializer que reordena chaves gera diffs de 500 linhas e mata a confiança no PR. Testes de snapshot para isso são obrigatórios.

**Suporte a ICU MessageFormat** (`{count, plural, one {...} other {...}}`, `{gender, select, ...}`): parsear com `@formatjs/icu-messageformat-parser`, traduzir **cada braço separadamente** mantendo a estrutura, e recompor. Nunca mandar a string ICU inteira "crua" para o LLM — é a fonte nº 1 de quebra em scripts caseiros, e é exatamente o bug que seu marketing explora.

---

## 4. Memória de tradução e glossário

### `localeci.lock.json` — o lockfile de traduções (decisão arquitetural central)

```jsonc
{
  "version": 1,
  "entries": {
    "sha256(sourceLocale|key|sourceText|targetLocale)": {
      "source": "Save changes",
      "target": "Salvar alterações",
      "locale": "pt-BR",
      "score": 98,
      "model": "provider/model-id",
      "approvedBy": "human" | "auto",       // editada à mão no PR ⇒ vira "human" na próxima rodada (ver §5.7)
      "translatedAt": "2026-07-08"
    }
  }
}
```

Por que lockfile e não banco: (a) o cliente é dono dos dados — argumento de venda anti-lock-in; (b) versionado no Git = auditável e revertível; (c) `translate` fica idempotente e barato: string cujo hash está no lock **não vai para o LLM** — o custo marginal do cliente cai a cada release, e a sua margem também. Entradas `approvedBy: "human"` são imutáveis para o pipeline (só o humano muda).

### `localeci.glossary.json`

```jsonc
{ "terms": [
  { "term": "workspace", "translations": { "pt-BR": "workspace" }, "note": "never translate" },
  { "term": "board",     "translations": { "pt-BR": "quadro", "de": "Board" } }
] }
```

Termos do glossário entram no prompt E são verificados pós-tradução pelo validador (§6.1) — prompt sozinho não garante.

---

## 5. O pipeline de tradução (`packages/core/pipeline`) — o coração do produto

```
parse → diff → contexto → batch → traduzir → validar (determinístico) → julgar (LLM) → score → decidir → escrever arquivos + lock
```

### 5.1 Diff
Comparar fonte × lock × arquivos-alvo. Estados por string: `missing` (traduzir), `stale` (fonte mudou desde o lock → retraduzir), `locked-human`, `locked-auto` (ok), `orphan` (chave sumiu do fonte → remover do alvo, com flag `--keep-orphans` para os medrosos).

### 5.2 Contexto (o diferencial técnico real)
Para cada chave, montar um `ContextBundle`:
- **Do arquivo:** chave completa (`checkout.errors.card_declined` já diz muito), vizinhas do mesmo namespace, comentários.
- **Do código** (se `scanCode: true`): grep otimizado (ripgrep via `@vscode/ripgrep` ou fallback JS) por `t('chave')` / `<Trans i18nKey=`; capturar ±10 linhas e classificar por heurística: dentro de `<button>` → "button label"; prop `title|placeholder|aria-label` → tipo correspondente; arquivo `*error*` → error message. Não fazer AST completo no MVP — grep + heurística entrega 90% do valor por 10% do esforço.
- **Do config:** `style` e glossário aplicável.

### 5.3 Batching
Agrupar por (locale × namespace), lotes de ~25 strings, prompt único por lote com resposta em JSON estrito. Lotes grandes demais degradam qualidade; pequenos demais explodem custo de tokens de contexto. 25 é o chute inicial — ajustar medindo no golden set. Concorrência: 4 lotes em paralelo com retry exponencial e respeito a rate limits do provider.

### 5.4 Prompt de tradução (v1 — rascunho funcional, iterar via golden set)

```
You are an expert software UI localizer translating from {source} to {target}.

Product context: {style.audience}. Tone: {style.tone}. {style.notes}

Glossary (MUST be respected exactly):
{glossary terms for this target}

Rules:
1. Preserve ALL placeholders like {name}, {{count}}, %s, <0>, </0> EXACTLY as-is.
2. Match the register and length constraints typical of UI (buttons short, tooltips concise).
3. Use the per-string context to disambiguate (a "Save" button ≠ "save" in prose).
4. Do not translate code, brand names, or glossary "never translate" terms.
5. Return ONLY valid JSON: {"translations": [{"id": "...", "text": "..."}]}

Strings to translate:
[{"id": "checkout.errors.card_declined",
  "text": "Your card was declined",
  "context": "error message shown in checkout form (src/checkout/Form.tsx)",
  "neighbors": ["checkout.errors.expired: Your card has expired"]}, ...]
```

Saída parseada com Zod; resposta malformada → 1 retry com o erro anexado → depois falha o lote (nunca “corrigir na fé”).

### 5.5 Roteamento de modelos
Classificador **determinístico** (sem LLM) decide o tier por string: comprimento > 80 chars, contém ICU/HTML, é marketing copy (heurística por namespace `landing.*`, `emails.*`), idioma de baixo recurso ⇒ **modelo top**; caso contrário ⇒ **modelo barato**. Interface `Provider` única (`translate(batch)`, `judge(batch)`) com adaptadores; modelos configuráveis, defaults sensatos. Meta de custo: ver §9.

### 5.6 Score de qualidade

`score = 100 − penalidades`:
- Validador determinístico falhou → score 0, nunca escreve no arquivo (vai para relatório como erro).
- LLM-judge (modelo barato, lote de até 50): recebe fonte + tradução + contexto + rubrica curta por idioma; retorna JSON `{accuracy: 0–5, fluency: 0–5, terminology: 0–5, uiFitness: 0–5, issues: []}`. Score = média ponderada normalizada (accuracy peso 2).
- **Back-translation** (traduzir de volta e comparar embeddings/similaridade): **cortado do caminho default do MVP** — dobra o custo para ganho marginal sobre um judge bem calibrado. Fica atrás de `--paranoid` (e vira feature paga da cloud depois). O marketing fala "back-translation available", que é verdade.

Decisão por string conforme `quality.threshold` e `onBelowThreshold`: `flag` (escreve + marca no relatório), `fail` (não escreve, exit ≠ 0 — modo CI estrito), `skip` (não escreve).

### 5.7 Loop de aprendizado humano
Na rodada seguinte, se o texto no arquivo-alvo difere do lock e a fonte não mudou ⇒ um humano editou no PR ⇒ atualizar lock com `approvedBy: "human"` e (cloud, pós-MVP) usar como few-shot para strings similares. É assim que "cada correção melhora o produto".

---

## 6. Validadores determinísticos (`packages/core/validators`)

Rodam antes do judge; falha = score 0. São baratos, infalíveis e o argumento contra o "script caseiro":

1. **Placeholders:** conjunto de `{x}`, `{{x}}`, `%s`, `%d`, `<0></0>`, `$t(...)` na tradução ≡ ao da fonte (extração por regex por formato).
2. **ICU:** re-parsear a tradução com o parser ICU; estrutura de braços plural/select deve bater com a exigida pelo idioma-alvo via CLDR (`make-plural`) — ex.: traduzir para polonês exige braço `few`; para japonês, só `other`. **Este validador sozinho é material de blog post.**
3. **HTML/tags:** tags balanceadas e equivalentes.
4. **Glossário:** termos "never translate" intactos; termos mapeados usados.
5. **Sanidade:** tradução não-vazia, não idêntica à fonte (exceto marcas/glossário), sem vazamento de prompt ("Here is the translation..."), razão de comprimento dentro de limites por par de idiomas (en→de até 1.6x, en→ja até 0.8x, tabela embutida).

---

## 7. GitHub Action (`packages/action`)

Wrapper fino: instala CLI pinada, roda `translate`, e:

1. Commita nos arquivos de locale + lockfile **no branch do PR** (`git-auto-commit` pattern; mensagem `chore(i18n): translate 12 strings to pt-BR, de [skip-localeci]` — a flag evita loop infinito de trigger).
2. Posta/atualiza **um único comentário** no PR (upsert por marcador HTML oculto) com o relatório:

```markdown
## 🌍 LocaleCI — 12 new strings translated
| Locale | Translated | Avg score | ⚠ Flagged |
|---|---|---|---|
| pt-BR | 12 | 96 | 0 |
| ja    | 12 | 88 | 2 |
<details><summary>⚠ 2 strings need review (ja)</summary>
`onboarding.tagline` — score 71 — idiom "hit the ground running" may read literally
</details>
Powered by [LocaleCI](https://localeci.dev) · [docs]
```

O comentário É o loop viral (todo o time vê) — capriche no design dele como se fosse a landing. Permissões mínimas no workflow: `contents: write`, `pull-requests: write`. Fork PRs: rodar em modo `check` somente-leitura (segurança padrão do GitHub para secrets em forks).

---

## 8. Cloud mínimo (`apps/cloud`)

**Stack:** Next.js (App Router) na Vercel · Postgres (Neon) + Drizzle ORM · Auth.js com GitHub OAuth · Stripe Checkout + Customer Portal (não construir UI de billing) · Resend para e-mails transacionais.

### O que a cloud faz no MVP — e só isso
1. Emite API key (a CLI usa a key da cloud OU key própria de provider — mesmo código, providers diferentes).
2. **Proxy de tradução:** endpoint `/api/v1/translate` que recebe lotes da CLI, chama o provider com AS SUAS keys, mede uso, aplica limites do plano. Zero-retention: logar apenas hashes e contagens, nunca o texto (flag de ambiente, ligada por padrão).
3. Dashboard: uso do mês, score médio, locales, upgrade.

### Schema (Drizzle, essencial)

```ts
users(id, githubId, email, createdAt)
orgs(id, name, ownerId, plan: 'free'|'pro'|'team', stripeCustomerId, stripeSubId)
apiKeys(id, orgId, hash, prefix /* lcx_live_abc… mostrado 1x */, lastUsedAt, revokedAt)
usageEvents(id, orgId, period 'YYYY-MM', stringsTranslated, tokensIn, tokensOut, model, locale, createdAt)
  -- agregado por dia via job; limites checados contra a soma do período
```

### Enforcement de limites
Free: 500 strings/mês, 2 locales, 1 repo (repo identificado por hash do `remote.origin.url` enviado pela CLI — burlável por quem quiser, irrelevante: quem burla free tier nunca ia pagar; não gaste engenharia nisso no MVP).

---

## 9. Custos e metas de performance

Medir de verdade na semana 2 (vira a resposta pronta do HN), mas ordem de grandeza planejada:

| Item | Estimativa | Nota |
|---|---|---|
| Custo LLM por 1.000 strings UI (média 8 palavras) traduzidas + julgadas, modelo barato | US$ 0,50–1,50 | Contexto é ~70% dos tokens — batching e compressão de contexto importam mais que o preço da string |
| Idem com 20% roteado para modelo top | US$ 2–4 | |
| Preço Pro (10k strings) vs custo | US$ 29 vs ~US$ 5–8 no pior caso de uso cheio | Margem ~75–85%; uso típico será fração do limite |
| Latência alvo `translate` com 200 strings novas, 5 locales | < 90 s | Paralelismo de 4 lotes |
| `translate` sem nada novo (tudo no lock) | < 2 s, custo US$ 0 | O caso do dia-a-dia — é o que torna o Action "invisível" |

---

## 10. Golden set e testes (o que protege o produto de você mesmo)

- `golden/`: 300 strings reais (extraídas de projetos open-source) × 5 idiomas, com traduções de referência aprovadas e casos-armadilha etiquetados: ICU plural, placeholder duplo, HTML aninhado, idioma, gíria, botão de 1 palavra, string ambígua sem contexto vs com contexto.
- Job de CI `quality-regression`: roda o pipeline no golden set, compara score médio e taxa de falha de validadores contra baseline; **qualquer mudança de prompt/modelo/batching só entra se não regredir**. Sem isso, você vai "melhorar" um prompt e quebrar japonês silenciosamente na terceira semana.
- Unit tests: parsers (snapshot de serialização!), validadores, diff, lockfile. E2E: os dois apps de `examples/` com provider mockado.
- Mock provider determinístico (`provider: "mock"`) para testes e para contribuidores rodarem sem key.

---

## 11. Segurança (o mínimo que não pode faltar nem no MVP)

- API keys: hash argon2 no banco, prefixo visível, mostradas uma única vez, revogáveis.
- Prompt injection via strings do cliente ("ignore previous instructions" dentro de uma string de UI): tratar TODO conteúdo de string como dado — delimitado no prompt como JSON, nunca interpolado em instruções; validador de sanidade (§6.5) pega vazamentos; judge recebe instrução explícita de ignorar instruções dentro do conteúdo.
- Zero-retention por padrão no proxy; documento público de 1 página "Security & data handling" desde o dia 1 (será perguntado no HN).
- Dependências: lockfile pinado, Dependabot, `npm provenance` na publicação (supply chain é tópico sensível para uma ferramenta que roda em CI alheio).
- Action pinada por SHA nos exemplos de docs (boa prática que seu público vai notar e respeitar).

---

## 12. Ordem de construção (mapa para as 4–6 semanas)

| Semana | Construir | Critério de pronto |
|---|---|---|
| 1 | `core`: parsers JSON/YAML + diff + lockfile + validadores 1–5 | Testes de snapshot verdes; `check` funciona offline |
| 2 | Pipeline: contexto (grep) + batching + provider Anthropic/OpenAI + prompt v1 + judge + score · **medir custos reais** | `translate` de ponta a ponta no app de exemplo; golden set v1 (100 strings) com baseline |
| 3 | CLI polida (`init` mágico, output bonito, erros úteis) + parser PO + ICU por braços | `init`→`translate` < 90 s num projeto Next.js virgem; **gravar o GIF** |
| 4 | GitHub Action + comentário de PR + dogfood em 2 projetos OSS reais | PRs públicos abertos e aceitos |
| 5 | Cloud: auth, keys, proxy medido, limites, Stripe, dashboard de uso | Compra Pro de ponta a ponta com cartão de teste |
| 6 | Golden set 300, hardening, docs, README final, buffer para o que atrasou | Checklist T-2 do kit de lançamento iniciado |

Se precisar cortar uma semana: corte a 5 (lançar só o open-source com waitlist da cloud) — nunca a 2 ou a 6.

---

## 13. Decisões deliberadamente adiadas (e o gatilho para revisitá-las)

| Decisão adiada | Gatilho |
|---|---|
| Fila persistente/workers dedicados | Proxy da cloud > 50 req/min sustentado |
| pgvector / TM semântica | > 1M entradas de TM agregadas OU feature de few-shot humano |
| AST real em vez de grep para contexto | Golden set mostrar > 5% de erros atribuíveis a contexto errado |
| Suporte Vue/Svelte | 3+ pedidos reais OU contribuidor externo (good-first-issue já aberta) |
| Fine-tuning | > 50M strings com feedback humano |
