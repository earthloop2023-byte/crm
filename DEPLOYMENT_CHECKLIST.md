# Deployment Checklist

## 1) Required Environment Variables
- `NODE_ENV=production`
- `PORT=5001` (or server port)
- `DATABASE_URL=postgres://...`
- `SESSION_SECRET=<strong-random-secret>`

## 2) Recommended Session Variables
- `TRUST_PROXY=1` when behind reverse proxy, otherwise `false`
- `SESSION_COOKIE_SECURE=auto` (or `true` when HTTPS-only)
- `SESSION_COOKIE_SAMESITE=lax`
- `SESSION_COOKIE_DOMAIN=` (set only when needed)
- `SESSION_TIMEOUT_DEFAULT_MINUTES=30`
- `SESSION_PRUNE_INTERVAL_SECONDS=900`

## 3) Backup Before Deploy
- App-level backup API (developer account): `/api/backups`
- DB file backup:
```bash
npm run db:backup:file
```

Optional:
- `DB_BACKUP_DIR=backups/db`
- `DB_BACKUP_RETENTION=30`
- `PG_DUMP_BIN=pg_dump`

## 4) Start Server
```bash
npm run start
```

## 5) Post-Deploy Smoke Check
```bash
npm run smoke:predeploy
```

Optional:
- `SMOKE_BASE_URL=http://127.0.0.1:5001`
- `SMOKE_LOGIN_ID=admin`
- `SMOKE_LOGIN_PASSWORD=...`

## 6) DB Restore (Emergency)
```bash
npm run db:restore:file -- backups/db/<dump-file>.dump --yes
```
