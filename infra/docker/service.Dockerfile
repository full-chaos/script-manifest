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
ARG SERVICE_NAME
RUN turbo prune @script-manifest/${SERVICE_NAME} --docker

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
ARG SERVICE_NAME
RUN pnpm build --filter=@script-manifest/${SERVICE_NAME}...

# ── Stage 3: Production runtime ──────────────────────────────────────
FROM node:25-trixie-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
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

# Install production dependencies only
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    sh -eu -c 'for attempt in 1 2 3 4 5; do \
      pnpm install \
        --frozen-lockfile \
        --prod \
        --store-dir /pnpm/store \
        --prefer-offline \
        --network-concurrency=8 \
        --fetch-retries=5 \
        --fetch-retry-factor=2 \
        --fetch-retry-mintimeout=10000 \
        --fetch-retry-maxtimeout=120000 && exit 0; \
      echo "pnpm prod install failed (attempt ${attempt}), retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1'

# Copy compiled output from all packages in the pruned workspace
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/ ./services/

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}
ENV NODE_ENV=production

EXPOSE 4000
CMD ["sh", "-c", "node services/${SERVICE_NAME}/dist/index.js"]
