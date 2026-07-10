# Golden set

The golden set is what protects LocaleCI's quality **from its own developers**
(spec §10). It is a curated collection of real UI strings with:

- an **approved reference translation**, and
- **trap tags** marking the hard cases: ICU plurals, double placeholders,
  nested HTML, idioms, one-word buttons, ambiguous-without-context strings,
  glossary/never-translate terms, and low-resource languages.

## Two jobs run against it

1. **Structural regression (always on, no API key).** Runs the pipeline with the
   deterministic `mock` provider and asserts that **no case ever produces a
   validator failure** and that every reference itself passes all validators.
   Lives in `packages/providers/src/golden.test.ts` and runs in normal CI.

2. **Quality regression (needs a key).** `node golden/run.mjs` runs a real
   provider over the set and reports validator failure rate, average judge
   score, exact-match rate against references, token usage, and estimated
   cost per 1,000 strings. It **fails the build** if the failure rate rises or
   the average score drops more than 2 points below `baseline.json`.

```bash
# structural (default, free)
pnpm --filter @localeci/golden quality

# quality regression with a real provider
LOCALECI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... node golden/run.mjs
LOCALECI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-... node golden/run.mjs --update-baseline
```

> **Rule:** any change to prompt, model, or batching only merges if it does not
> regress the golden set. Without this, you "improve" a prompt and silently
> break Japanese in week three.

## Growing to 300

v1 ships ~25 hand-picked trap cases. Week 6 expands to 300 strings extracted
from real open-source projects across 5+ languages, keeping the trap-tag
coverage balanced.
