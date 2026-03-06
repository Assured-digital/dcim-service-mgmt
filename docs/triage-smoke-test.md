# Triage Smoke Test

This script validates the critical intake -> triage lifecycle -> conversion flow against a running local stack.

## Preconditions

- `docker compose up -d --build` is running.
- Seed users exist:
  - `admin@dcm.local / Admin123!`
  - `client.viewer.test@dcm.local / Passw0rd!`

## Run

```sh
npm run -w @dcms/api test:triage:smoke
```

Optional env overrides:

```sh
BASE_URL=http://localhost:3001 \
ADMIN_EMAIL=admin@dcm.local \
ADMIN_PASSWORD=Admin123! \
VIEWER_EMAIL=client.viewer.test@dcm.local \
VIEWER_PASSWORD=Passw0rd! \
npm run -w @dcms/api test:triage:smoke
```

## What It Checks

1. Admin and client-viewer login
2. Client-viewer can create request intake
3. Triage role can mark item `UNDER_REVIEW`
4. Triage role can convert item to `SERVICE_REQUEST`

