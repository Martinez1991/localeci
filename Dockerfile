# LocaleCI CLI — container image.
# Usage:
#   docker run --rm -v "$PWD":/work ghcr.io/localeci/localeci translate --to de --mock
# The workdir /work is where you mount your repository.

# ── build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @localeci/core --filter @localeci/providers --filter localeci build \
 && pnpm --filter localeci --prod deploy /prod

# ── runtime stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
LABEL org.opencontainers.image.title="LocaleCI"
LABEL org.opencontainers.image.description="Git-native i18n translation with a per-string quality score (CLI)."
LABEL org.opencontainers.image.source="https://github.com/localeci/localeci"
LABEL org.opencontainers.image.licenses="FSL-1.1-Apache-2.0"
ENV NODE_ENV=production
WORKDIR /work
COPY --from=build /prod /opt/localeci
RUN printf '#!/bin/sh\nexec node /opt/localeci/dist/cli.js "$@"\n' > /usr/local/bin/localeci \
 && chmod +x /usr/local/bin/localeci
# Non-root by default.
USER node
ENTRYPOINT ["localeci"]
CMD ["--help"]
