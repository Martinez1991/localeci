# Contributing to LocaleCI

Thanks for helping! The most valuable contributions are **new formats/frameworks**
and **golden-set trap cases**. Both are well-paved paths.

## Setup

```bash
corepack enable            # or: npm i -g pnpm@9
pnpm install
pnpm -r build
pnpm -r test               # 90+ tests, all offline (mock provider)
pnpm -r typecheck
```

Node ≥ 20. TypeScript strict everywhere. Zod for every schema. Vitest for tests.

## The golden rule of parsers

> The diff of a translated file must contain **only** the new/changed strings.

A serializer that reorders keys produces 500-line diffs and destroys trust in the
PR. Every parser ships **snapshot tests** proving order, indentation, and comments
round-trip. See `packages/core/src/parsers/*.test.ts`.

## Adding a format (good first issue)

1. Implement the `Parser` interface in `packages/core/src/parsers/<format>.ts`:
   `parse(raw) → FlatEntry[]` and `serialize(entries, original) → string`.
   `serialize` **must** preserve the original's order/indentation/comments.
2. Register it in `packages/core/src/parsers/index.ts` and map its extension in
   `formatFromExtension`.
3. Add snapshot tests (parse, minimal-diff edit, orphan removal, empty target).
4. Add a couple of trap cases to `golden/dataset.json`.

## Adding a provider

Implement the `Provider` interface (`translate`, `judge`) in
`packages/providers/src/`. Reuse `buildTranslatePrompt`/`buildJudgePrompt` from
core so prompts stay consistent, and `callAndParse` for the Zod-validated retry.

## Quality gate

Any change to prompt/model/batching must not regress the golden set:

```bash
pnpm --filter @localeci/golden quality           # structural, mock, free
LOCALECI_PROVIDER=anthropic ANTHROPIC_API_KEY=… node golden/run.mjs
```

## Commit / PR

- Keep PRs focused. Add tests. `pnpm -r test` and `pnpm -r typecheck` must pass.
- Never send real API keys or customer strings in tests — use the `mock` provider.
