# ── Stage 1: Prune monorepo ──────────────────────────────────────────
FROM node:25-trixie-slim AS pruner
RUN npm install -g turbo@2
WORKDIR /app
COPY . .
ARG SERVICE_NAME
RUN turbo prune @script-manifest/${SERVICE_NAME} --docker

# ── Stage 2: Install deps & build ────────────────────────────────────
FROM node:25-trixie-slim AS builder
RUN npm install -g pnpm@9.12.3
WORKDIR /app

# Install dependencies first (cached unless lockfile changes)
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

# Copy full source and root configs not included by turbo prune
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
ARG SERVICE_NAME
RUN pnpm build --filter=@script-manifest/${SERVICE_NAME}...

# ── Stage 3: Production runtime ──────────────────────────────────────
FROM node:25-trixie-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.12.3

WORKDIR /app

# Install production dependencies only
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from all packages in the pruned workspace
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/services/ ./services/

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}
ENV NODE_ENV=production

EXPOSE 4000
CMD ["sh", "-c", "node services/${SERVICE_NAME}/dist/index.js"]
