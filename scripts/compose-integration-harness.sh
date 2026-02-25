#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/compose.yml}"

SERVICES=(
  postgres
  redis
  opensearch
  minio
  notification-service
  identity-service
  profile-project-service
  search-indexer-service
  competition-directory-service
  submission-tracking-service
  feedback-exchange-service
  ranking-service
  coverage-marketplace-service
  programs-service
  partner-dashboard-service
  industry-portal-service
  script-storage-service
  api-gateway
)

HEALTH_ENDPOINTS=(
  "http://localhost:4000/health/live"
  "http://localhost:4001/health"
  "http://localhost:4002/health"
  "http://localhost:4003/health"
  "http://localhost:4004/health"
  "http://localhost:4005/health"
  "http://localhost:4006/health"
  "http://localhost:4007/health"
  "http://localhost:4008/health"
  "http://localhost:4009/health"
  "http://localhost:4010/health"
  "http://localhost:4011/health"
  "http://localhost:4012/health"
  "http://localhost:4013/health"
)

run_compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

build_node_dev_image() {
  echo "Building shared node dev image..."
  docker build \
    -f "$REPO_ROOT/infra/docker/node-dev.Dockerfile" \
    -t script-manifest-node-dev:local \
    "$REPO_ROOT"
}

pick_available_port() {
  local candidate="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    echo "$candidate"
    return 0
  fi

  while lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; do
    candidate=$((candidate + 1))
  done
  echo "$candidate"
}

wait_for_service_health() {
  local service="$1"
  local timeout_secs="${2:-420}"
  local started_at
  started_at="$(date +%s)"

  while true; do
    local container_id
    container_id="$(run_compose ps -q "$service")"
    if [[ -n "$container_id" ]]; then
      local status
      status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      if [[ "$status" == "healthy" || "$status" == "running" ]]; then
        return 0
      fi
      if [[ "$status" == "exited" || "$status" == "dead" ]]; then
        echo "Service '$service' is in unexpected state '$status'."
        run_compose logs "$service" || true
        return 1
      fi
    fi

    local now
    now="$(date +%s)"
    if (( now - started_at > timeout_secs )); then
      echo "Timed out waiting for service '$service' to become healthy."
      run_compose ps || true
      run_compose logs "$service" || true
      return 1
    fi
    sleep 2
  done
}

wait_for_http() {
  local url="$1"
  local timeout_secs="${2:-180}"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      return 0
    fi
    local now
    now="$(date +%s)"
    if (( now - started_at > timeout_secs )); then
      echo "Timed out waiting for endpoint '$url'."
      return 1
    fi
    sleep 2
  done
}

up() {
  echo "Starting compose integration stack..."
  if [[ -z "${POSTGRES_PORT:-}" ]]; then
    POSTGRES_PORT="$(pick_available_port 55432)"
  fi
  if [[ -z "${REDIS_PORT:-}" ]]; then
    REDIS_PORT="$(pick_available_port 56379)"
  fi
  if [[ -z "${MINIO_PORT:-}" ]]; then
    MINIO_PORT="$(pick_available_port 59000)"
  fi
  if [[ -z "${MINIO_CONSOLE_PORT:-}" ]]; then
    MINIO_CONSOLE_PORT="$(pick_available_port 59001)"
  fi
  if [[ -z "${OPENSEARCH_HTTP_PORT:-}" ]]; then
    OPENSEARCH_HTTP_PORT="$(pick_available_port 59200)"
  fi
  if [[ -z "${OPENSEARCH_PERF_PORT:-}" ]]; then
    OPENSEARCH_PERF_PORT="$(pick_available_port 59600)"
  fi
  export POSTGRES_PORT REDIS_PORT MINIO_PORT MINIO_CONSOLE_PORT OPENSEARCH_HTTP_PORT OPENSEARCH_PERF_PORT
  build_node_dev_image
  run_compose up -d --no-build "${SERVICES[@]}"

  for service in "${SERVICES[@]}"; do
    wait_for_service_health "$service"
  done

  for endpoint in "${HEALTH_ENDPOINTS[@]}"; do
    wait_for_http "$endpoint"
  done

  echo "Compose integration stack is healthy."
}

down() {
  echo "Stopping compose integration stack..."
  run_compose down -v --remove-orphans
}

reset() {
  down || true
  up
}

test_stack() {
  trap 'down' EXIT
  reset
  (
    cd "$REPO_ROOT" && \
      INTEGRATION_DATABASE_URL="postgresql://manifest:manifest@localhost:${POSTGRES_PORT}/manifest" \
      INTEGRATION_MINIO_PORT="${MINIO_PORT}" \
      pnpm run test:integration
  )
}

case "${1:-}" in
  up)
    up
    ;;
  down)
    down
    ;;
  reset)
    reset
    ;;
  test)
    test_stack
    ;;
  *)
    echo "Usage: $0 {up|down|reset|test}"
    exit 1
    ;;
esac
