#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/weekly-json-drive-backup.env}"
CRON_EXPR="${BACKUP_CRON_EXPR:-30 3 * * *}"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="${BACKUP_LOG_FILE:-${APP_DIR}/logs/weekly-json-drive-backup.log}"
MARKER="# CRM_WEEKLY_JSON_DRIVE_BACKUP"
JOB="${CRON_EXPR} ${SCRIPT_DIR}/weekly-json-drive-backup.sh ${ENV_FILE} >> ${LOG_FILE} 2>&1 ${MARKER}"

mkdir -p "$(dirname "${LOG_FILE}")"

TMP_FILE="$(mktemp)"
trap 'rm -f "${TMP_FILE}"' EXIT

crontab -l 2>/dev/null | grep -v "${MARKER}" > "${TMP_FILE}" || true
echo "${JOB}" >> "${TMP_FILE}"
crontab "${TMP_FILE}"

echo "Installed CRM backup cron:"
echo "${JOB}"
