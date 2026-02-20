---
name: new-service
description: Scaffold a new Fastify microservice following project conventions
disable-model-invocation: true
---

# New Service Scaffolding

Scaffold a new Fastify microservice in the script-manifest monorepo.

## Arguments

The user provides:
- **name**: Service name (e.g., `analytics`) — becomes `{name}-service` directory
- **port**: Port number (check existing services to avoid conflicts)
- **storage**: `none` | `postgres` | `opensearch` | `minio`

## What to Create

Create `services/{name}-service/` with:

### package.json
```json
{
  "name": "@script-manifest/{name}-service",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "node --import tsx --test src/index.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@script-manifest/contracts": "workspace:*",
    "fastify": "^5.2.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.8.1",
    "tsx": "^4.19.2",
    "typescript": "^5.9.3"
  }
}
```

If `storage: postgres`, add `"@script-manifest/db": "workspace:*"` to dependencies.

### tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

### src/index.ts
Use `buildServer()` factory pattern with:
- Typed options interface with `logger` and optional repository (if DB-backed)
- `genReqId` with `x-request-id` header fallback
- Health endpoints: `/health`, `/health/live`, `/health/ready`
- Start server on configured port

### src/index.test.ts
- Use `node:test` and `node:assert/strict`
- Create server with `buildServer({ logger: false })`
- Test health endpoints
- If DB-backed, test with `MemoryRepo`

### Dockerfile
Standard multi-stage Node.js Dockerfile matching other services.

## After Scaffolding

1. Add service to `pnpm-workspace.yaml` if not auto-detected
2. Add to `compose.yml` if infrastructure is needed
3. Add upstream URL to gateway's `GatewayContext` if it needs gateway routing
4. Run `pnpm install` to link workspace dependencies
5. Run `pnpm --filter @script-manifest/{name}-service test` to verify
