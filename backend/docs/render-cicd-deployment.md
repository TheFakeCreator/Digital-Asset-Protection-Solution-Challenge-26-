# Render Backend Deployment And CI/CD Runbook

This runbook is tailored to this repository structure and scripts.

## 1) What is already prepared in repo

- Render blueprint: `render.yaml`
- CI pipeline: `.github/workflows/ci.yml`
- Backend CD trigger pipeline: `.github/workflows/cd-render-backend.yml`
- Production Docker backend image: `backend/Dockerfile`
- Docker context exclusions: `backend/.dockerignore`

## 2) Manual setup you must do once

### A. Create managed services

1. MongoDB Atlas cluster
2. Redis service (Upstash/Redis Cloud) if you want distributed cache

Collect:

- `MONGODB_URI`
- `REDIS_URL`

### B. Create Render backend service

1. Open Render dashboard.
2. New -> Blueprint.
3. Select this GitHub repo and branch `main`.
4. Render will detect `render.yaml`.
5. Fill all `sync: false` environment variables in Render UI.

Required minimum:

- `MONGODB_URI`
- `CORS_ORIGIN` (frontend deployed URL)

Recommended:

- `REDIS_URL`
- crawler API keys (`X_BEARER_TOKEN`, `YOUTUBE_API_KEY`, etc.)

### C. Configure GitHub secrets for CD

1. In Render backend service, create a Deploy Hook.
2. Copy the hook URL.
3. In GitHub -> Settings -> Secrets and variables -> Actions, add:
   - `RENDER_BACKEND_DEPLOY_HOOK_URL` = `<render deploy hook url>`

## 3) Deploy flow after setup

1. Merge PR to `main`.
2. GitHub Actions CI runs (`.github/workflows/ci.yml`).
3. GitHub Actions CD triggers Render deploy hook (`.github/workflows/cd-render-backend.yml`).
4. Render pulls latest `main` and deploys backend.

## 4) Validation checklist

After deployment, verify:

1. Backend root:
   - `GET /` returns success payload.
2. Health endpoint:
   - `GET /api/v1/health` returns `status=ok`.
3. Frontend can call backend API.
4. Hash Lab preview compare endpoint works.

## 5) Rollback

1. Render dashboard -> backend service -> Events -> previous successful deploy.
2. Roll back to prior deploy.
3. If needed, revert offending commit in GitHub and re-deploy.
