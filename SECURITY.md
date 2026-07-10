# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security reports.

Email **security@localeci.dev** with details and, if possible, a proof of
concept. We aim to acknowledge within 3 business days and to ship a fix or
mitigation for confirmed high/critical issues within 30 days.

## Supported versions

Only the latest minor release line receives security fixes.

## What we do

- Secret scanning (gitleaks), SAST (CodeQL), and SCA (`pnpm audit`, gate on
  high/critical) run on every PR — see `.github/workflows/`.
- An SBOM (CycloneDX) is attached to every release.
- npm packages are published with provenance.
- Dependencies are pinned and updated via Dependabot.

For data handling and architecture-level security, see
[docs/security.md](./docs/security.md).
