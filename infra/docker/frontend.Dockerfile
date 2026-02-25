# syntax=docker/dockerfile:1.7

# ── Stage 1: Prune monorepo ──────────────────────────────────────────
FROM node:25-trixie-slim AS pruner
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
RUN for attempt in 1 2 3 4 5; do \
      npm install -g turbo@2 && exit 0; \
      echo "turbo install failed (attempt ${attempt}), retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1
WORKDIR /app
COPY . .
RUN turbo prune @script-manifest/writer-web --docker

# ── Stage 2: Install deps & build ────────────────────────────────────
FROM node:25-trixie-slim AS builder
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
RUN for attempt in 1 2 3 4 5; do \
      npm install -g pnpm@9.12.3 && exit 0; \
      echo "pnpm install failed (attempt ${attempt}), retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1
WORKDIR /app

# Install dependencies first (cached unless lockfile changes)
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    sh -eu -c 'for attempt in 1 2 3 4 5; do \
      pnpm install \
        --frozen-lockfile \
        --store-dir /pnpm/store \
        --prefer-offline \
        --network-concurrency=8 \
        --fetch-retries=5 \
        --fetch-retry-factor=2 \
        --fetch-retry-mintimeout=10000 \
        --fetch-retry-maxtimeout=120000 && exit 0; \
      echo "pnpm install failed (attempt ${attempt}), retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1'

# Copy full source and root configs not included by turbo prune
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm build --filter=@script-manifest/writer-web...

# ── Stage 3: Production runtime ──────────────────────────────────────
FROM node:25-trixie-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

# Copy Next.js standalone output
COPY --from=builder /app/apps/writer-web/.next/standalone/ ./
COPY --from=builder /app/apps/writer-web/.next/static/ ./apps/writer-web/.next/static/
COPY --from=builder /app/apps/writer-web/public/ ./apps/writer-web/public/

EXPOSE 3000
CMD ["node", "apps/writer-web/server.js"]
