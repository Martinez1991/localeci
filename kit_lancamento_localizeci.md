# Kit de Lançamento — LocalizeCI

> **Decisão de idioma dos ativos:** todo material público (README, Show HN, landing) está em **inglês**, porque o mercado é global e o Hacker News/GitHub são anglófonos. Os comentários e instruções para você estão em português. Onde o texto precisa de um dado seu (link, GIF, nome final), está marcado com `[PLACEHOLDER]`.

---

## PARTE 1 — Nome

### Princípio: nos primeiros 12 meses, descritivo > criativo

Um nome descritivo ("fala o que faz") ganha em SEO, em clareza no HN ("o título já explica o produto") e em memorização por devs. Marcas criativas (Stripe, Vercel) funcionam quando há dinheiro para construir associação — você não tem. Timebox esta decisão em **2 horas**. Nome não define o sucesso; hesitação em lançar, sim.

### Candidatos (em ordem de preferência)

| Nome | Tipo | Prós | Contras |
|---|---|---|---|
| **LocaleCI** | Descritivo | Diz exatamente o que é (locale + CI); curto; soa dev-native; ótimo para SEO de cauda ("locale ci github action") | Pouco "brandável" para consumer — irrelevante, seu público é dev |
| **Polylate** | Híbrido (poly + translate) | Brandável, curto, pronunciável em qualquer idioma | Precisa de tagline para explicar |
| **Glossia** | Criativo (grego: língua) | Bonito, marca registrável com facilidade | Zero SEO inicial; soa mais "linguística" que "dev tool" |
| **StringShip** | Híbrido (strings + ship) | Vibe dev ("ship it"); memorável | Pode confundir com string manipulation libs |
| **LocForge** | Descritivo-forte | "Forge" ressoa com devs (SourceForge, Forge) | Loc é jargão que só quem já faz i18n conhece |
| **TranslateKit** | Descritivo | Claríssimo | Genérico demais; provável conflito com nomes existentes |

### Checklist de verificação (faça para os 2 finalistas, ~30 min cada)

1. Domínio `.com` e `.dev` disponíveis (ou compráveis por < US$ 100)
2. Pacote **npm** disponível (crítico — é o comando que as pessoas digitam: `npx localeci`)
3. Organização **GitHub** disponível
4. Handle no X/Twitter e Bluesky
5. Busca rápida de marca: USPTO (tmsearch.uspto.gov) e INPI — procurando conflito **na mesma classe** (software, classe 42/9). Não precisa de advogado agora; precisa de bom senso ("existe outra dev tool com esse nome?")
6. Busca no Google e no GitHub pelo nome — existe produto ativo homônimo?
7. Teste de pronúncia: fale em voz alta em inglês e português. Se você precisa soletrar, descarte.

**Recomendação:** se `localeci` estiver livre no npm e um domínio razoável existir (`localeci.dev`, `getlocaleci.com`), feche com ele e siga em frente. Usarei `LocaleCI` nos textos abaixo — troque com find-replace pelo nome final.

---

## PARTE 2 — README.md (o ativo mais importante do lançamento)

> **Por quê:** no Show HN, 90% do tráfego vai direto ao repo. O README é sua landing page real no dia do lançamento. Regras seguidas abaixo: valor nos 3 primeiros segundos, GIF antes de texto, quickstart em menos de 60 segundos de leitura, honestidade sobre limitações (HN fareja e pune exagero).

```markdown
<div align="center">

# LocaleCI

**Ship your app in 30 languages. Without leaving Git.**

An open-source CLI + GitHub Action that translates your i18n files with LLMs on every commit — and tells you, per string, how much to trust the translation.

[![npm](https://img.shields.io/npm/v/localeci)](https://www.npmjs.com/package/localeci)
[![License: FSL-1.1](https://img.shields.io/badge/license-FSL--1.1-blue)]([PLACEHOLDER-link])
[![CI](https://github.com/[PLACEHOLDER]/localeci/actions/workflows/ci.yml/badge.svg)]([PLACEHOLDER])

[Quickstart](#quickstart) · [How it works](#how-it-works) · [Quality scores](#quality-scores) · [Cloud]([PLACEHOLDER-landing]) · [Discord]([PLACEHOLDER])

![demo]([PLACEHOLDER — GIF de 15s: dev roda `npx localeci translate`, arquivos pt-BR/de/ja aparecem, PR abre com quality scores])

</div>

---

## Why

Localizing an app today means either:

- **A TMS** (Lokalise, Crowdin, Phrase): $120–1,200/month, weeks of setup, your strings live in someone else's platform, and the workflow was designed for translation managers — not for your CI pipeline.
- **A homemade GPT script**: breaks ICU plurals, loses placeholders, no translation memory, no glossary, and nobody on the team trusts it in production.

So most teams just... don't localize. And leave 60–75% of their addressable market on the table.

LocaleCI is the third option: **translation as a build step.** Git stays the source of truth. Every string gets a verifiable quality score. You review translations the same way you review code — in a PR.

## Quickstart

```bash
npx localeci init        # detects your i18n setup (i18next, next-intl, JSON/YAML/PO)
npx localeci translate   # translates missing strings to your target locales
```

Or add the GitHub Action and never think about it again:

```yaml
# .github/workflows/localize.yml
- uses: localeci/action@v1
  with:
    locales: pt-BR, de, ja, es
    api-key: ${{ secrets.LOCALECI_KEY }}   # or bring your own LLM key
