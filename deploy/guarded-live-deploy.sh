#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: guarded-live-deploy.sh <release-id> <base-release-id> <archive-path> <deployed-by> [notes]" >&2
  exit 64
fi

RELEASE_ID="$1"
BASE_RELEASE_ID="$2"
ARCHIVE_PATH="$3"
DEPLOYED_BY="$4"
NOTES="${5:-}"

APP_DIR="${APP_DIR:-/opt/crm/site1}"
DEPLOY_DIR="$APP_DIR/deploy"
BACKUP_DIR="$APP_DIR/backups/releases"
CURRENT_RELEASE_FILE="$DEPLOY_DIR/current-release.json"
LOCK_DIR="$DEPLOY_DIR/.deploy-lock"
PREV_DIR="$APP_DIR/dist.prev-$RELEASE_ID"
BACKUP_FILE="$BACKUP_DIR/dist-before-$RELEASE_ID.tgz"
RELEASE_FILE="$BACKUP_DIR/dist-$RELEASE_ID.tgz"

mkdir -p "$DEPLOY_DIR" "$BACKUP_DIR"

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Deploy is already in progress. Try again after the current deployment finishes." >&2
  exit 70
fi
trap cleanup EXIT

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Archive not found: $ARCHIVE_PATH" >&2
  exit 66
fi

CURRENT_RELEASE_ID="$(node -e 'const fs=require("fs"); const p=process.argv[1]; if (fs.existsSync(p)) { const data=JSON.parse(fs.readFileSync(p,"utf8")); process.stdout.write(String(data.releaseId||"")); }' "$CURRENT_RELEASE_FILE")"

if [[ -n "$CURRENT_RELEASE_ID" && "$BASE_RELEASE_ID" != "$CURRENT_RELEASE_ID" ]]; then
  echo "Base release mismatch. current=$CURRENT_RELEASE_ID base=$BASE_RELEASE_ID" >&2
  exit 42
fi

rm -rf "$PREV_DIR"
if [[ -d "$APP_DIR/dist" ]]; then
  sudo chown -R "$USER":"$USER" "$APP_DIR/dist" 2>/dev/null || true
  sudo chmod -R u+rwX "$APP_DIR/dist" 2>/dev/null || true
  cp -a "$APP_DIR/dist" "$PREV_DIR"
  tar -czf "$BACKUP_FILE" -C "$APP_DIR" dist
fi

cp "$ARCHIVE_PATH" "$RELEASE_FILE"
sudo rm -rf "$APP_DIR/dist"
mkdir -p "$APP_DIR/dist"
tar -xzf "$ARCHIVE_PATH" -C "$APP_DIR"

sudo systemctl restart crm-site1.service
sudo systemctl is-active --quiet crm-site1.service

ARCHIVE_SHA256="$(sha256sum "$RELEASE_FILE" | awk '{print $1}')"
APPLIED_AT_KST="$(TZ=Asia/Seoul date '+%Y-%m-%dT%H:%M:%S%z')"

node - <<'NODE' "$CURRENT_RELEASE_FILE" "$RELEASE_ID" "$BASE_RELEASE_ID" "$RELEASE_FILE" "$BACKUP_FILE" "$PREV_DIR" "$DEPLOYED_BY" "$NOTES" "$ARCHIVE_SHA256" "$APPLIED_AT_KST"
const fs = require("fs");
const [
  currentReleaseFile,
  releaseId,
  baseReleaseId,
  releaseFile,
  backupFile,
  prevDir,
  deployedBy,
  notes,
  archiveSha256,
  appliedAtKst,
] = process.argv.slice(2);

const payload = {
  releaseId,
  baseReleaseId,
  releaseFile,
  backupFile,
  prevDir,
  deployedBy,
  notes,
  archiveSha256,
  appliedAtKst,
};

fs.writeFileSync(currentReleaseFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
NODE

cat "$CURRENT_RELEASE_FILE"
