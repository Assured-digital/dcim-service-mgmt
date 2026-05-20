# Deployment Plan — AD Service Management

Living plan from "runs on my laptop" to "live prod we iterate on".
Updated to reflect actual progress; phases are ordered by dependency.

Status legend:  [ ] not started   [~] in progress   [x] done

---

## Where you actually are

- [x] App runs locally via `docker compose up`
- [x] Tracker exists (GitHub Project, Assured-digital org)
- [x] **Phase 0 — App deployment-ready** (committed)
- [x] **Phase 1 — Azure test infrastructure provisioned and verified**
- [ ] Phase 2 onward

Two phases done today. The rest is ahead.

---

## Phase 0 — App deployment-ready  (LOCAL, NO AZURE)   [x] DONE

Was: schema built by `prisma db push` on boot; entrypoint did push+seed+dev
mode every start; no `.gitattributes`; missing per-machine config (`.env`,
git identity).

Done:
- [x] Prisma migration ledger baselined via `migrate resolve --applied`
      for all four existing migrations. `prisma migrate status` clean.
- [x] `.gitattributes` committed to force LF on `*.sh`/Dockerfiles/etc.,
      CRLF on `*.ps1`/`*.bat`. Permanent guard against the
      `#!/bin/sh: not found` failure that bit twice today.
- [x] `docker-entrypoint.sh` swapped to environment-aware version: defaults
      to old MVP behaviour locally (`APP_ENV=local`), production-safe shape
      (`APP_ENV=production` → no db push, RUN_SEED-gated seed, compiled
      build) for Azure. Local `docker compose up` regression-tested clean.
- [x] All committed to `feat/dcim-asset-register`.

---

## Phase 1 — Azure test infrastructure   [x] DONE

Done via deliberate, command-at-a-time provisioning in Cloud Shell (Bash),
not the `azure-bootstrap.sh` script. Verified after each step.

Provisioned in `rg-adsm-test` (uksouth), Azure subscription 1:

- [x] **ACR `acradsmtest01`** (Basic, admin disabled).
      Login server: `acradsmtest01.azurecr.io`
- [x] **Key Vault `kv-adsm-test`**.
      URI: `https://kv-adsm-test.vault.azure.net/`
- [x] **PostgreSQL `psql-adsm-test`** — Flexible Server, v16,
      `Standard_B1ms` Burstable, 32 GB, `public-access None`.
      Admin user `dcmsadmin`. Password in password manager only.
- [x] **VNet `vnet-adsm-test`** (`10.20.0.0/16`) with subnets:
      - `snet-postgres-pe` (`10.20.1.0/24`) — for the DB private endpoint
      - `snet-containerapps` (`10.20.2.0/23`) — delegated `Microsoft.App/environments`
- [x] **Private DNS zone** `privatelink.postgres.database.azure.com`,
      linked to the VNet (`link-to-adsm-vnet`, registration disabled).
- [x] **Private endpoint `pe-postgres-adsm-test`** in `snet-postgres-pe`,
      connection Approved, A record `psql-adsm-test → 10.20.1.4` in the
      private DNS zone (auto-registered via dns-zone-group attach).
- [x] **Container Apps environment `cae-adsm-test`** bound to
      `snet-containerapps`, external ingress, internal-only=false.
- [x] **Log Analytics workspace `workspace-rgadsmtest0WI2`** (auto-created
      with the env; small recurring cost, fine for now).
- [x] **Storage account `stadsmtest01`** (StorageV2, LRS, TLS1.2, no public
      blob access).

Architecture decision: **Option A (private endpoint + private DNS) over
Option B (VNet-injected DB)** for long-term flexibility and alignment with
how the platform will eventually scale.

Cost guard: budget alert set on the subscription.

---

## Phase 2 — First manual deploy to test   [ ] NEXT

This is where infrastructure gets turned into *the running app*. Mostly
configuration, not networking — lower fiddliness than Phase 1, higher
tedium and credential-handling.

Tasks, in order:

