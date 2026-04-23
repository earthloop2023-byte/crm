# Cafe24 EasyUp Deployment Guide

This guide assumes:
- You are deploying on EasyUp server hosting.
- EasyUp default OS is Rocky Linux 9 (root access).
- You will run this app from `dist/index.js` directly.
- `npm run build` is not required on server for now.

## 1) Server packages
Rocky/RHEL/Alma (recommended for EasyUp):
```bash
sudo dnf install -y nginx postgresql
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
sudo dnf install -y nodejs
```

Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install -y nginx postgresql-client
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## 2) App directory and user
```bash
sudo mkdir -p /opt/crm
sudo useradd --system --home /opt/crm --shell /usr/sbin/nologin crm || true
sudo chown -R crm:crm /opt/crm
```

## 3) Upload release files
Upload these from local project root (`source/restored_project`) into `/opt/crm`:
- `dist/`
- `package.json`
- `package-lock.json`
- `scripts/`

Example from local shell:
```bash
tar -czf crm-release.tgz dist package.json package-lock.json scripts
scp crm-release.tgz root@YOUR_SERVER_IP:/opt/crm/
```

Then on server:
```bash
cd /opt/crm
sudo tar -xzf crm-release.tgz
sudo npm ci --omit=dev
sudo chown -R crm:crm /opt/crm
```

## 4) Environment file
Create `/opt/crm/.env.production` from:
- `deploy/cafe24-easyup/.env.production.example`

## 5) systemd service
Copy `deploy/cafe24-easyup/crm.service` to:
- `/etc/systemd/system/crm.service`

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable crm
sudo systemctl restart crm
sudo systemctl status crm --no-pager
```

## 6) Nginx reverse proxy
Copy `deploy/cafe24-easyup/nginx.crm.conf` to:
- `/etc/nginx/sites-available/crm`

Then:
```bash
sudo ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
sudo nginx -t
sudo systemctl restart nginx
```

## 7) Post-deploy checks
```bash
cd /opt/crm
npm run smoke:predeploy
curl -fsS http://127.0.0.1:5001/api/healthz
curl -fsS http://127.0.0.1:5001/api/readyz
```

## 8) DB backup cron
Install `pg_dump` first (postgresql-client package).

Example cron (03:10 every day):
```bash
10 3 * * * cd /opt/crm && /usr/bin/env $(cat /opt/crm/.env.production | xargs) /usr/bin/node scripts/db-backup.mjs >> /var/log/crm-db-backup.log 2>&1
```

If `pg_dump` is not in PATH, set:
- `PG_DUMP_BIN=/full/path/to/pg_dump`

## 9) Update deployment
```bash
cd /opt/crm
sudo tar -xzf crm-release.tgz
sudo npm ci --omit=dev
sudo systemctl restart crm
npm run smoke:predeploy
```

## Notes
- Keep `SESSION_SECRET` as a strong random value in production.
- This project currently deploys from prebuilt `dist/` runtime.
- App-level backups are also available via `/api/backups` (developer role).
