#!/usr/bin/env bash
set -euo pipefail

pnpm install

docker compose -f infra/docker-compose.yml --profile phase1-apps up -d
