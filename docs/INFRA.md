# ADSM — Azure Infrastructure Map

> Living document. The companion to `COSTS.md` (what it costs) — this is *what exists and how it's wired*.
> Check this before any structural change. The **Bicep migration ledger** at the bottom tracks
> the move from portal-provisioned → committed code.
> Captured 2026-06-24 from `az` inventory. Subscription: `44f5bf00-8dd5-4789-a50c-6d8bb086ea78`,
> region: uksouth throughout.

## Naming convention (observed)
`<type>-adsm-<env>` for most resources (e.g. `psql-adsm-prod`, `cae-adsm-test`),
`<type>adsm<env>NN` for globally-named resources that disallow hyphens
(ACR `acradsmprod01`, storage `stadsmtest01`). Container apps: `adsm-<role>-<env>`.

## Environments at a glance

| | TEST (`rg-adsm-test`) | PROD (`rg-adsm-prod`) |
|---|---|---|
| Auto-deploy | on push to `main` | gated `deploy-prod.yml` (workflow_dispatch) |
| Postgres networking | **Private endpoint** | **VNet-injection (delegated subnet)** |
| VNet address space | 10.20.x | 10.1.x |
| Key Vault | `kv-adsm-test` present | **none** — secrets held as Container App secrets |
| Custom domain / cert | no (default FQDN) | yes (managed cert, `assured-digi…`) |
| Container Apps min replicas | 0 (scale to zero) | API = **1 (warmed 2026-06-24)**, web = 0 |

These differences are mostly **deliberate** but make the two environments NOT parameterised
copies — see the reconciliation items in the ledger.

## Resource map — PROD (`rg-adsm-prod`)

| Resource | Type | Key config | Provenance |
|---|---|---|---|
| `acradsmprod01` | Container Registry | Basic | portal |
| `psql-adsm-prod` | PostgreSQL Flexible Server | B1ms (1 vCore/2 GiB), v16, 32 GB, 7-day backup, no HA, no geo, public access **disabled** | portal |
| `vnet-adsm-prod` | Virtual Network | 10.1.x | portal |
| `snet-adsm-prod-db` | Subnet | 10.1.1.0/24, **delegated to `Microsoft.DBforPostgreSQL/flexibleServers`** | portal |
| `snet-containerapps` | Subnet | 10.1.2.0/23, delegated to `Microsoft.App/environments` | portal |
| `privatelink.postgres.database.azure.com` | Private DNS Zone | linked to vnet (`link-adsm-prod-db`) | portal |
| `cae-adsm-prod` | Container Apps Env | Consumption workload profile | portal |
| `adsm-api-prod` | Container App | 0.5 vCPU / 1 GiB, target port 3001, external ingress, **minReplicas 1 / max 3**, MI-based ACR pull | portal |
| `adsm-web-prod` | Container App | 0.5 vCPU / 1 GiB, external ingress, minReplicas 0 / max 2 | portal |
| `…/managedCertificates/mc-…assured-digi-3972` | Managed Certificate | custom domain TLS | portal |
| `job-migrate-prod` | Container Apps Job | Prisma migrations | portal |
| `workspace-rgadsmprodXjQr` | Log Analytics | PerGB2018, 30-day retention, **no daily cap** | portal |
| `stadsmprod01` | Storage Account | StandardV2 LRS, Hot (attachments/photos) | portal |
| `id-adsm-prod` | Managed Identity (app) | see access wiring | portal |
| `id-adsm-github-deploy-prod` | Managed Identity (deploy) | see access wiring | portal |

## Resource map — TEST (`rg-adsm-test`)

| Resource | Type | Key config | Provenance |
|---|---|---|---|
| `acradsmtest01` | Container Registry | Basic | portal |
| `kv-adsm-test` | Key Vault | Standard | portal |
| `psql-adsm-test` | PostgreSQL Flexible Server | B1ms (1 vCore/2 GiB), v16, 32 GB, 7-day backup, no HA, no geo, public access **disabled** | portal |
| `vnet-adsm-test` | Virtual Network | 10.20.x | portal |
| `snet-postgres-pe` | Subnet | 10.20.1.0/24, **no delegation** (hosts private endpoint) | portal |
| `snet-containerapps` | Subnet | 10.20.2.0/23, delegated to `Microsoft.App/environments` | portal |
| `pe-postgres-adsm-test` (+ NIC) | Private Endpoint | Postgres connectivity (~$6/mo) | portal |
| `privatelink.postgres.database.azure.com` | Private DNS Zone | linked to vnet (`link-to-adsm-vnet`) | portal |
| `cae-adsm-test` | Container Apps Env | Consumption | portal |
| `adsm-api-test` | Container App | 0.5 vCPU / 1 GiB, minReplicas 0 / max 1 | portal |
| `adsm-web-test` | Container App | 0.25 vCPU / 0.5 GiB, minReplicas 0 / max 1 | portal |
| `job-migrate-test` | Container Apps Job | Prisma migrations | portal |
| `workspace-rgadsmtest0WI2` | Log Analytics | PerGB2018, 30-day retention, no daily cap | portal |
| `stadsmtest01` | Storage Account | StandardV2 LRS, Hot | portal |
| `id-adsm-test` | Managed Identity (app) | — | portal |
| `id-adsm-github-deploy` | Managed Identity (deploy) | see access wiring | portal |

