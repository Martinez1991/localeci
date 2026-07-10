<div align="center">

# LocaleCI

**Ship your app in 30 languages. Without leaving Git.**

An open-source CLI + GitHub Action that translates your i18n files with LLMs on every commit — and tells you, per string, how much to trust the translation.

[![npm](https://img.shields.io/npm/v/localeci)](https://www.npmjs.com/package/localeci)
[![License: FSL-1.1](https://img.shields.io/badge/license-FSL--1.1-blue)](./LICENSE)
[![CI](https://github.com/localeci/localeci/actions/workflows/ci.yml/badge.svg)](https://github.com/localeci/localeci/actions)

[Quickstart](#quickstart) · [How it works](#how-it-works) · [Quality scores](#quality-scores) · [Config](#configuration) · [Contributing](./CONTRIBUTING.md)

<!-- demo GIF placeholder — 15s: `npx localeci translate`, pt-BR/de/ja files appear, PR opens with quality scores -->

</div>

---

## Why

Localizing an app today means either:

- **A TMS** (Lokalise, Crowdin, Phrase): $120–1,200/month, weeks of setup, your strings live in someone else's platform, and the workflow was designed for translation managers — not for your CI pipeline.
- **A homemade GPT script**: breaks ICU plurals, loses placeholders, no translation memory, no glossary, and nobody on the team trusts it in production.

So most teams just... don't localize.

LocaleCI is the third option: **translation as a build step.** Git stays the source of truth. Every string gets a verifiable quality score. You review translations the same way you review code — in a PR.

## Quickstart

```bash
npx localeci init        # detects your i18n setup (i18next, next-intl, JSON/YAML/PO)
npx localeci translate   # translates missing strings to your target locales
```

No API key handy? Try the whole pipeline offline with the deterministic mock provider:

```bash
npx localeci translate --mock
```

Or add the GitHub Action and never think about it again:

```yaml
# .github/workflows/localize.yml
- uses: localeci/localeci/packages/action@v1
  with:
    locales: pt-BR, de, ja, es
    api-key: ${{ secrets.LOCALECI_KEY }}   # or bring your own LLM key
```

Every PR that touches strings gets translation commits + a single quality-report comment.

## How it works

1. **Context-aware translation.** The engine doesn't just see the string — it sees the component it lives in (button? tooltip? error message?), your glossary, and your translation memory. Context is what human translators in a TMS *never* get.
2. **Deterministic validation.** ICU plurals, placeholders, HTML tags, and length constraints are checked mechanically. A translation that breaks `{count, plural, ...}` never reaches your repo.
3. **Quality scoring.** Each translation is judged against a per-language rubric, producing a 0–100 score. (Optional back-translation with `--paranoid`.) Strings below your threshold are flagged for human review — right in the PR.
4. **Translation memory as a lockfile.** Approved translations are cached in `localeci.lock.json`, versioned in *your* repo. The same string is never translated (or paid for) twice — a no-op `translate` costs $0.

## Quality scores

The honest answer to "can you trust AI translation?" is: **sometimes, and you should be able to see when.**

```
✔ pt-BR  "Save changes"        → "Salvar alterações"          score 98
✔ de     "Save changes"        → "Änderungen speichern"       score 97
⚠ ja     "Blast your growth"   → [flagged: idiom, score 71]   needs review
```

## Supported formats & frameworks

| Format | Frameworks | Notes |
|---|---|---|
| JSON (nested) | i18next, next-intl | key order, indentation & new-only diffs preserved |
| YAML | generic | comments preserved; anchors/aliases unsupported (clear error) |
| gettext PO | generic | `msgctxt`, plurals (via ICU round-trip), comments, fuzzy |
| iOS `.strings` | Apple | comments preserved; `en.lproj/` → `<locale>.lproj/` |
| Android `strings.xml` | Android | `<string>`, `<plurals>` (via ICU), `translatable="false"`/arrays passthrough; `values/` → `values-pt-rBR/` |
| Fluent `.ftl` | Project Fluent | simple messages translated; selectors/attributes preserved verbatim |

ICU MessageFormat is translated **branch-by-branch** and recomposed, with CLDR plural categories enforced per target language (Polish needs `few`, Japanese only `other`).

## Configuration

`localeci.config.json` ([JSON Schema](./schema.json)):

```jsonc
{
  "$schema": "https://localeci.dev/schema.json",
  "source": { "locale": "en", "files": "locales/en/**/*.json", "format": "i18next" },
  "targets": ["pt-BR", "es", "de", "fr", "ja"],
  "provider": { "name": "anthropic", "apiKeyEnv": "LOCALECI_KEY" },
  "quality": { "threshold": 85, "onBelowThreshold": "flag" },   // flag | fail | skip
  "glossary": "localeci.glossary.json",
  "context": { "scanCode": true, "include": ["src/**/*.{tsx,jsx,ts}"] },
  "style": { "tone": "professional", "audience": "SaaS product UI", "notes": "Prefer 'você' over 'tu' in pt-BR" }
}
```

Commands: `init` · `translate [--to de,ja] [--mock] [--paranoid] [--json]` · `check [--json]` (CI: exits non-zero on missing/broken/low-score) · `status`.

`--paranoid` back-translates each string and cross-checks similarity to the source (spec §5.6). `--json` emits a machine-readable report with per-locale scores, flagged strings, tokens, and estimated cost. Human edits to translations in a PR are detected and re-locked as `approvedBy: human`, then reused as few-shot examples for similar strings (spec §5.7).

## Bring your own key, or use the cloud

The CLI is open source and runs anywhere — your machine, your CI — with your own LLM API key. Nothing leaves your infrastructure.

[LocaleCI Cloud](./apps/cloud) adds hosted translation (no key juggling), a review dashboard, team glossaries, and flat pricing from $29/mo. Free tier: 1 repo, 2 languages, 500 strings.

## Current limitations

- Best supported: JSON (i18next, next-intl), YAML, gettext PO. iOS `.strings`, Android `strings.xml`, and Fluent `.ftl` are supported (Fluent selectors pass through untranslated). More formats coming — PRs welcome.
- Optimized for the ~15 high-resource languages. Low-resource languages get lower scores *by design* (that's the point of scoring).
- Visual UI preview is cloud-only and planned.

## Repository layout

```
packages/core       engine: parsers, diff, TM lockfile, validators, ICU, pipeline
packages/providers  LLM adapters (anthropic, openai, cloud, mock) behind one interface
packages/cli        the `localeci` command
packages/action     the GitHub Action (thin wrapper over the CLI)
apps/cloud          Next.js: site + dashboard + metered translation proxy
examples/           sample next-intl & i18next apps (demo + e2e)
golden/             golden set + quality-regression harness
```

## Contributing

Adding a new framework/format is a well-paved path — see [CONTRIBUTING.md](./CONTRIBUTING.md). Good first issues are labeled.

## Security

See [docs/security.md](./docs/security.md). TL;DR: BYO-key mode never sends strings anywhere but your provider; cloud mode is zero-retention by default.

## License

Engine & tooling: **FSL-1.1** (free for everything except competing hosted services; converts to Apache 2.0 after 2 years). Cloud: commercial.
