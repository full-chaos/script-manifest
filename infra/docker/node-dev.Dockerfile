FROM node:22-bookworm-slim

RUN npm install -g pnpm@9.12.3 && pnpm --version

WORKDIR /workspace
