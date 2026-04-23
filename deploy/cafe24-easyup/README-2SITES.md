# Cafe24 EasyUp - 2 Sites / 2 DB Deployment

Goal:
- One server
- Two websites (`site1`, `site2`)
- Two independent databases and DB users
- Two systemd services and one nginx reverse proxy

## 1) Create two PostgreSQL DB/users
Use strong passwords.

```sql
CREATE USER crm_site1 WITH PASSWORD 'REPLACE_SITE1_DB_PASSWORD';
CREATE USER crm_site2 WITH PASSWORD 'REPLACE_SITE2_DB_PASSWORD';

CREATE DATABASE crmdb_site1 OWNER crm_site1;
CREATE DATABASE crmdb_site2 OWNER crm_site2;

GRANT ALL PRIVILEGES ON DATABASE crmdb_site1 TO crm_site1;
GRANT ALL PRIVILEGES ON DATABASE crmdb_site2 TO crm_site2;
```

## 2) Directory layout
```bash
/opt/crm/site1
/opt/crm/site2
```

Each directory should include:
- `dist/`
- `package.json`
- `package-lock.json`
- `scripts/`

Install dependencies in each site:
```bash
cd /opt/crm/site1 && npm ci --omit=dev
cd /opt/crm/site2 && npm ci --omit=dev
```

## 3) Environment files
Create:
- `/opt/crm/site1/.env.production` from `.env.site1.example`
- `/opt/crm/site2/.env.production` from `.env.site2.example`

Key difference:
- `PORT`: `5001` / `5002`
- `DATABASE_URL`: site1 DB / site2 DB
- `SESSION_SECRET`: different values

## 4) systemd services
Copy files:
- `crm-site1.service` -> `/etc/systemd/system/crm-site1.service`
- `crm-site2.service` -> `/etc/systemd/system/crm-site2.service`

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable crm-site1 crm-site2
sudo systemctl restart crm-site1 crm-site2
sudo systemctl status crm-site1 --no-pager
sudo systemctl status crm-site2 --no-pager
```

## 5) Nginx vhost for 2 domains
Copy `nginx.2sites.conf` to `/etc/nginx/sites-available/crm-2sites`
and set:
- `site1.your-domain.com`
- `site2.your-domain.com`

Enable and reload:
```bash
sudo ln -s /etc/nginx/sites-available/crm-2sites /etc/nginx/sites-enabled/crm-2sites
sudo nginx -t
sudo systemctl restart nginx
```

## 6) Smoke checks
```bash
cd /opt/crm/site1 && npm run smoke:predeploy
cd /opt/crm/site2 && npm run smoke:predeploy
curl -fsS http://127.0.0.1:5001/api/healthz
curl -fsS http://127.0.0.1:5002/api/healthz
```

## 7) Backup (per site, per DB)
Site1:
```bash
cd /opt/crm/site1
export $(cat .env.production | xargs)
npm run db:backup:file
```

Site2:
```bash
cd /opt/crm/site2
export $(cat .env.production | xargs)
npm run db:backup:file
```

Recommended cron: run separate schedules and separate backup dirs.
