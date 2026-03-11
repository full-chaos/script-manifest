# Deployment & Documentation Completeness — Design Spec

**Date:** 2026-03-11
**Status:** Approved

## Overview

Create comprehensive deployment configurations and documentation for Script Manifest across 4 deployment targets: Docker Compose (existing, documented), Docker Swarm (new), Kubernetes with Helm (new), and Kubernetes with raw manifests (new). Update existing documentation for completeness.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Local K8s tool | Support all (Minikube, kind, k3d, Docker Desktop) | Maximum flexibility; base config works with any, README has per-tool notes |
| Helm structure | Hybrid umbrella + per-service subcharts | One `helm install` for full stack, or deploy individual services |
| Infra deps in K8s | Subcharts for local/staging, external managed for prod | Realistic production pattern (RDS, ElastiCache, etc.) |
| Secrets management | Plain K8s Secrets (local), External Secrets Operator (staging/prod) | Progressive security; ESO supports AWS SM, Vault, GCP SM |
| Container registry | Configurable via Helm values, default GHCR | Consistent with existing CI; overridable per environment |
| K8s ingress | Standard Ingress resource (replaces Traefik) | Works with any ingress controller; Traefik stays for Compose/Swarm |
| Raw manifests | Generated from Helm via `render.sh` | Single source of truth; non-Helm users get static YAML |
| Infra Helm deps | Declared as `dependencies` in Chart.yaml (pulled from registries) | Standard Helm workflow; `Chart.lock` ensures reproducibility; CI runs `helm dependency build` |
| Observability in Swarm | Include Prometheus + AlertManager; exclude BugSink | Swarm needs self-hosted observability; BugSink is optional dev tooling |
| Admin allowlists | ConfigMap (not Secret) | Not cryptographic material; values are user IDs, acceptable in plaintext; easier to update |
| writer-web Dockerfile | Separate `frontend.Dockerfile` (Next.js standalone build) | Different build pipeline from backend `service.Dockerfile` |
| Local K8s access | NodePort for api-gateway (30400) + writer-web (30300); port-forward for others | Two-port NodePort is simpler than requiring an ingress controller for local dev |

## File Structure

```
deploy/
├── swarm/
│   ├── stack.yml                    # Swarm stack (prod-like)
│   └── stack.staging.yml            # Swarm overlay for staging
├── helm/
│   └── script-manifest/             # Umbrella chart
│       ├── Chart.yaml
│       ├── Chart.lock
│       ├── values.yaml              # Defaults (local dev)
│       ├── values-staging.yaml
│       ├── values-prod.yaml
│       ├── templates/
│       │   ├── _helpers.tpl
│       │   ├── namespace.yaml
│       │   └── NOTES.txt
│       └── charts/                  # Per-service subcharts
│           ├── api-gateway/
│           ├── identity-service/
│           ├── profile-project-service/
│           ├── competition-directory-service/
│           ├── search-indexer-service/
│           ├── submission-tracking-service/
│           ├── feedback-exchange-service/
│           ├── ranking-service/
│           ├── coverage-marketplace-service/
│           ├── industry-portal-service/
│           ├── notification-service/
│           ├── script-storage-service/
│           ├── programs-service/
│           ├── partner-dashboard-service/
│           └── writer-web/
├── kubernetes/
│   ├── README.md                    # kubectl instructions + local K8s tool setup
│   ├── render.sh                    # helm template → static YAML per environment
│   ├── kind.yaml                    # kind cluster config with port mappings
│   ├── local/
│   │   ├── namespace.yaml           # Hand-authored
│   │   ├── secrets/                 # Hand-authored (gitignored, .secrets.yaml.example provided)
│   │   ├── generated/               # Output of render.sh (gitignored)
│   │   └── kustomization.yaml       # References generated/ + hand-authored
│   ├── staging/
│   │   ├── namespace.yaml
│   │   ├── secrets/
│   │   ├── ingress.yaml
│   │   ├── generated/
│   │   └── kustomization.yaml
│   └── prod/
│       ├── namespace.yaml
│       ├── external-secrets/        # ESO SecretStore + ExternalSecret resources
│       ├── ingress.yaml
│       ├── hpa.yaml
│       ├── generated/
│       └── kustomization.yaml
docs/
├── setup.md                         # Getting Started (new)
├── deployment.md                    # Deployment Guide (new)
└── README.md                        # Updated with links
README.md                            # Updated with Deployment section
```

