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
)

run_compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
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
  run_compose up -d "${SERVICES[@]}"

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
  (cd "$REPO_ROOT" && pnpm run test:integration)
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
