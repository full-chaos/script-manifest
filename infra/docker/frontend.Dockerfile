# ── Stage 1: Prune monorepo ──────────────────────────────────────────
FROM node:25-trixie-slim AS pruner
RUN npm install -g turbo@2
WORKDIR /app
COPY . .
RUN turbo prune @script-manifest/writer-web --docker

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
