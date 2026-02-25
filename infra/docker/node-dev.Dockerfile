FROM node:25-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*
ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_FACTOR=2 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=10000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
RUN for attempt in 1 2 3 4 5; do \
      npm install -g pnpm@9.12.3 && pnpm --version && exit 0; \
      echo "pnpm bootstrap failed (attempt ${attempt}), retrying..."; \
      sleep $((attempt * 5)); \
    done; \
    exit 1

WORKDIR /workspace
