# syntax=docker/dockerfile:1.7

# Dedicated Dockerfile for the db-migrator one-shot container.
#
# Unlike service.Dockerfile (which uses turbo prune for a single service),
# the migration script imports repositories from EVERY service to run
# schema init across the entire database. A turbo prune would pull in
# the whole monorepo anyway, so we skip it and install directly.

# ── Stage 1: Install deps & build ─────────────────────────────────────
FROM node:25-alpine AS builder
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
RUN for attempt in 1 2 3 4 5; do \
      npm install -g pnpm@10.31.0 && exit 0; \
      echo "pnpm install failed (attempt ${attempt}), retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm-store-db-migrator,target=/pnpm/store,sharing=locked \
    pnpm install \
      --frozen-lockfile \
      --store-dir /pnpm/store \
      --prefer-offline \
      --network-concurrency=8 \
      --fetch-retries=5 \
      --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=10000 \
      --fetch-retry-maxtimeout=120000
RUN pnpm build

# ── Stage 2: Production runtime ──────────────────────────────────────
FROM node:25-alpine AS runner
RUN apk update \
 && apk upgrade --no-cache zlib \
 && apk add --no-cache curl
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
RUN for attempt in 1 2 3 4 5; do \
      npm install -g pnpm@10.31.0 && exit 0; \
      echo "pnpm install failed (attempt ${attempt}), retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1
WORKDIR /app

# Install production dependencies
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/ ./services/
COPY --from=builder /app/scripts/run-migrations.ts ./scripts/run-migrations.ts
COPY --from=builder /app/tsconfig.base.json ./tsconfig.base.json
RUN --mount=type=cache,id=pnpm-store-db-migrator,target=/pnpm/store,sharing=locked \
    pnpm install \
      --frozen-lockfile \
      --store-dir /pnpm/store \
      --prefer-offline \
      --network-concurrency=8 \
      --fetch-retries=5 \
      --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=10000 \
      --fetch-retry-maxtimeout=120000

ENV NODE_ENV=production
ENV OTEL_SERVICE_NAME=db-migrator

USER node
CMD ["node", "--import", "tsx", "scripts/run-migrations.ts"]
