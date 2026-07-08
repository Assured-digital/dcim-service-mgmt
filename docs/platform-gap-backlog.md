# Prioritised Build Backlog — Closing the Gap to the AD Platform Architecture

> Source: gap analysis (2026-07-08) of this app against **Architecture Principles v1.0** and
> **ADR & Solution Architecture Pack v2.0**. Decisions in the next section are locked with Jake.
> Each item is scoped so an implementation session can execute it directly.

## Context
The app already realises the core vision (one portal, one login, one nav, one client context, one RBAC, shared Client/Site/User/Organisation, with Service Desk + DCIM + CRM inside one shell). This backlog closes the remaining gaps.

**How to use this file:** Items are grouped into epics and tagged with a priority (`P0`–`P3`), a T-shirt effort (`S`/`M`/`L`/`XL`), and the ADR/principle they satisfy. Work the **waves** at the bottom; the decisions are already made.

---

## ✅ Decisions made (locked with Jake — 2026-07-08)
1. **Documents → SharePoint of record** (ADR-007). Files become owned by SharePoint, not the app's own storage — **but the current in-app experience (taking/attaching photos on checks, uploading forms, inline preview) must keep working.** Approach: add a **SharePoint/Graph provider to the existing `StorageService` abstraction** so uploads route into the client's SharePoint library, while the app still **streams every download/preview through the API with its per-access tenant re-check** — so the customer-isolation boundary stays enforced by the app (SharePoint permissions become a second layer, not the only one). See C1.
2. **Architecture → modular monolith + versioned APIs + internal event bus** (not microservices). Honour ADR-002/006 in intent, not by splitting services. See D1 (versioning) + D2 (events).
3. **Tickets → keep the 6 work-item types** (no merge). Unified feel already delivered via `RecordLink` + shared detail shell. A thin shared cross-type numbering layer is a *later option only if* a single ticket number becomes a hard requirement.
4. **Naming → keep code terms + glossary.** Keep "Cabinet"/"Site" (CLAUDE.md: "Cabinet, never Rack"); add a doc glossary mapping the doc's "Rack"/"Data Centre". No rename.

### Alignment scope (what "aligned" means here)
The backlog closes the 8 ADRs and Phases 1–3. Three points are aligned to *intent*, not the literal doc, by the decisions above: **modular monolith** vs "independently deployable modules" (Principle 8); **6 ticket types** vs one "Ticket"; **Cabinet/Site** vs "Rack/Data Centre". The docs' long-term vision (Phase 4: **AI Assistant, Compliance, Programme Delivery, Sustainability, Energy Optimisation, Portfolio Management**) is future/out of scope here (Capacity Planning is already built). A few shared-domain-model items (**Building/Data Centre/Campus levels, Partner**) are parked as demand-driven (E2).

---

