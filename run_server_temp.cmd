@echo off
set NODE_ENV=production
set DATABASE_URL=postgres://crm:crm@127.0.0.1:5433/crmdb
set SESSION_SECRET=crm-dev-session-secret
cd /d d:\CodexProjects\crm-taesoo2
node dist/index.js
