# MVP Non-goals

Written down so we don't cede to the temptation (spec §0). These are **out of
scope for the MVP** — not forever, just not now:

- Visual UI preview of translations
- Collaborative web review UI
- Vue / Svelte / Angular framework support
- Mobile formats (iOS `.strings`, Android XML)
- Markdown / MDX / docs translation
- Self-host enterprise, SSO
- Model fine-tuning
- A glossary editing UI (edit the JSON file)
- More than ~15 official target languages

## Deliberately deferred (with the trigger to revisit)

| Decision | Trigger |
|---|---|
| Persistent queue / dedicated workers | Cloud proxy sustains > 50 req/min |
| pgvector / semantic TM | > 1M aggregated TM entries, or human few-shot feature |
| Real AST (instead of grep) for code context | Golden set shows > 5% context-attributable errors |
| Vue/Svelte support | 3+ real requests or an external contributor |
| Fine-tuning | > 50M strings with human feedback |
