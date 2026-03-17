# Deployment Guide

Script Manifest currently ships two Compose-based deployment modes:

- `compose.yml` for local development and service-by-service work
- `compose.prod.yml` for production-like image-based runs

The approved deployment design also describes future Docker Swarm and Kubernetes targets. Those configuration directories are not present yet, so this guide focuses on the deployment surfaces that exist in the repository today and calls out the intended production wiring where it matters.

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

For Google sign-in, the callback URL must match the public identity-service URL:

- `https://<your-public-identity-service-host>/internal/auth/oauth/google/callback`

If `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are blank, the identity service falls back to the local mock OAuth flow.

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
- The identity service builds OAuth callback URLs from `IDENTITY_SERVICE_PUBLIC_URL`.
- The writer web talks to the gateway through `API_GATEWAY_URL`.
- Storage uploads must use a browser-reachable URL, not the internal MinIO endpoint.
- In `compose.prod.yml`, the script-storage service reads its S3 secret from `MINIO_ROOT_PASSWORD`; the separate `STORAGE_S3_SECRET_KEY` env name is mainly for other deployment targets.

## Future Targets

The approved deployment design calls for:

- Docker Swarm
- Kubernetes with Helm
- Kubernetes with generated raw manifests

Those targets are documented in [the deployment design spec](superpowers/specs/2026-03-11-deployment-documentation-design.md) and can be implemented later without changing the current Compose guidance above.
