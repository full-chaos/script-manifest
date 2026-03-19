# Deployment Guide

Script Manifest ships deployment assets in three places:

- `compose.yml` for local development and service-by-service work
- `compose.prod.yml` for production-like image-based runs
- `deploy/` for Swarm and Helm deployment templates

The Swarm stack and Helm chart scaffold are already present in the repo. This guide documents the implemented surfaces and the environment they expect.

## Local Deployment

Use the local stack when you want hot-reload, local infrastructure, and the seeded development defaults:

```bash
docker compose -f compose.yml up -d
```

This stack includes:

- PostgreSQL
- Redis
- OpenSearch
- MinIO
- Redpanda
- Mailpit
- Traefik
- SigNoz components

Common local URLs:

- Writer web: `http://localhost:3000`
- API gateway: `http://localhost:4000`
- Identity service: `http://localhost:4005`
- OpenSearch: `http://localhost:9200`
- MinIO console: `http://localhost:9001`
- Mailpit UI: `http://localhost:8025`
- Redpanda console: `http://localhost:8080`

## Production-Like Deployment

Use the production Compose file when you want image-based deployment with Traefik TLS, published service images from GHCR, and production-style environment wiring:

```bash
docker compose -f compose.prod.yml up -d
```

The production stack expects these classes of values:

- Image selection:
  - `IMAGE_TAG`
- Core database and cache secrets:
  - `POSTGRES_PASSWORD`
  - `REDIS_PASSWORD`
- Storage and object-service secrets:
  - `MINIO_ROOT_PASSWORD`
  - `STORAGE_PUBLIC_BASE_URL`
  - `STORAGE_UPLOAD_BASE_URL`
  - `STORAGE_S3_SECRET_KEY` only if you are wiring script-storage to a separate S3 secret source outside `compose.prod.yml`
- Auth and identity configuration:
  - `MFA_ENCRYPTION_KEY`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
  - `IDENTITY_SERVICE_PUBLIC_URL`
- Web and gateway routing:
  - `API_DOMAIN`
  - `WEB_DOMAIN`
  - `CORS_ALLOWED_ORIGINS`
- TLS and Traefik:
  - `ACME_EMAIL`
  - `HTTPS_PORT`
  - `HTTP_PORT`
- Payment and reporting:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `BUGSINK_SECRET_KEY`

For Google sign-in, the browser redirect URL must match the Google OAuth client configuration:

- `https://scripts.example.com/signin`

