# Deployment Assets

This directory contains the implementation assets for non-Compose deployment paths.

## Swarm

Files:

- [`swarm/stack.yml`](swarm/stack.yml)
- [`swarm/stack.staging.yml`](swarm/stack.staging.yml)

Use these with Docker Swarm:

```bash
docker swarm init
docker stack deploy -c deploy/swarm/stack.yml script-manifest
docker stack deploy -c deploy/swarm/stack.yml -c deploy/swarm/stack.staging.yml script-manifest
```

## Helm

Files:

- [`helm/script-manifest/Chart.yaml`](helm/script-manifest/Chart.yaml)
- [`helm/script-manifest/values.yaml`](helm/script-manifest/values.yaml)
- [`helm/script-manifest/templates/_helpers.tpl`](helm/script-manifest/templates/_helpers.tpl)
- [`helm/script-manifest/templates/namespace.yaml`](helm/script-manifest/templates/namespace.yaml)
- [`helm/script-manifest/templates/NOTES.txt`](helm/script-manifest/templates/NOTES.txt)
- [`helm/script-manifest/.helmignore`](helm/script-manifest/.helmignore)
- [`helm/script-manifest/charts/notification-service`](helm/script-manifest/charts/notification-service)

Use these with Helm:

```bash
helm lint deploy/helm/script-manifest
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml
helm install sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml -n script-manifest-local --create-namespace
```

## Notes

- The Swarm stack and Helm chart are present today.
- The Helm chart currently includes an umbrella chart plus a `notification-service` subchart scaffold.
- If you add more deployment surfaces later, document them here first and link out from `README.md` and `docs/deployment.md`.
