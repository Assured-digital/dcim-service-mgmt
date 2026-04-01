# DC Service Management (DCMS) – MVP Monorepo

A Docker-first MVP for a **single platform with multi-client segregation** (tenant-by-client), providing:
- React (Vite + TypeScript + MUI) web app
- NestJS (TypeScript) API
- PostgreSQL (RDS-ready)
- S3-compatible object storage abstraction (dev uses MinIO). Azure Blob support is **configurable via env** (provider abstraction included; implement wiring in Phase 2 if required).

This repo implements the foundations:
- Email/password auth (JWT access + refresh)
- RBAC roles (Admin, ServiceManager, ServiceDeskAnalyst, Engineer, ClientViewer (future), PublicUser)
- Client (tenant) segregation enforced in API services (records scoped by `clientId`)
- Core entities: Client, User, PublicSubmission, ServiceRequest, Asset, Survey, SurveyItem, AuditEvent, DocumentReference
- Validation rules (first tranche):
  - Service Request cannot be **closed** without a **closure summary**
  - Asset owner rules (if `ownerType=CLIENT` then `clientId` is required)
  - Survey cannot be marked **completed** unless all items have a response

> UI is intentionally minimal but matches your PoC direction: left navigation, dashboard cards, and list views for Service Requests / Assets / Surveys.

---

## Quick start (local)

### 1) Prereqs
- Docker + Docker Compose
- Node 20+ (optional if you want to run outside containers)

### 2) Run everything
```bash
docker compose up --build
```

This will start:
- Postgres on `localhost:5432`
- MinIO on `localhost:9000` (console `localhost:9001`)
- API on `http://localhost:3001`
- Web on `http://localhost:5173`

### 3) Default admin user
Seed creates:
- Email: `admin@dcm.local`
- Password: `Admin123!`

### Other users
Role: `Engineer`
- Email: `engineer@dcm.local`
- Password: `Admin123!`

Role: `Client Viewer`
- Email: `viewer@dcm.local`
- Password: `Admin123!`

Role: `Service Desk Analyst`
- Email: `analyst@dcm.local`
- Password: `Admin123!`

Role: `Service Desk Manager`
- Email: `manager@dcm.local`
- Password: `Admin123!`
  
---

## Environment configuration

### API (`apps/api/.env`)
- `DATABASE_URL` – postgres connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `STORAGE_PROVIDER` – `s3` (default) or `azure`
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE`

> For Azure, set `STORAGE_PROVIDER=azure` and provide:
- `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `AZURE_STORAGE_CONNECTION_STRING` (or managed identity in later phase)

---

## Structure
- `apps/api` – NestJS API
- `apps/web` – React app
- `packages/shared` – shared types & utilities

---

## Next build steps (agreed scope)
1. Finish module screens + detail pages (SR detail with comments + lifecycle; assets detail; surveys execution)
2. Add assignment, triage workflow, and incident/task modules
3. Add SharePoint document references UI (metadata + links)
4. Harden tenancy enforcement using Prisma middleware / row-level patterns
5. Optional SSO: OIDC (Azure AD) via Passport strategy (provisioned but not enabled by default)

