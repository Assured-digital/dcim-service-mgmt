# Release Readiness Checklist

Date: 2026-03-05 (reconciled 2026-06-02)

## Security
- [x] Set strong `JWT_SECRET` and `JWT_REFRESH_SECRET` in production. — set as prod secrets during env build
- [x] Configure strict `CORS_ORIGINS` to production web domains only. — set to prod web URL + app.assured-digital.com
- [x] Run API behind TLS; ensure secure cookies in production. — Container Apps TLS + custom domain managed cert
- [ ] Rotate default seeded credentials before first production deployment. — bootstrap admin password retired ✓; **PROD DB PASSWORD STILL UNROTATED** (exposed on screen + in deleted verify YAML) — OUTSTANDING
- [x] Enforce strong password policy for user creation/admin operations. — bcrypt cost 10; min-8 enforced in DTO + form
- [x] Ensure DB backups and at-rest encryption are enabled. — backups verified 2026-06-02 (7d retention); Azure Postgres encrypts at rest by default
- [~] Configure object storage credentials via secret manager (not plain env files in CI logs). — storage conn string is a Container App secret; full Key Vault is post-pilot
- [ ] Validate that error responses do not leak stack traces/secrets. — NOT explicitly verified — OUTSTANDING (worth a quick check)

## Operational Runbook
- [ ] Define on-call ownership for API, DB, object storage, and web frontend. — solo dev; formalise if team grows
- [ ] Add service health probes and dashboards. — OUTSTANDING (#76 — health probes + down-alert)
- [ ] Define alert thresholds (5xx rate, auth failures, refresh failures, storage errors). — OUTSTANDING (#76)
- [~] Document incident response steps for auth/DB outage, data-corruption recovery. — DB restore procedure now documented (see Data section); broader incident runbook OUTSTANDING
- [ ] Define log retention, PII handling, and access controls. — OUTSTANDING (post-pilot)

## Data + Migration Safety
- [x] Use Prisma migrations with reviewed SQL; no schema drift in production. — additive-only discipline; migrations run via gated pipeline
- [x] Validate migration rollback or restore procedure in staging. — restore verified 2026-06-02 (see below)
- [x] Confirm seed scripts are disabled or gated for production. — seed.ts guards on APP_ENV=production; bootstrap idempotent

### DB Backups & Restore (verified 2026-06-02)
- Retention: 7 days, point-in-time. Geo-redundancy: Disabled (local-region only — post-pilot consideration).
- Restore method: `az postgres flexible-server restore` → new server (never modifies live). Verified: provisions, reachable, serves Prisma queries.
- Verify restored data via in-VNet container job using a CURRENT image tag (stale image fails on new columns). Connection: `postgresql://adsmadmin:<pw>@<restore-fqdn>:5432/dcms?sslmode=require`.
- Cleanup: delete restored server + verify job promptly (cost + data-copy).

## Deployment Notes
- [x] Build immutable images for `apps/api` and `apps/web`. — git-SHA-tagged images
- [x] Inject runtime configuration per environment. — VITE_API_BASE_URL baked per env; API env vars per env
- [ ] Run API as non-root user where possible. — NOT verified — OUTSTANDING (check Dockerfile)
- [x] Set container resource requests/limits. — CPU/memory set on container apps
- [x] Configure rolling deployment with readiness checks. — Container Apps revision-based rollout
- [ ] Verify blue/green or canary rollback strategy. — documented rollback (promote prior image SHA) OUTSTANDING as formal procedure (#76)

## Pre-Release Go/No-Go
- [ ] Full regression checklist completed and signed off. — OUTSTANDING
- [x] RBAC matrix reviewed and approved. — multi-tenant isolation + role allow-lists verified at code + API level (this prior session)
- [ ] Load/perf sanity test on realistic seed volume. — OUTSTANDING (post-pilot)
- [x] Disaster recovery drill performed (restore latest backup). — restore verified 2026-06-02
- [ ] Production deployment runbook reviewed. — OUTSTANDING

## Pre-Colleague (internal real-data) Go-Live — added 2026-06-02
- [ ] Rotate prod DB password (exposed multiple times) — NEXT
- [ ] Remove test client "First Client - Test" from prod
- [ ] Fix infra blockers to data entry (#50 can't-add-rooms; triage #49/#51-53)
- [ ] Provision colleagues with real @assured-digital.com emails (so SSO maps cleanly later)

## Post-Pilot Hardening (deferred)
- [ ] Geo-redundant backups + longer retention (up to 35d)
- [ ] SSO/OIDC with Entra (#76; login page already signposts)
- [ ] Entra passwordless Postgres auth (#90)
- [ ] Key Vault for secret management
- [ ] WAF / App Gateway / Front Door
- [ ] HA Postgres (currently B1ms single instance)
- [ ] CI: remove Docker Hub anonymous-pull dependency (rate-limit fix)