## Helm Chart Architecture

### Service Tiers

| Tier | Services | K8s Resources |
|------|----------|---------------|
| **Public** | `api-gateway`, `writer-web` | Deployment + Service (ClusterIP) + Ingress |
| **Internal + DB** | `identity`, `profile-project`, `competition-directory`, `feedback-exchange`, `ranking`, `coverage-marketplace`, `industry-portal`, `programs`, `partner-dashboard` | Deployment + Service (ClusterIP) |
| **Internal (in-memory)** | `submission-tracking` | Deployment + Service (ClusterIP), no DB dependency |
| **Internal + Other** | `search-indexer` (OpenSearch), `script-storage` (MinIO), `notification` (Redpanda) | Deployment + Service (ClusterIP) |

### Per-Service Subchart Contents

Each subchart contains:
- `Chart.yaml` — name, version, appVersion
- `values.yaml` — image, port, replicas, resources, env, probes, HPA config
- `templates/deployment.yaml` — pod spec with health probes, env from ConfigMap + Secret
- `templates/service.yaml` — ClusterIP service
- `templates/configmap.yaml` — non-secret environment variables
- `templates/hpa.yaml` — HorizontalPodAutoscaler (disabled by default)
- `templates/serviceaccount.yaml`
- `templates/_helpers.tpl` — naming, labels, selector helpers

### Infrastructure Dependencies by Environment

| Dependency | Local | Staging | Production |
|------------|-------|---------|------------|
| PostgreSQL | Bitnami subchart | Bitnami subchart | External (RDS/CloudSQL) |
| Redis | Bitnami subchart | Bitnami subchart | External (ElastiCache) |
| OpenSearch | Custom subchart (single-node) | Custom subchart | External (AWS OpenSearch) |
| MinIO | Custom subchart | Custom subchart | External (S3/GCS) |
| Redpanda | Custom subchart | Custom subchart | External (MSK/Confluent) |
| Mailpit | Custom subchart (local only) | Disabled (use Resend) | Disabled (use Resend) |

Infrastructure Helm dependencies are declared in `Chart.yaml` using the `dependencies:` field (not vendored). Bitnami charts are pulled from `oci://registry-1.docker.io/bitnamicharts`. Custom infrastructure subcharts (OpenSearch, MinIO, Redpanda, Mailpit) are local subcharts in `charts/`. Run `helm dependency build` to fetch Bitnami deps (CI does this automatically).

### Values Strategy

**`values.yaml` (local):**
- `global.registry: ghcr.io/full-chaos/script-manifest`
- `global.imageTag: latest`
- `global.environment: local`
- All infra subcharts enabled
- Ingress disabled; `api-gateway` and `writer-web` exposed via NodePort (30400, 30300)
- Resources: 256Mi / 0.25 CPU per service
- Mailpit subchart enabled (email testing)
- Secrets: plain K8s Secrets

**`values-staging.yaml`:**
- Infra subcharts enabled
- Ingress enabled with staging domain
- Resources: 512Mi / 0.5 CPU
- 1 replica per service

**`values-prod.yaml`:**
- Infra subcharts disabled
- `externalServices` block with connection strings
- Ingress enabled with prod domain + TLS
- Resources: 512Mi / 0.5 CPU
- HPA for gateway + writer-web (min 2, max 5)
- Secrets via External Secrets Operator