- [ ] **2.1 Put real Azure secrets in Key Vault** (by hand, in the portal
      or via `az keyvault secret set`):
      - `database-url` — full connection string using the **private FQDN**:
        `postgresql://dcmsadmin:<PASSWORD>@psql-adsm-test.postgres.database.azure.com:5432/postgres?sslmode=require`
        (the database name on a fresh Flexible Server is `postgres`; we may
        create `dcms` explicitly via a one-off connection from inside the
        VNet, or use `postgres` as the app's DB — decide at 2.4)
      - `jwt-secret` — fresh strong value, *not* the local dev value
      - `jwt-refresh-secret` — fresh strong value
      - `storage-conn-string` — for `stadsmtest01` (Storage account → Access
        keys → connection string, or via `az storage account show-connection-string`)

- [ ] **2.2 Build and push api + web images to ACR.**
      Easiest: `az acr build` builds in Azure and pushes in one step (no
      local Docker push needed):
      ```
      az acr build --registry acradsmtest01 -t dcms-api:v1 -f apps/api/Dockerfile .
      az acr build --registry acradsmtest01 -t dcms-web:v1 -f apps/web/Dockerfile .
      ```

- [ ] **2.3 Create a Container Apps Job for migrations.**
      A one-shot job (not a long-running app) that runs
      `npx prisma migrate deploy` against the private DB. Image = the api
      image we just pushed. Bound to the Container Apps env so it can
      reach the private DB. Run it once → the schema is created.

- [ ] **2.4 Create the storage container** for attachments in
      `stadsmtest01` (e.g. `dcms-attachments`) and grant the api app's
      managed identity Storage Blob Data Contributor on it.

- [ ] **2.5 Grant the api app's managed identity** `AcrPull` on the
      registry, `Key Vault Secrets User` on the vault.

- [ ] **2.6 Create the api Container App** (`containerapp create`) in
      `cae-adsm-test`, pointing at `acradsmtest01.azurecr.io/dcms-api:v1`,
      with secrets referenced from Key Vault, `APP_ENV=production`,
      `RUN_SEED=true` (test only).

- [ ] **2.7 Create the web Container App** similarly, with
      `VITE_API_BASE_URL` pointing at the api app's external URL.

- [ ] **2.8 Verify end-to-end**: open the web app's URL, log in, create a
      record, confirm it persists, confirm file upload hits Blob.

**Exit criterion: the app is running on Azure, against a live managed
database, and you can iterate on it. This is the milestone you wanted.**

---

## Phase 3 — CI/CD pipeline   [ ]

Automate what was just done by hand.

- [ ] `.github/workflows/deploy.yml` (file written earlier, needs updating
      to match what we actually built — names, image references, etc.)
- [ ] Azure OIDC federation + repo secrets (`AZURE_CLIENT_ID`,
      `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`)
- [ ] Merge-to-main triggers: build, push, run migrate job, deploy test.

---

## Phase 4 — Prod promotion   [ ]   (defer)

- [ ] Decide subscription: same subscription / separate resource group, or
      separate subscription (the future-billing-separation question deferred
      from Phase 1 — revisit before prod).
- [ ] Provision `rg-adsm-prod` mirroring test but with HA Postgres
      (General Purpose, Zone Redundant) and min-1 Container Apps replicas.
- [ ] Required-reviewer gate on the `production` GitHub Environment.
- [ ] First prod deploy via the pipeline.

Cost expectation honest figure: prod will materially exceed test
(plausibly ~£150–250+/mo) because of HA database + always-on replicas.
Don't provision prod until test has proven the whole flow.

---

## Phase 5 — Operate (ongoing)   [ ]

Feeds from `docs/release-readiness.md`.

- [ ] DB backups + verified restore (Azure does automatic backups; you
      need to test restoring one)
- [ ] Health probes + an alert when the api goes down
- [ ] Documented rollback (redeploy previous image SHA)
- [ ] Rotate any seeded credentials
- [ ] `.env.example` + README "fresh-machine setup" section so a new clone
      doesn't dead-end the way today did (concrete list: `.env` keys, git
      identity, Docker Desktop running, `gh` auth, Prisma migrate status)

---

## Eventual environment topology (on paper, not yet built)

Sandbox / Test / Pre-prod / Prod was discussed and intentionally deferred.
The current plan builds **test first**, proves the flow, then a deliberate
decision on which other environments are worth standing up. Adding an
environment is a repeat of Phase 1+2 against a new resource group, not a
re-architecture.

---

## Notes captured today (don't lose these)

- **Local `.env` doesn't travel** — it's gitignored, correctly. A fresh
  machine needs it recreated. Keys: `DATABASE_URL` (note: local uses
  `postgres` as the docker-compose service name, not `db`),
  `JWT_SECRET`, `JWT_REFRESH_SECRET`, `STORAGE_PROVIDER=s3` (MinIO),
  `S3_ENDPOINT=http://minio:9000`, `S3_BUCKET=dcms-uploads`,
  `S3_ACCESS_KEY/SECRET_KEY=minioadmin`, `S3_REGION=us-east-1`,
  `S3_FORCE_PATH_STYLE=true`.
- **Local docker-compose creds**: Postgres user/pass/db are all `dcms`,
  not `postgres`.
- **Line endings**: `.gitattributes` now enforces LF on `*.sh`. If the
  `#!/bin/sh: not found` error ever returns, check that file first.
- **Branch**: work continued on `feat/dcim-asset-register`. Phase 0
  commits (`.gitattributes`, env-aware entrypoint) are on it.
- **Tracker**: GitHub Project under Assured-digital org. Deploy Phase 1
  → Done. Deploy Phase 2 → In Progress (re-entry comment captured on
  card).
