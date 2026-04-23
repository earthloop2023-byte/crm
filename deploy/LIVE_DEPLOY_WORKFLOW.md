# Live Deploy Workflow

This project now uses a guarded live deployment flow to prevent two workers from silently overwriting each other.

## Required steps

1. Sync the current live release metadata:

```powershell
.\deploy\live-sync-release.ps1
```

2. Make changes and verify locally.

3. Deploy only through the guarded script:

```powershell
.\deploy\live-deploy.ps1 -Notes "short summary"
```

## How the guard works

- The server stores the current live release in `/opt/crm/site1/deploy/current-release.json`.
- Each local workspace stores the last synced live release in `deploy/.state/live-release-base.json`.
- The guarded deploy script compares:
  - local `baseReleaseId`
  - remote `current releaseId`
- If they do not match, deployment is rejected.
- The server also uses a deploy lock so two deploys cannot run at the same time.

## Conflict case

If worker A deploys first, worker B's next deployment will fail until worker B:

1. syncs the current live release again,
2. merges the latest work,
3. rebuilds,
4. redeploys.

## Important rule

Do not replace `/opt/crm/site1/dist` manually anymore.
Always use the guarded deploy flow.