## Identity & access wiring

### App identities (runtime)
- **`id-adsm-prod`** (principal `74bd756c…`), used by prod container apps:
  - `AcrPull` on `acradsmprod01`
  - `Storage Blob Data Contributor` on `stadsmprod01`
  - Least-privilege, environment-local. ✅
- Prod app secrets are injected as **Container App secrets** (`database-url`, `jwt-secret`,
  `jwt-refresh-secret`, `storage-connection-string`) via `secretRef` — no Key Vault in prod.

### Deploy identities (CI/CD, used by GitHub Actions OIDC)
- **`id-adsm-github-deploy`** (principal `c2dec54c…`) — TEST only:
  - `AcrPush` + `Contributor` on `acradsmtest01`
  - `Contributor` on `adsm-api-test`, `adsm-web-test`, `job-migrate-test`
  - Cleanly scoped to test. ✅
- **`id-adsm-github-deploy-prod`** (principal `0399aec4…`) — mostly PROD:
  - `AcrPush` + `Contributor` on `acradsmprod01`
  - `Contributor` on `adsm-api-prod`, `adsm-web-prod`, `job-migrate-prod`
  - **Cross-env:** `AcrPull` + `Reader` on **test** ACR `acradsmtest01`
    → prod deploy can *pull/read* test's registry (likely promote-from-test or base-image flow).
    Pull/read only — no write into test. **Confirm this is intentional** (ledger item).
- Neither deploy identity has runtime rights into the *other* environment. Blast radius healthy. ✅

## Postgres networking (the key test↔prod difference)
- **TEST:** private endpoint in undelegated subnet `snet-postgres-pe`. Extra ~$6/mo (PE charge) + a NIC.
- **PROD:** VNet-injection — server delegated into `snet-adsm-prod-db`. No PE, no extra charge. Cleaner.
- Both: `publicNetworkAccess: Disabled`, same private DNS zone name in each RG.
- Consequence: the two environments need **different network blocks** in Bicep; not naively shareable.

## Bicep migration ledger
Status legend: `portal` (clicked, not in code) → `captured` (written as Bicep) → `verified` (deployed from code & matches).

| Item | Status | Notes |
|---|---|---|
| ACR (both) | portal | Basic, straightforward |
| Postgres servers (both) | portal | B1ms; storage/backup params to capture |
| VNet + subnets (both) | portal | **Different per env** — parameterise carefully |
| Container Apps env (both) | portal | |
| Container Apps (api/web, both) | portal | Capture scale block — incl. prod API `minReplicas: 1` (see below) |
| Migrate jobs (both) | portal | |
| Log Analytics (both) | portal | Add daily cap when captured |
| Storage accounts (both) | portal | |
| Managed identities + role assignments | portal | The access wiring above |
| Key Vault (test) | portal | |
| Managed certificate (prod) | portal | |

### Reconciliation items (deliberate-diff decisions, defer to Bicep phase)
1. **Standardise TEST Postgres onto PROD's VNet-injection pattern** — drops the private endpoint
   (~$6/mo) and makes environments consistent. Networking change; not a quick CLI poke.
2. **Key Vault parity** — prod has none (uses Container App secrets). Decide: add prod KV, or drop
   test KV and standardise on Container App secrets everywhere.
3. **Confirm prod-deploy → test-ACR cross-env access is intentional** (AcrPull + Reader). If a
   base-image/promote flow, document why; if vestigial, remove.

### First Bicep candidate
`adsm-api-prod` scale block (`minReplicas: 1`) — set by CLI on 2026-06-24. Classic
portal-equivalent drift; ideal first thing to capture as committed code so "make it warm"
is a reviewable diff, not a click.

## Change log
- 2026-06-24 — Initial map from full inventory. Prod API warmed (minReplicas 1, by CLI).
