# Triage Smoke Test

This script validates the critical intake -> triage lifecycle -> conversion flow against a running local stack.

## Preconditions

- `docker compose up -d --build` is running.
- Seed users exist (created by `apps/api/prisma/seed.ts`):
  - `admin@dcm.local / Admin123!` — seeded as `ORG_OWNER` (org-super; not `ADMIN`)
  - `viewer@dcm.local / Admin123!` — `CLIENT_VIEWER`

> Note: the script's built-in `VIEWER_EMAIL`/`VIEWER_PASSWORD` defaults
> (`client.viewer.test@dcm.local` / `Passw0rd!`) are **not** seeded, so pass the viewer overrides
> below (or run against a stack where that account has been created).

## Run

```sh
npm run -w @dcms/api test:triage:smoke
```

Optional env overrides:

```sh
BASE_URL=http://localhost:3001 \
ADMIN_EMAIL=admin@dcm.local \
ADMIN_PASSWORD=Admin123! \
VIEWER_EMAIL=viewer@dcm.local \
VIEWER_PASSWORD=Admin123! \
npm run -w @dcms/api test:triage:smoke
```

## What It Checks

1. Admin and client-viewer login
2. Client-viewer can create request intake
3. Triage role can mark item `UNDER_REVIEW`
4. Triage role can convert item to `SERVICE_REQUEST`

