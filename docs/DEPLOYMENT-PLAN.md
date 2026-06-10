# Deployment Plan — AD Service Management

> ## ⚠️ HISTORICAL — SUPERSEDED (banner added 2026-06-09)
>
> This document records the original **"laptop → first live prod"** journey. That journey is **complete**. Phases 0–5 are all done.
>
> **Current state (see `CLAUDE.md` → Deploy & DB for the authoritative version):**
> - **CI/CD is live** — `deploy.yml` auto-deploys TEST on push to `main`; `deploy-prod.yml` is the gated manual PROD promote (promotes the test API image, builds web fresh with the prod URL).
> - **PROD is fully live** — `rg-adsm-prod`, real first client created, first colleague onboarded (SERVICE_MANAGER).
> - DB backups + verified restore done. The app has been iterated and deployed many times.
>
> **Why this doc is kept:** the **Phase 1 Azure infrastructure provisioning record** (VNet, private endpoint, private DNS, ACR, Key Vault, Container Apps environment, storage) is still accurate and is useful reference if test/prod ever needs re-provisioning or a new environment is stood up. The Phase 2–5 task lists are retained as a historical record of how the platform first reached production.
>
> **Remaining open operational items** (small; tracked on the board, not blockers) are listed under [Phase 5](#phase-5--operate-ongoing).

---

Living plan from "runs on my laptop" to "live prod we iterate on", ordered by dependency.

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## Where things stand

| Phase | Description | Status |
|---|---|---|
| 0 | App deployment-ready (local) | `[x]` done |
| 1 | Azure test infrastructure provisioned & verified | `[x]` done |
| 2 | First manual deploy to test | `[x]` done |
| 3 | CI/CD pipeline | `[x]` done |
| 4 | Prod promotion | `[x]` done |
| 5 | Operate (ongoing) | `[~]` in progress — 1 of 5 done, 4 outstanding |

---

## Phase 0 — App deployment-ready (local, no Azure)  `[x]`

**Problem it solved:** schema was built by `prisma db push` on boot; the entrypoint did push + seed + dev-mode every start; no `.gitattributes`; per-machine config (`.env`, git identity) was undocumented.

- [x] Prisma migration ledger baselined via `migrate resolve --applied` for all existing migrations (`prisma migrate status` clean).
- [x] `.gitattributes` committed — forces LF on `*.sh` / Dockerfiles, CRLF on `*.ps1` / `*.bat`. Permanent guard against the `#!/bin/sh: not found` failure.
- [x] `docker-entrypoint.sh` made environment-aware: MVP behaviour locally (`APP_ENV=local`); production-safe shape for Azure (`APP_ENV=production` → no db push, `RUN_SEED`-gated seed, compiled build). Local `docker compose up` regression-tested clean.

---

## Phase 1 — Azure test infrastructure  `[x]`

Provisioned command-at-a-time in Cloud Shell (Bash), verified after each step, in **`rg-adsm-test`** (uksouth).

| Resource | Name | Notes |
|---|---|---|
| Container Registry | `acradsmtest01` | Basic, admin disabled. Login: `acradsmtest01.azurecr.io` |
| Key Vault | `kv-adsm-test` | `https://kv-adsm-test.vault.azure.net/` |
| PostgreSQL | `psql-adsm-test` | Flexible Server v16, `Standard_B1ms` Burstable, 32 GB, public-access None. Admin `dcmsadmin` (password in password manager only) |
| VNet | `vnet-adsm-test` | `10.20.0.0/16` — subnets: `snet-postgres-pe` (`10.20.1.0/24`, DB private endpoint), `snet-containerapps` (`10.20.2.0/23`, delegated `Microsoft.App/environments`) |
| Private DNS zone | `privatelink.postgres.database.azure.com` | Linked to VNet (`link-to-adsm-vnet`, registration disabled) |
| Private endpoint | `pe-postgres-adsm-test` | In `snet-postgres-pe`; connection Approved; A record `psql-adsm-test → 10.20.1.4` (auto-registered via dns-zone-group attach) |
| Container Apps env | `cae-adsm-test` | Bound to `snet-containerapps`, external ingress |
| Log Analytics | `workspace-rgadsmtest0WI2` | Auto-created with the env |
| Storage | `stadsmtest01` | StorageV2, LRS, TLS1.2, no public blob access |

**Architecture decision:** Option A (private endpoint + private DNS) over Option B (VNet-injected DB) — long-term flexibility and scaling alignment.
**Cost guard:** budget alert set on the subscription.

---

## Phase 2 — First manual deploy to test  `[x]`

Turned infrastructure into the running app. Mostly configuration + credential handling.

- [x] **2.1** Real secrets in Key Vault: `database-url` (private FQDN, `sslmode=require`), `jwt-secret`, `jwt-refresh-secret`, `storage-conn-string`. *(DB name on a fresh Flexible Server is `postgres`.)*
- [x] **2.2** Build + push api/web images to ACR via `az acr build` (builds in Azure, no local Docker push).
- [x] **2.3** Container Apps **Job** for migrations (`npx prisma migrate deploy` against the private DB, bound to the env).
- [x] **2.4** Storage container for attachments + managed-identity Storage Blob Data Contributor grant.
- [x] **2.5** Managed-identity `AcrPull` on the registry + `Key Vault Secrets User` on the vault.
- [x] **2.6** api Container App in `cae-adsm-test` (Key Vault secret refs, `APP_ENV=production`, `RUN_SEED=true` test-only).
- [x] **2.7** web Container App (`VITE_API_BASE_URL` → api app URL).
- [x] **2.8** End-to-end verified: log in, create a record, confirm persistence + Blob upload.

**Exit criterion met:** app running on Azure against a live managed database, iterable.

---

## Phase 3 — CI/CD pipeline  `[x]`

- [x] `.github/workflows/deploy.yml` — test pipeline.
- [x] Azure OIDC federation + repo secrets (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`).
- [x] Push-to-`main` triggers: build → push → run migrate job → deploy test.

---

## Phase 4 — Prod promotion  `[x]`

- [x] Subscription/RG decision made.
- [x] `rg-adsm-prod` provisioned (HA Postgres, min-1 Container Apps replicas).
- [x] Required-reviewer gate on the `production` GitHub Environment.
- [x] Prod live via `deploy-prod.yml` (gated manual promote); first real client + colleague onboarded.

**Cost note:** prod materially exceeds test (HA database + always-on replicas).

---

## Phase 5 — Operate (ongoing)  `[~]` in progress

Feeds from `docs/release-readiness.md`.

- [x] DB backups + verified restore.
- [ ] Health probes + a down-alert on the api.
- [ ] Documented rollback (redeploy previous image SHA — the mechanism is in CLAUDE.md; this is about writing it up as a runbook).
- [ ] Rotate seeded credentials (incl. the test DB password).
- [ ] `.env.example` + README "fresh-machine setup" section (so a new clone doesn't dead-end): `.env` keys, git identity, Docker Desktop, `gh` auth, Prisma migrate status.

---

## Eventual environment topology (on paper, not yet built)

Sandbox / Test / Pre-prod / Prod was discussed and **intentionally deferred**. The plan was test-first, prove the flow, then a deliberate decision on which further environments are worth standing up. Adding one is a repeat of Phase 1 + 2 against a new resource group — not a re-architecture.

---

## Reference notes (local dev)

- **Local `.env` doesn't travel** (gitignored, correctly). A fresh machine needs it recreated:
  `DATABASE_URL` (local uses `postgres` as the docker-compose service name, not `db`), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `STORAGE_PROVIDER=s3` (MinIO), `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=dcms-uploads`, `S3_ACCESS_KEY` / `S3_SECRET_KEY=minioadmin`, `S3_REGION=us-east-1`, `S3_FORCE_PATH_STYLE=true`.
- **Local docker-compose creds:** Postgres user / pass / db are all `dcms` (not `postgres`).
- **Line endings:** `.gitattributes` enforces LF on `*.sh`. If `#!/bin/sh: not found` ever returns, check that file first.