#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/weekly-json-drive-backup.env}"

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Backup env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE is required}"

export DB_BACKUP_JSON_DIR="${DB_BACKUP_JSON_DIR:-${APP_DIR}/backups/json}"
export DB_BACKUP_JSON_RETENTION="${DB_BACKUP_JSON_RETENTION:-12}"
export RCLONE_REMOTE_PATH="${RCLONE_REMOTE_PATH:-crm-backups/json-weekly}"
export RCLONE_BIN="${RCLONE_BIN:-rclone}"

mkdir -p "${APP_DIR}/backups/json" "${APP_DIR}/logs"

cd "${APP_DIR}"
npm run db:backup:json
