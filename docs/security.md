# Security & data handling

_One page, on purpose. Last reviewed: 2026-07._

## Where do my strings go?

- **CLI, bring-your-own-key (default):** your strings go **only** to the LLM
  provider you configured (Anthropic/OpenAI), using your own API key, directly
  from your machine or CI. LocaleCI has no server in this path.
- **CLI, cloud mode / the GitHub Action with a LocaleCI key:** batches are sent
  to the LocaleCI proxy, which calls the provider with our keys. The proxy is
  **zero-retention by default**: we store counts, token totals, model, and
  locale — **never the source or translated text**. A content hash is stored only
  if an operator explicitly sets `LOCALECI_RETENTION=true`.

## Prompt injection

All client string content is treated strictly as **data**. It is passed to the
model as JSON, never interpolated into instructions, and the system prompt tells
the model to translate suspicious-looking text literally and never obey it. A
deterministic sanity validator flags prompt/assistant leakage in outputs
(`Here is the translation…`, code fences, refusals).

## API keys

`lcx_live_…` keys are salted-hashed at rest (scrypt today; argon2id in
production), shown exactly once, carry a visible prefix for recognition, and are
revocable. Bring-your-own provider keys are read from environment variables and
never written to disk or logs.

## Supply chain

- Dependencies are pinned via the lockfile; Dependabot is enabled.
- npm packages are published with `--provenance`.
- In docs and examples the GitHub Action is pinned by commit SHA:
  `uses: localeci/localeci/packages/action@<40-char-sha>`.
- The Action requests minimal permissions: `contents: write`,
  `pull-requests: write`. Fork PRs run **read-only** (`check`) — no secrets, no
  commits.

## Reporting a vulnerability

Email security@localeci.dev. Please do not open a public issue for security
reports.