### Health Probes (all services)

- `livenessProbe` → `GET /health/live`
- `readinessProbe` → `GET /health/ready`
- `startupProbe` → `GET /health` with `failureThreshold: 30`, `periodSeconds: 5` (150s budget)

### Secrets Handling

**Secrets Inventory:**

| Secret | Services | Local | Staging | Production |
|--------|----------|-------|---------|------------|
| `DATABASE_URL` | All DB-backed services (9) | K8s Secret | K8s Secret | ExternalSecret (RDS) |
| `POSTGRES_PASSWORD` | PostgreSQL subchart | K8s Secret | K8s Secret | N/A (external) |
| `REDIS_URL` (includes password) | api-gateway | K8s Secret | K8s Secret | ExternalSecret (ElastiCache, `redis://:pass@host:6379`) |
| `STRIPE_SECRET_KEY` | coverage-marketplace | K8s Secret | K8s Secret | ExternalSecret |
| `STRIPE_WEBHOOK_SECRET` | coverage-marketplace | K8s Secret | K8s Secret | ExternalSecret |
| `MINIO_ROOT_PASSWORD` | MinIO subchart, script-storage, coverage-marketplace | K8s Secret | K8s Secret | N/A (use S3 IAM) |
| `STORAGE_S3_ACCESS_KEY` / `STORAGE_S3_SECRET_KEY` | script-storage, coverage-marketplace | K8s Secret | K8s Secret | ExternalSecret (S3 IAM creds) |
| `EMAIL_API_KEY` (Resend) | identity-service | N/A (use Mailpit) | K8s Secret | ExternalSecret |
| `SERVICE_TOKEN_SECRET` | api-gateway, identity-service, notification-service | K8s Secret | K8s Secret | ExternalSecret |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | identity-service | K8s Secret (optional) | K8s Secret | ExternalSecret |

**Non-secret config (ConfigMap):**
- `COMPETITION_ADMIN_ALLOWLIST`, `COVERAGE_ADMIN_ALLOWLIST`, `INDUSTRY_ADMIN_ALLOWLIST` — user ID lists, not cryptographic material
- All `*_SERVICE_URL` inter-service URLs
- `PORT`, `NODE_ENV`, `OPENSEARCH_URL`, `OPENSEARCH_INDEX`, `KAFKA_BROKERS`, etc.

**Local/Staging:** Plain Kubernetes Secrets (base64, gitignored, `.secrets.yaml.example` template provided)

**Production:** External Secrets Operator
```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
spec:
  secretStoreRef:
    name: aws-secrets-manager
  target:
    name: script-manifest-db
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: script-manifest/prod/database-url
```

## Docker Swarm Design

### `deploy/swarm/stack.yml`

- All 15 application services + infrastructure deps (PostgreSQL, Redis, OpenSearch, MinIO, Redpanda)
- Observability: Prometheus + AlertManager included; BugSink excluded (optional dev tooling)
- Traefik as ingress (Swarm has no native ingress)
- Overlay networks: `public` (Traefik-facing), `internal` (encrypted)
- Docker secrets for: `postgres_password`, `redis_password`, `stripe_secret_key`, `stripe_webhook_secret`, `minio_root_password`, `email_api_key`, `storage_s3_secret_key`
- Rolling updates: `update_config: { parallelism: 1, delay: 10s, order: start-first }`
- Resource limits matching compose.prod.yml
- Placement constraints: infra on managers, services on workers

### `deploy/swarm/stack.staging.yml`

- Overlay file: `docker stack deploy -c stack.yml -c stack.staging.yml`
- `:latest` tags, relaxed resources, single replicas

### Usage

```bash
docker swarm init
echo "password" | docker secret create postgres_password -
docker stack deploy -c deploy/swarm/stack.yml script-manifest
```

## Kubernetes Raw Manifests

### Generation

