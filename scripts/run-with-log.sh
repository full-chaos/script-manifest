#!/usr/bin/env bash
set -euo pipefail

service_name="${1:?service name is required}"
shift

log_dir="${LOG_DIR:-/workspace/.logs}"
log_file="${log_dir}/${service_name}.log"

mkdir -p "${log_dir}"
: > "${log_file}"

"$@" 2>&1 | tee -a "${log_file}"
