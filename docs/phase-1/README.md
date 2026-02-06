# Phase 1: MVP Hub

This phase bootstraps the first deployable codebase for:

- Writer profile shell
- Project and draft management service contracts
- Competition directory plumbing
- Baseline API gateway
- OpenSearch-ready local stack

## Active Branch

- `codex/phase-1-writer-hub`

## Tracking

- Feature issue: `#14`
- Tasks: `#15` to `#22`
- Subtasks: `#23` to `#25`

## Bootstrapping

```bash
pnpm install
pnpm typecheck
```

Run core surfaces:

```bash
pnpm --filter @script-manifest/writer-web dev
pnpm --filter @script-manifest/api-gateway dev
pnpm --filter @script-manifest/profile-project-service dev
```

Or boot infra + app services together:

```bash
docker compose -f infra/docker-compose.yml --profile phase1-apps up -d
```