```

Every PR that touches strings gets translation commits + a quality report.

## How it works

1. **Context-aware translation.** The engine doesn't just see the string — it sees the component it lives in (button? tooltip? error message?), your glossary, and your translation memory. Context is what human translators in a TMS *never* get.
2. **Deterministic validation.** ICU plurals, placeholders, HTML tags, and length constraints are checked mechanically. A translation that breaks `{count, plural, ...}` never reaches your repo.
3. **Quality scoring.** Each string is back-translated and judged against a per-language rubric, producing a 0–100 score. Strings below your threshold are flagged for human review — right in the PR.
4. **Translation memory as a lockfile.** Approved translations are cached in a versioned file in *your* repo. The same string is never translated (or paid for) twice. Your data stays yours.

## Quality scores

We think the honest answer to "can you trust AI translation?" is: **sometimes, and you should be able to see when.**

```
✔ pt-BR  "Save changes"        → "Salvar alterações"          score 98
✔ de     "Save changes"        → "Änderungen speichern"       score 97
⚠ ja     "Blast your growth"   → [flagged: idiom, score 71]   needs review
```

## Bring your own key, or use the cloud

The CLI is open source and runs anywhere — your machine, your CI — with your own LLM API key. Nothing leaves your infrastructure.

[LocaleCI Cloud]([PLACEHOLDER]) adds hosted translation (no key juggling), a review dashboard, team glossaries, visual UI previews per language, and flat pricing from $29/mo. Free tier: 1 repo, 2 languages, 500 strings.

## Current limitations (honesty section)

- Best supported: JSON (i18next, next-intl), YAML, gettext PO. More formats coming — PRs welcome.
- Optimized for the ~15 high-resource languages. Low-resource languages get lower scores by design (that's the point of scoring).
- Visual UI preview is cloud-only and in beta.

## Roadmap

Vue/Nuxt & Svelte support → Markdown/MDX docs translation → mobile (iOS `.strings`, Android XML) → app store metadata. Vote on [issues]([PLACEHOLDER]).

## Contributing

Adding support for a new framework/format is a well-paved path — see [CONTRIBUTING.md]. Good first issues are labeled.

## License

Engine: FSL-1.1 (free for everything except competing hosted services; converts to Apache 2.0 after 2 years). Cloud: commercial.
```

**Tarefas para completar o README:** gravar o GIF de demo (use um repo de exemplo bonito, terminal limpo, ~15s — este GIF é o ativo nº 1 do lançamento inteiro); criar CONTRIBUTING.md; abrir 5–8 good-first-issues reais (ex.: "add Svelte support", "add .strings parser") **antes** do lançamento, para o repo parecer vivo.

---

## PARTE 3 — Show HN

### Regras do jogo (o que decide 80% do resultado)

- **Quando:** terça a quinta, 8h–10h da manhã, horário do leste dos EUA (9h–11h em Brasília). Nunca sexta/fim de semana.
- **O quê:** lance o **repositório open-source**, não a landing do SaaS. HN celebra código aberto e pune "mais um SaaS de IA". O cloud aparece discretamente no README.
- **Nunca** peça upvotes a ninguém, nem mande link direto do post para amigos (HN detecta voting rings e enterra o post). Compartilhe o *repo*, e quem quiser achará o post.
- **Fique 6–8 horas disponível** respondendo TODOS os comentários, rápido, tecnicamente e sem defensividade. O engajamento do autor nos comentários é fator de ranking na prática.
- Se flopar (acontece com posts bons): espere 2–3 semanas, melhore o produto com o feedback, relance com ângulo diferente. Relançamento é permitido e normal.

