# ADSM — Azure Cost Model

> Living document. The companion to `INFRA.md` (what exists) — this is *what it costs and why*.
> Check this before any sizing change (replica counts, DB tier, storage growth).
> Figures are pay-as-you-go, uksouth, USD, as of 2026-06-24. Treat as planning estimates,
> not invoices — confirm actuals in Azure Cost Analysis.

## TL;DR

- Whole estate is **~$50–65/month**, dominated by the two PostgreSQL servers.
- **Almost all spend is fixed** — it does not move with app traffic or warm/cold state.
- Warming prod is a **~$13/mo** decision (API only), i.e. a rounding adjustment on the total.
- The single most valuable cost action is **a budget alert**, not any reduction — it
  protects against a runaway-spike surprise, which dwarfs any £5–6/mo saving available.

## Cost drivers (descending by spend)

| Resource | Tier / size | Billing basis | Est. /mo (each) | Runs 24/7? |
|---|---|---|---|---|
| PostgreSQL Flexible Server | Standard_B1ms (1 vCore / 2 GiB), 32 GB storage, 7-day backup, no HA, no geo | Per-hour compute + storage | ~$16–17 | Yes — cannot scale to zero |
| Container Apps — idle (warm) | 0.5 vCPU / 1 GiB API replica | Reduced idle rate | ~$13 (API only, if warm) | Only if minReplicas > 0 |
| ACR | Basic | Flat per-day | ~$4 | Yes |
| Log Analytics workspace | PerGB2018, 30-day retention, **no daily cap** | Per-GB ingested | ~$0–few | Yes (ingestion-driven) |
| Storage account | StandardV2 LRS, Hot | Per-GB + transactions | ~$0–1 | Yes (minimal at current data) |
| Private endpoint (TEST only) | 1× for Postgres | ~$0.20/day flat | ~$6 | Yes |
| Container Apps — active compute | per-second active rate | $0.000024/vCPU-s + $0.000003/GiB-s | ~$0 | Traffic-driven (inside free grant) |
| Container Apps — requests | $0.40 / million over 2M free | per request | ~$0 | Inside free grant |
| Key Vault (TEST only) | Standard | per operation | ~$0 | Negligible |
| VNet / Private DNS / Managed Identity | — | free | $0 | — |

### Free grants (per subscription per month, not per app)
- 180,000 vCPU-seconds active compute
- 360,000 GiB-seconds active compute
- 2,000,000 HTTP requests
- Idle compute (warm replicas) is **NOT** covered by the free grant.

## Per-environment forecast

### PROD (rg-adsm-prod) — ~$24–37/mo
| Line | Est. /mo |
|---|---|
| Postgres B1ms + 32 GB | ~$16 |
| Container Apps idle (API warm, web cold) | ~$13 |
| ACR Basic | ~$4 |
| Log Analytics | ~$0–few |
| Storage account | ~$0–1 |
| **No private endpoint** (uses VNet-injection) | $0 |
| **No Key Vault** (secrets held as Container App secrets) | $0 |

### TEST (rg-adsm-test) — ~$26/mo
| Line | Est. /mo |
|---|---|
| Postgres B1ms + 32 GB | ~$16 |
| Container Apps (both scale to zero) | ~$0 |
| ACR Basic | ~$4 |
| Private endpoint (Postgres) | ~$6 |
| Log Analytics | ~$0–few |
| Storage + Key Vault | ~$0–1 |

## The "warm" decision (current state + rationale)

**Cold start** = first request after idle must boot a container → the spin-up delay.
Fixed by `minReplicas: 1` (always one replica running, nothing to wait for).

- **2026-06-24:** PROD **API** warmed (`minReplicas: 1`). Web left cold for now.
- Web app is static React/nginx (0.25 vCPU / 0.5 GiB) — cheap, fast cold start.
  Warming web too would add ~$5/mo and remove the page-load (not just data-call) lag.
  **Decision deferred:** evaluate after feeling API-only behaviour.

### Idle-billing trap (important)
A warm replica only gets the cheap *idle* rate while it uses <0.01 vCPU and receives
<1,000 bytes/sec. **External** health checks / uptime pings / a left-open browser tab
break idle state → the replica is billed at the ~3× *active* rate around the clock.
If warm-API cost comes in well above ~$13/mo, suspect something is pinging prod on a
schedule. (Internal ACA health probes don't count; external ones do.)

## Levers to reduce cost (ranked by value)

1. **Budget alert per RG** — *not a reduction, but the highest-value action.* Email
   tripwire if spend exceeds expectation (runaway log ingestion, a replica stuck in
   active billing). Protects against a £100+ surprise. **Do this.**
2. **Migrate TEST Postgres networking to match PROD** (VNet-injection, drop the private
   endpoint) — saves ~$6/mo permanently *and* makes the two environments consistent for
   Bicep. Belongs in the Bicep phase, not a quick CLI change. **Reconciliation item.**
3. **Stop/start the TEST database overnight** — `az postgres flexible-server stop/start`.
   Stopped = pay storage only. Saves ~$6/mo *if done consistently*. Manual daily effort;
   Azure force-restarts after 7 days regardless. **Low value, only if it becomes a habit.**

### Already optimal (nothing to squeeze)
- Container Apps in TEST already scale to zero (cost ~$0 idle).
- ACR already on Basic (cheapest tier).
- Storage minimal at current data volume.

## Forecasting mechanism (ongoing, not one-off)
- **Cost Analysis** (portal blade / `az consumption usage list`) — actuals by RG and service.
  Use to confirm this model against reality, especially the warm-API idle-vs-active question.
- **Budgets + alerts** (`az consumption budget`) — per-RG monthly caps with email alerts at
  e.g. 50/80/100%. The tripwire from lever #1.

## What scales this up (watch for these)
- **Postgres tier bump** — B1ms → General Purpose is the big jump (~$12/mo → ~$100+/mo).
  Only if the DB becomes the bottleneck. This is by far the largest potential cost change.
- **HA / geo-redundant backup** — currently both off; enabling either roughly doubles the DB line.
- **Storage growth** — attachments/photos accumulate in the storage account; watch as usage grows.
- **Log ingestion** — uncapped today; a verbose-logging incident could spike it.
- **Adding warm web / raising minReplicas / raising maxReplicas under real traffic.**

## Change log
- 2026-06-24 — Initial model from full inventory. PROD API warmed (minReplicas 1).