If `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are blank, the identity service falls back to the local mock OAuth flow.

## Swarm Deployment Assets

The Swarm implementation lives under [deploy/swarm](../deploy/swarm) and is indexed from [deploy/README.md](../deploy/README.md).

Files present:

- [deploy/swarm/stack.yml](../deploy/swarm/stack.yml)
- [deploy/swarm/stack.staging.yml](../deploy/swarm/stack.staging.yml)

What it provides:

- Production-like Swarm stack configuration
- Staging overlay for the same stack
- Manager and worker placement constraints
- Traefik ingress
- PostgreSQL, Redis, OpenSearch, MinIO, Redpanda, Prometheus, and Alertmanager

Usage:

```bash
docker swarm init
docker stack deploy -c deploy/swarm/stack.yml script-manifest
docker stack deploy -c deploy/swarm/stack.yml -c deploy/swarm/stack.staging.yml script-manifest
```

The stack expects a `.env` file on the manager node with the required secrets.

## Helm Deployment Assets

The Helm implementation lives under [deploy/helm/script-manifest](../deploy/helm/script-manifest) and is indexed from [deploy/README.md](../deploy/README.md).

Files present:

- [deploy/helm/script-manifest/Chart.yaml](../deploy/helm/script-manifest/Chart.yaml)
- [deploy/helm/script-manifest/values.yaml](../deploy/helm/script-manifest/values.yaml)
- [deploy/helm/script-manifest/templates/_helpers.tpl](../deploy/helm/script-manifest/templates/_helpers.tpl)
- [deploy/helm/script-manifest/templates/namespace.yaml](../deploy/helm/script-manifest/templates/namespace.yaml)
- [deploy/helm/script-manifest/templates/NOTES.txt](../deploy/helm/script-manifest/templates/NOTES.txt)
- [deploy/helm/script-manifest/.helmignore](../deploy/helm/script-manifest/.helmignore)
- [deploy/helm/script-manifest/charts/notification-service](../deploy/helm/script-manifest/charts/notification-service)

What it provides:

- An umbrella chart named `script-manifest`
- Local defaults for registry, image tag, and environment
- Optional PostgreSQL and Redis Bitnami dependencies
- A first service subchart for `notification-service`
- Namespace creation and release notes

Usage:

```bash
helm lint deploy/helm/script-manifest
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml
helm install sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml -n script-manifest-local --create-namespace
```

## Recommended Deployment Checks

1. Validate the rendered Compose config before starting:

   ```bash
   docker compose -f compose.prod.yml config
   ```

2. Start the stack and verify health endpoints:

   - `/health`
   - `/health/live`
   - `/health/ready`

3. Confirm the public router domains resolve correctly:

   - `API_DOMAIN`
   - `WEB_DOMAIN`

4. Confirm external URLs match the public deployment surface:

   - `IDENTITY_SERVICE_PUBLIC_URL`
   - `FRONTEND_URL`
   - `STORAGE_PUBLIC_BASE_URL`

## Operational Notes

- The production Compose file uses GHCR images for all application services.
- The gateway and writer web run behind Traefik with HTTPS termination.
- The identity service uses the request `redirectUri` or `GOOGLE_REDIRECT_URI` as the Google browser return URL.
- The writer web talks to the gateway through `API_GATEWAY_URL`.
- Storage uploads must use a browser-reachable URL, not the internal MinIO endpoint.
- In `compose.prod.yml`, the script-storage service reads its S3 secret from `MINIO_ROOT_PASSWORD`; the separate `STORAGE_S3_SECRET_KEY` env name is mainly for other deployment targets.

## Operational Runbooks

### Promote a User to Platform Admin

User roles are stored in `app_users.role`. Valid values: `writer` (default), `admin`.

#### Using the CLI (preferred)

The `manage-admin` script connects directly to PostgreSQL via `DATABASE_URL` and supports `promote`, `demote`, and `list` commands.

**Local development** (uses tsx, requires a checkout):

```bash
pnpm manage-admin promote user@example.com
pnpm manage-admin demote user@example.com
pnpm manage-admin list
```

**Inside a running container** (bundled as `scripts/manage-admin.cjs` in all service images):

```bash
# Docker Compose
docker exec -it <identity-service-container> node scripts/manage-admin.cjs promote user@example.com

# Docker Swarm
docker exec -it $(docker ps -q -f name=script-manifest_identity-service) \
  node scripts/manage-admin.cjs promote user@example.com

# Kubernetes
kubectl exec -it deploy/identity-service -n script-manifest -- \
  node scripts/manage-admin.cjs promote user@example.com
```

The script reads `DATABASE_URL` from the environment. Inside containers, this is already set. From a local checkout targeting a remote database:

```bash
DATABASE_URL="postgresql://manifest:<password>@<host>:5432/manifest" pnpm manage-admin promote user@example.com
```

#### Via Admin API (requires an existing admin)

Once at least one admin exists, subsequent promotions can use the API:

```bash
curl -X PATCH https://<api-domain>/api/v1/admin/users/<user-id> \
  -H "Authorization: Bearer <admin-session-token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

Role changes are recorded in the `admin_audit_log` table.

#### Direct database access (fallback)

If the CLI is unavailable (e.g., no local checkout on the server), connect to PostgreSQL directly:

**Docker Compose (local):**

```bash
docker exec -it manifest-postgres psql -U manifest -d manifest -c \
  "UPDATE app_users SET role = 'admin' WHERE email = 'user@example.com';"
```

**Docker Swarm:**

```bash
docker exec -it $(docker ps -q -f name=script-manifest_postgres) \
  psql -U manifest -d manifest -c \
  "UPDATE app_users SET role = 'admin' WHERE email = 'user@example.com';"
```

**Kubernetes (Helm):**

```bash
kubectl exec -it deploy/postgresql -n script-manifest -- \
  psql -U manifest -d manifest -c \
  "UPDATE app_users SET role = 'admin' WHERE email = 'user@example.com';"
```