### Título (o fator isolado mais importante)

Opções, da mais forte para a mais fraca:

1. `Show HN: LocaleCI – Open-source CLI that translates your app's i18n files and scores each translation`
2. `Show HN: Translate your app on every commit, with a quality score per string (open source)`
3. `Show HN: I built a Git-native alternative to Lokalise using LLMs`

A opção 1 lidera porque contém os três ganchos do público HN: *open-source*, *CLI* e o diferencial não-óbvio (*scores each translation* — desperta o "hmm, como?"). A opção 3 é arriscada: citar concorrente atrai tráfego de comparação mas convida o comentário "Lokalise faz X e você não".

### Texto do post (primeiro comentário do autor)

```
Hi HN! I'm [NOME], a solo dev from Brazil.

I kept seeing the same pattern: small SaaS teams know that localizing
would grow their market, they get a quote from a TMS + human translators
(easily $10–15k/year), and they just... give up. The alternative —
a homemade GPT script — breaks ICU plurals, loses placeholders, and
nobody trusts it enough to ship.

So I built LocaleCI: a CLI + GitHub Action that translates your i18n
files with LLMs as part of your build, treating Git as the source of
truth. The part I spent the most time on is the quality pipeline:

- deterministic validators (ICU, placeholders, HTML, length) run first,
  so structurally broken translations never land;
- each string is then back-translated and judged against a per-language
  rubric, producing a 0–100 score;
- strings below your threshold get flagged for human review in the PR
  itself, like a code review.

The engine also feeds the LLM the component context the string lives in
(button vs tooltip vs error message) — which, funnily enough, is more
context than human translators get from a TMS spreadsheet.

The CLI is open source (FSL) and runs with your own API key, fully
local. There's an optional cloud with a review dashboard and flat
pricing, which is how I'm trying to make this sustainable.

Honest limitations: JSON/YAML/PO only for now, optimized for ~15
high-resource languages, and the visual UI preview is still beta.

I'd especially love feedback from anyone who has run localization at a
real company — what would make you trust (or never trust) something
like this in production?

Repo: https://github.com/[PLACEHOLDER]
```

**Por que este texto funciona:** história pessoal curta (HN gosta de solo devs), detalhes técnicos de verdade (validadores, back-translation, rubrica), seção honesta de limitações (desarma os críticos antes deles atacarem), pergunta final que convida os especialistas a comentar — e comentário de especialista é o que mantém o post no topo.

### Respostas prontas para os 5 comentários que VÃO aparecer

1. *"Tradução por LLM é lixo, já vi apps traduzidos por IA horríveis."* → Concordar parcialmente: "Fire-and-forget LLM translation is bad, agreed — that's exactly why the product is the scoring pipeline, not the translation. The bet is that verifiable quality + human review on flagged strings beats both blind AI and context-less human translation." Nunca ser defensivo.
2. *"Como isso é diferente de [concorrente X]?"* → Ter uma resposta de 3 linhas por concorrente, factual, elogiando o que eles fazem bem. Preparar para Lokalise, Crowdin e os AI-native novos.
3. *"Por que FSL e não MIT?"* → "MIT would let AWS-of-the-day host it against me on day one. FSL keeps it free for every user, converts to Apache 2.0 in 2 years, and lets a solo dev build this sustainably. Happy to hear counterarguments."
4. *"Quanto custa em tokens?"* → Ter números reais medidos: custo por 1.000 strings, por idioma. HN adora números.
5. *"Isso vai ser feature nativa do [framework/Copilot] em 6 meses."* → "Maybe! My bet is that translation is easy but *trustworthy* translation (memory, glossary, scoring, review workflow) is a product, not a feature. We'll see."

---

## PARTE 4 — Landing Page (copy completa)

> Estrutura de uma página, ordem testada para PLG dev tools: promessa → prova imediata (código) → como funciona → objeção principal (qualidade) → comparação → preço → FAQ. Tom: direto, técnico, zero adjetivo vazio ("revolutionary", "seamless" = proibidos).

### Hero

**Headline:** `Ship your app in 30 languages. Without leaving Git.`

**Subheadline:** `LocaleCI translates your i18n files with LLMs on every commit — with a per-string quality score you can actually audit. Open-source CLI, flat pricing, 10 minutes to set up.`