Single source of truth is the Helm chart. `render.sh` runs `helm template` for each environment, outputting into a `generated/` subdirectory to avoid conflicts with hand-authored files:

```bash
for env in local staging prod; do
  rm -rf ./${env}/generated
  helm template script-manifest ../helm/script-manifest \
    -f ../helm/script-manifest/values-${env}.yaml \
    --output-dir ./${env}/generated \
    --namespace script-manifest-${env}
done
```

### Kustomize Support

Each environment includes a `kustomization.yaml` that references both `generated/` (Helm output) and hand-authored resources (namespace, secrets, ingress). Non-Helm users can apply patches in kustomization without editing generated YAML — patches survive re-renders.

### Local K8s Tool Support

README documents setup for Minikube, kind, k3d, and Docker Desktop Kubernetes with:
- Cluster creation commands
- Image loading methods
- Ingress controller setup
- `kind.yaml` config provided for port mapping

## Documentation

### `docs/setup.md` — Getting Started

1. Prerequisites (Node 25, pnpm 10, Docker, git)
2. Quick Start (clone, env, compose up, pnpm install, test)
3. Running Services Natively (pnpm dev)
4. Running via Docker Compose (full stack, individual)
5. Accessing the Stack (URL table: writer.localhost:9100, etc.)
6. Environment Variables (reference to .env.example)
7. Database Setup
8. Running Tests
9. Troubleshooting (empty JSON body, TIMESTAMPTZ, ports, OpenSearch memory)

### `docs/deployment.md` — Deployment Guide

1. Overview (architecture, service map, 4 targets)
2. Building Images (Dockerfiles, CI pipeline)
3. Docker Compose (dev/staging/prod)
4. Docker Swarm (secrets, deploy, update, monitor)
5. Kubernetes with Helm (local/staging/prod, upgrade, rollback)
6. Kubernetes with kubectl (apply, regenerate)
7. External Services — Production (RDS, ElastiCache, OpenSearch, S3, Kafka)
8. Health Checks & Monitoring
9. TLS & Ingress

### `README.md` Updates

Add Deployment section linking to setup.md and deployment.md.

## Service Inventory

All 15 application services with their ports, storage deps, and inter-service deps (derived from compose.yml):

| # | Service | Port | Storage | Depends On |
|---|---------|------|---------|------------|
| 1 | notification-service | 4010 | Redpanda | redpanda |
| 2 | identity-service | 4005 | PostgreSQL | postgres, mailpit(dev) |
| 3 | profile-project-service | 4001 | PostgreSQL | postgres, notification |
| 4 | search-indexer-service | 4003 | OpenSearch | opensearch |
| 5 | competition-directory-service | 4002 | PostgreSQL | postgres, search-indexer, notification |
| 6 | script-storage-service | 4011 | MinIO | minio |
| 7 | submission-tracking-service | 4004 | In-memory | — |
| 8 | feedback-exchange-service | 4006 | PostgreSQL | postgres, notification |
| 9 | ranking-service | 4007 | PostgreSQL | postgres, notification, submission-tracking, competition-directory |
| 10 | coverage-marketplace-service | 4008 | PostgreSQL+MinIO | postgres, notification, minio |
| 11 | industry-portal-service | 4009 | PostgreSQL | postgres, script-storage, notification |
| 12 | programs-service | 4012 | PostgreSQL | postgres, notification |
| 13 | partner-dashboard-service | 4013 | PostgreSQL | postgres, ranking, notification |
| 14 | api-gateway | 4000 | Redis | all services above |
| 15 | writer-web | 3000 | — | api-gateway, script-storage |

**Dockerfile mapping:**
- Services 1–14: `infra/docker/service.Dockerfile` (multi-stage turbo prune, `--build-arg SERVICE_NAME=<name>`)
- Service 15 (writer-web): `infra/docker/frontend.Dockerfile` (Next.js standalone build, `apps/writer-web`)
