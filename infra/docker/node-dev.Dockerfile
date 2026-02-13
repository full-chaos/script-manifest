FROM node:25-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.12.3 && pnpm --version

WORKDIR /workspace