**CTA primário:** `Start free — no card` · **CTA secundário:** `Star on GitHub ★ [contador]`

**Prova imediata (bloco de código no hero, não screenshot):**
```bash
$ npx localeci translate --to pt-BR,de,ja
✔ 214 strings translated · avg quality 96 · 3 flagged for review
✔ Opened PR #142 → review translations like you review code
```

### Seção: The problem (3 colunas curtas)

- **TMS platforms** — `$120–1,200/mo, weeks of setup, built for translation managers — not your pipeline.`
- **DIY GPT scripts** — `Broken plurals, lost placeholders, no memory, no trust.`
- **Doing nothing** — `60–75% of your addressable market speaks another language.`

### Seção: How it works (3 passos com visual)

1. `Connect your repo. LocaleCI detects your i18n setup automatically.`
2. `Every PR that touches strings gets translations committed back — with context from your actual components, glossary and translation memory.`
3. `Review flagged strings in the PR. Merge. Ship globally.`

### Seção: A objeção principal, de frente

**Título:** `"Can I trust AI translation?" — Sometimes. And you should see when.`

Copy: `Every string passes deterministic validation (ICU plurals, placeholders, HTML), then gets back-translated and judged against a per-language rubric. The result is a 0–100 score per string. High scores merge automatically. Low scores wait for a human. That's the whole product.`

[Visual: o exemplo de scores do README]

### Seção: Comparação (tabela)

| | LocaleCI | Traditional TMS | DIY script |
|---|---|---|---|
| Setup | 10 min | Weeks | Days |
| Source of truth | Your Git repo | Their platform | Nowhere |
| Quality visibility | Score per string | Trust the vendor | None |
| Pricing | Flat, from $0 | $120–1,200/mo + per-word | Hidden (your time) |
| Open source | ✔ | ✘ | — |

### Seção: Pricing

`Free` — 1 repo, 2 languages, 500 strings, community support. *For side projects.*
`Pro — $29/mo` — 5 repos, 10 languages, 10k strings, docs translation. *For indie products.*
`Team — $99/mo` — unlimited repos, 30 languages, review workflows, shared glossary. *For growing SaaS.*
`Scale — $299/mo` — visual UI previews, priority queue, SLA. *For products where i18n is revenue.*

Linha abaixo do pricing: `Bring your own LLM key with the open-source CLI — free forever, runs on your infra.` (Esta linha *aumenta* conversão paga: prova que você não está fazendo refém, e quem quer conveniência paga.)

### FAQ (as 6 que destravam compra)

1. `Do my strings leave my infrastructure?` → Only in cloud mode; zero-retention mode available; CLI mode: never.
2. `Which frameworks?` → i18next, next-intl, JSON/YAML/PO today; roadmap público linkado.
3. `What about languages the AI is bad at?` → That's what the score is for — copy honesta sobre idiomas de baixo recurso.
4. `Can my existing translations be imported?` → Yes, they seed your translation memory.
5. `What happens if I cancel?` → Everything lives in your repo. You lose the dashboard, not your translations. (Anti-lock-in como argumento de venda.)
6. `Who's behind this?` → Solo founder, building in public, link para o GitHub e para você. (Em dev tools, fundador solo transparente converte melhor que fingir ser empresa grande.)

### Footer-CTA

`Your next market doesn't speak English. → Start free`

---

## PARTE 5 — Checklist de lançamento (ordem de execução)

**T-menos 2 semanas:** nome fechado + domínio + npm + org GitHub · README completo com GIF · 8 good-first-issues abertas · landing no ar · analytics básico instalado.

**T-menos 1 semana:** dogfood público — traduzir 2 projetos open-source conhecidos e abrir PRs (com issue prévia pedindo permissão; esses PRs são prova social linkável no post) · medir custo real por 1.000 strings (para a resposta pronta nº 4) · rascunho do post revisado por 2 devs nativos em inglês.

**Dia D (terça/quarta/quinta, 9h Brasília):** publicar Show HN · responder tudo por 8h · postar o repo (não o post do HN) no Discord/comunidades onde você já participa.

**D+1 a D+7:** post no r/webdev e dev.to com ângulo técnico ("How I score LLM translations") · e-mail pessoal para cada um dos primeiros 50 signups perguntando o que quase os impediu de usar · triagem do feedback em 3 baldes: corrigir agora / roadmap / ignorar.

**D+14:** decidir data do lançamento no Product Hunt (do produto cloud, ângulo diferente do HN) com base no que aprendeu.