## Global guardrails (every ticket must honour these — from CLAUDE.md)
- **Tenant isolation is sacred.** Every new cross-record surface (search, entitlement, documents, dashboard) must resolve scope via `resolveClientScope` in `apps/api/src/auth/request-context.ts` and filter by the returned `clientId`. **Spoof-test per new type** (a client-scoped user sending another client's `x-client-id` must get 403). No automated isolation test exists yet — verify manually.
- **Naming:** "Cabinet" not "Rack" in code/UI/URLs. British spelling in **UI strings only**; identifiers stay US-spelled (`organizationId`, `clientId`).
- **Roles:** use the existing `Role` enum; never offer legacy `ADMIN` for new users. Web RBAC via `apps/web/src/lib/rbac.ts`; API scope via `apps/api/src/auth/role-scope.ts`.
- **Patterns to reuse:** detail pages → `RecordDetailShell` (`RECORD_DETAIL_SPEC.md`); per-record derived data → resolver-helper pattern (`record-links/resolve-links.ts`, `attachments/resolve-attachments.ts`); new forms → shared field-kit (`apps/web/src/components/fields`) + `CreateRecordModal`; assignee pickers → `useAssignableUsers()`.
- **Attachments:** never expose pre-signed/public URLs; stream through the API with per-access tenant re-check (`content-policy.ts`).
- **Deploy discipline:** deploy CODE before flipping any env flag (flags run against the deployed image); no `CREATE EXTENSION pgcrypto` in migrations (use core `gen_random_uuid()` or app `@default(uuid())`); watch the first cloud `migrate deploy` for any new migration SQL.
- **Local dev:** `docker compose restart api` after backend edits (Windows watcher serves stale code); keep `vite.config.ts` dedupe/optimizeDeps intact.

---

## EPIC A — Platform Identity & Access (P0)

### A1 · Microsoft Entra ID / OIDC SSO — `L` · ADR-003, Principle "One Login", Roadmap Phase 1
**Why:** The only major Phase-1 gap. Auth is currently custom JWT (email/password); web has a dead SSO stub (`VITE_SSO_ENABLED`, `TODO OIDC/Azure AD`). `msgraph` uses app-only auth (service↔SharePoint), not user identity.
**Scope:** Entra app registration (auth-code + PKCE); Passport OIDC strategy on the API; on callback, mint the existing session (map Entra identity → `User`, JIT-provision if absent); map Entra groups/app-roles → the `Role` enum; keep email/password as a fallback during transition; wire the web sign-in button + redirect handling.
**Key files:** `apps/api/src/auth/` (`auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`, new `oidc.strategy.ts`), `apps/web/src/routes/LoginPage.tsx`, `apps/web/src/lib/api.ts` (token handling), reuse Entra tenant config alongside `apps/api/src/msgraph/`.
**Acceptance criteria:**
- User can sign in via Microsoft and lands authenticated with correct `role` + `organizationId`.
- Unknown-but-valid Entra user is JIT-provisioned with a mapped role (never legacy `ADMIN`).
- Existing email/password login still works (feature-flagged transition).
- Refresh/session lifetime behaves; logout clears session.
- Multi-tenant scope resolution unchanged and spoof-test still passes.
**Depends on:** none (needs the Entra app registration set up out-of-band). **Guardrails:** deploy code before enabling the SSO env flag.

### A2 · Feature Entitlement / module licensing — `M` · ADR-008, Principle "Customers See Only Licensed Modules", Roadmap Phase 2
**Why:** No concept of "which modules a client has licensed" — nav is role-gated only. Blocks the commercial "one platform, licensed modules" model.
**Scope:** Add a per-client entitlement model (`ClientModuleEntitlement` join, or `Client.enabledModules` string[]); seed defaults; admin UI to toggle modules per client; gate the portal nav **and** route/controller access by entitlement **in addition to** role. Entitlement is client-scoped platform data — resolve + validate server-side, don't trust the client.
**Key files:** `apps/api/prisma/schema.prisma` (new model + migration), `apps/api/src/clients/` (entitlement read/write), `apps/web/src/routes/Shell.tsx` (nav config — gate module sections), route guards, `apps/web/src/lib/rbac.ts` (compose entitlement with role checks).
**Acceptance criteria:**
- A client with CRM disabled sees no CRM nav and gets 403 on CRM routes (server-enforced, not just hidden).
- Org-super admin can toggle a client's modules; change reflects immediately in nav.
- Entitlement checks are spoof-safe (can't self-grant by header).
**Depends on:** none (do alongside A1; A1 group-mapping can feed default entitlements later). **Guardrails:** migration hygiene; deploy code before any entitlement flag.

---

## EPIC B — Portal Primitives (P1)

### B1 · Global / shared search — `M` · Module "Portal → Search"
**Why:** Only `record-links/search` exists (type-scoped, for the linking dialog). No cross-type global search bar.
**Scope:** A client-scoped, cross-type search endpoint (Postgres FTS is sufficient at current scale) spanning work-items + assets + CRM records the user may see; a portal search bar in the Shell header with grouped results → deep links. Respect role/entitlement visibility per type.
**Key files:** new `apps/api/src/search/` (generalise the pattern in `record-links/record-links.controller.ts`), `apps/web/src/routes/Shell.tsx` (header search), result → route mapping.
**Acceptance criteria:** typing a term returns results across ≥3 record types, each honouring client scope + role + entitlement; results deep-link to the record; spoof-test passes. **Depends on:** ideally after A2 (so results respect entitlement), but can ship first and add entitlement filter later.

### B2 · Cross-module "Attention Today" dashboard — `M–L` · Principle 13 (Dashboard Philosophy)
**Why:** `/dashboard` is Service-Desk-centric; DCIM (capacity/thermal alerts) and CRM (renewals/rotting deals) health aren't surfaced in a unified home. The per-module pieces already exist.
**Scope:** Aggregate a single "what requires my attention" view: SD (SLA/overdue), DCIM (capacity headroom breaches, thermal warnings, overdue maintenance/checks), CRM (renewals due, ageing opportunities). Build a server aggregator that composes existing module signals; render as a prioritised attention feed.
**Key files:** `apps/web/src/routes/DashboardPage.tsx`, `apps/api/src/overview/overview.service.ts` + `my-work/my-work.service.ts` (extend/compose), DCIM signals from `apps/api/src/dcim/capacity.service.ts` + `sensor-readings/health.ts`, CRM from `apps/api/src/crm/` (renewals/reports).
**Acceptance criteria:** dashboard shows live attention items from all three modules for the scoped client, role/entitlement-filtered; each item deep-links. **Depends on:** benefits from D3 (reporting aggregations) but can ship standalone.

### B3 · Notifications breadth (email + more triggers) — `M` · Module "Portal → Notifications"
**Why:** In-app notifications exist but only for mention/reply; no email, no assignment/SLA/renewal triggers.
**Scope:** Add an email channel (Graph mail or SMTP), broaden triggers (assignment, SLA breach, renewal due, check overdue), and user preferences. Keep best-effort emit semantics (comment/write is primary).
**Key files:** `apps/api/src/notifications/notifications.service.ts` (channels + triggers), `apps/web/src/components/NotificationBell.tsx`, reuse `apps/api/src/msgraph/` for mail. **Depends on:** email channel pairs well with A1/msgraph auth. Ideally after D2 (events) so triggers subscribe to domain events rather than inline calls — but can start inline.

---

## EPIC C — Documents & Knowledge (P1)

### C1 · SharePoint-of-record documents (keep in-app uploads working) — `L` · ADR-007, Roadmap Phase 3 — **DECIDED**
**Why:** ADR-007 makes SharePoint the system of record. The app currently stores files itself (`Attachment` → Azure Blob/MinIO) and splits docs across `DocumentReference` (links) + `Attachment` (files). Goal: **SharePoint owns the bytes without losing the current secure in-app upload/photo/preview experience.**
**Approach (two parts):**
- **C1a — storage backend swap:** add a `sharepoint` (Graph) provider to the existing `StorageService` (which already routes on `STORAGE_PROVIDER` between `s3`/`azure`). New uploads write into the client's SharePoint library under a structured path (reuse `Client.sharePointFolderPath`); store the returned SharePoint item reference on the record. **Downloads/previews still stream through the API** — the app fetches from SharePoint via Graph, re-checks the tenant boundary, streams to the user — so the customer-isolation guarantee and the magic-byte content policy stay at the API layer (unchanged). This is what keeps photos/forms/inline preview working exactly as today.
- **C1b — document surface + browse/link:** finish the (already half-built) Graph browse/search of a client's SharePoint folder, add a per-record document picker to link existing business docs (contracts, proposals), and unify `DocumentReference` + `Attachment` behind one "Documents" panel on detail pages.
**Key files:** `apps/api/src/storage/` (new `sharepoint.provider.ts` alongside `azure.provider.ts`), `apps/api/src/msgraph/msgraph.service.ts`, `apps/api/src/attachments/` + `content-policy.ts` (keep validation as-is), `apps/api/src/documents/`, `Client.sharePointFolderPath`, `apps/web` attachments/documents components + shared picker.
**Acceptance criteria:**
- Uploading a photo/file on a check/ticket lands in the client's SharePoint library; the record shows it; inline preview still works via the API stream.
- Cross-tenant access is still blocked at the API (spoof-test passes) — SharePoint permissions are a second layer, not the only one.
- A user can also browse/link existing SharePoint documents from a record.
- A transition plan exists for pre-existing Blob files (migrate to SharePoint, or keep serving legacy files from Blob while new files go to SharePoint).
**New work/risks:** Graph **write** permission (app registration — scope carefully, prefer `Sites.Selected` over `Sites.ReadWrite.All`), per-client folder provisioning, Graph large-file upload sessions, and the one-time file-migration decision. **Depends on:** A1 helpful if moving to delegated (user-context) Graph; app-only Graph works otherwise. Deploy code before flipping `GRAPH_ENABLED` / `STORAGE_PROVIDER=sharepoint`.

### C2 · Knowledge Base module — `S–M` · Module "Service Desk → Knowledge"
**Why:** Entirely absent (no model/route/UI). Completes the Service Desk module per the doc.
**Scope:** `KnowledgeArticle` model (client-scoped, category, body, version, status), CRUD + search, and the ability to link articles from tickets (reuse `RecordLink`). Follow existing module conventions (resolver-helper, field-kit, list-page full-bleed).
**Key files:** new `apps/api/src/knowledge/` + schema/migration, new `apps/web/src/routes/Knowledge*`, Service Desk nav entry in `Shell.tsx`.
**Acceptance criteria:** create/edit/search articles within client scope; link an article to a ticket; spoof-test passes. **Depends on:** none (self-contained — good early/parallel item).

---

## EPIC D — Integration Architecture (P2)

### D1 · API versioning — `S` · ADR-006 (API First)
**Why:** REST is unversioned; needed before any external/module consumers.
**Scope:** Enable NestJS URI or header versioning (`/v1`) globally; keep current paths as v1; document.
**Key files:** `apps/api/src/main.ts` (enable versioning), controllers (default version), `apps/web/src/lib/api.ts` (base path). **Depends on:** none. Low risk, do early.

### D2 · Internal event bus / outbox — `M–L` · ADR-006 (events; "no module owns another's data")
**Why:** Audit + notifications + cross-module reactions are inline/synchronous; no events.
**Scope (decided — modular monolith):** introduce an internal event bus (NestJS CQRS `EventBus`) or transactional outbox; publish domain events (ticket assigned, SLA breached, opportunity won, capacity breached); subscribe audit/notifications to events instead of inline calls.
**Key files:** `apps/api/src/app.module.ts`, cross-cutting in `notifications/`, `audit-events/`, emitting modules. **Depends on:** none (decided). Pairs with B3.

### D3 · Cross-module Reporting module — `M–L` · Module "Reporting", Roadmap Phase 3
**Why:** Reporting is per-module (per-record PDFs, DCIM infrastructure report, CRM commercial report); no unified cross-module analytics (SLA/MTTR, capacity trends, cost-to-serve).
**Scope:** a Reporting surface aggregating Service Desk + DCIM + CRM metrics with export; build on existing report services.
**Key files:** extend `apps/api/src/records-report/` + `overview/`, DCIM `capacity.service.ts`, CRM `crm` reports; new `apps/web` reporting route. **Depends on:** D2 helpful (event-sourced metrics) but not required; feeds B2.

---

## EPIC E — New Product & Domain (P3 — scope separately)

### E1 · Connect Insight (OSP: campus maps / ducts / chambers / fibre / surveys) — `XL` · ADR-002, Roadmap Phase 2
**Why:** Entirely absent — a whole product line. This is a **design-first initiative**, not a single build ticket.
**Scope (break into sub-epics after a design brief):** domain (`Campus`, `Duct`, `Chamber`, `FibreRoute`/`FibreStrand`, `Survey`); map UI (Leaflet types are already in the tree); API modules; integrate into portal nav + client scope + entitlement (A2). Recommend a separate design session mirroring how DCIM/CRM were designed before build.
**Depends on:** A2 (entitlement) so it ships as a licensable module; its own design doc.

### E2 · Domain reconciliations (decisions → optional builds) — `M–L` each
- **Building / Data Centre / Campus levels:** currently collapsed into `Site`. Only build if a real multi-building estate needs sub-division (workaround today: multiple Sites under a `Region`).
- **Partner model:** add if CRM needs third-party/vendor/referral relationships (today: `Contact` only).
- **Unified Ticket:** **decided — do not build.** Keep the 6 types. Optional later: a thin shared cross-type numbering/index layer, only if a single ticket number becomes a hard requirement.
- **Naming glossary:** **decided — keep code terms.** Produce a docs glossary mapping doc terms (Rack/Data Centre) ↔ code terms (Cabinet/Site); do not rename code. Small task, do early.
**Depends on:** decisions locked; remaining items (Building/DC/Campus levels, Partner) are demand-driven.

---

## Suggested build sequence (waves)

- **Wave 0 — decisions:** ✅ locked (SharePoint-of-record · modular monolith + versioned APIs/events · keep 6 ticket types · keep code names + glossary). Remaining setup (out-of-band, has lead time): register the **Entra app** (gates A1) and set up **SharePoint access** — site/library, `Sites.Selected` write permission, per-client folders (gates C1); produce the **naming glossary**.
- **Wave 1 — parallelisable, high-leverage, independent:** `A1 SSO`, `A2 Entitlement`, `C2 Knowledge`, `D1 API versioning`. (`B1 Search` can start here, entitlement-filter added after A2.) Code-only items (A2, C2, B1, D1) need no infra and can start immediately; A1 starts once the Entra app registration exists.
- **Wave 2 — build on Wave 1:** `C1 SharePoint/Docs` (storage-provider swap + browse/link; A1 helpful for delegated Graph), `B2 Dashboard`, `B3 Notifications`, `D2 Event bus`.
- **Wave 3 — analytics + polish:** `D3 Reporting` (feeds B2), notification triggers migrated onto events.
- **Separate track:** `E1 Connect Insight` (design → phased build); `E2` domain items as demand arises.

**Highest-leverage first six for a build session:** A1 → A2 → C2 → B1 → C1 → B2.

---

## Notes for the executing session
- This is a research-derived plan; validate each item's "how much already exists?" before assuming greenfield (CLAUDE.md: several past "build X" tasks turned out to be "frontend exists, backend drops data"). Especially C1 (Graph mostly built) and B2 (module signals mostly exist).
- Keep prompts to ~6 files max per change; prefer a shared hook/helper + batched conversion over per-file duplication for wide changes.
- Follow the project's design-first discipline: agree each item's design in chat, then write a complete drop-in build prompt.
