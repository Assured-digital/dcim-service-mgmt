# CLAUDE.md — AD Service Management

Project context for Claude Code. Keep this concise and high-signal — it's read every session.

## What this is
**AD Service Management** — a multi-tenant DCIM + ITSM platform for Assured Digital (managed
data-centre services consultancy). Serves multiple client organisations. Enterprise-grade aims
(competes conceptually with Hyperview for DCIM, Zendesk/ServiceNow for service desk).

**Stack:** NestJS (API) · React + Vite + MUI v5 (web) · PostgreSQL + Prisma · Docker-first monorepo.
Repo: `Assured-digital/dcim-service-mgmt`. Local dev on Windows (PowerShell — use `Select-String` /
`Get-ChildItem`, NOT grep). IDE: VS Code with the Claude Code extension.

Monorepo layout: `apps/api` (NestJS) · `apps/web` (React) · `packages/shared`. Prisma schema +
migrations under `apps/api/prisma`. Local dev via `docker-compose.yml` (Postgres 16, MinIO, api, web).

**Product surfaces** (web routes + matching `apps/api/src` modules):
- **Service Desk** (ITSM) — Service Requests, Incidents, Changes unified at `/service-desk`
  (legacy `/incidents` etc. redirect). Plus Tasks, and Risks + Issues unified at `/risks-issues`.
- **DCIM** — asset hierarchy (`/asset-hierarchy`: Site → Room → Cabinet → Asset) and flat
  `/asset-register`; Connections, Maintenance logs, Checks (+ CheckTemplates) for field work.
- **Admin** — Clients, Users (`/admin/users` org-wide, split AD-staff vs client-own; `/users`
  client-scoped), Work Packages (service scope), Audit Trail.
The API is broad: incidents, service-requests, changes, tasks, risks, issues, assets, cabinets,
sites, connections, maintenance, checks, clients, users, work-packages, request-intakes, triage,
record-links, attachments, …

## Conventions (follow these)
- **"Cabinet", never "Rack"** — in code, UI, and URLs. (A previous physical-domain term; standardised.)
- **British spelling in UI strings only** (e.g. "Organisation" in labels) — NEVER in code identifiers
  (`organizationId`, `clientId` etc. stay US-spelled, matching the schema).
- **Roles enum:** `ORG_OWNER`, `ORG_ADMIN`, `ADMIN` (legacy — never offer for new users),
  `SERVICE_MANAGER`, `SERVICE_DESK_ANALYST`, `ENGINEER`, `CLIENT_VIEWER`, `PUBLIC_USER`.
  Helpers: `apps/api/src/auth/role-scope.ts` (`isOrgSuperRole`, `isOrgOwnerRole`;
  `ORG_SUPER_ROLES = [ORG_OWNER, ORG_ADMIN, ADMIN]`). Web: `apps/web/src/lib/rbac.ts` exports
  `ROLES`, `ORG_SUPER_ROLES`, `AD_STAFF_ROLES`, `CLIENT_OWN_ROLES` + helpers `isAdStaffRole`,
  `isClientOwnRole`, `hasAnyRole` (NB: web side exposes role *arrays*, not an `isOrgSuperRole` fn).
- **User management** is restricted to org-super roles (ORG_OWNER / ORG_ADMIN / ADMIN) and (for a
  constrained subset) SERVICE_MANAGER — see the subset-management rule under Architecture.

## Claude Code prompt style (how Jake works)
- Design is agreed first (in chat), THEN a Claude Code prompt is written. Don't design-and-build blind.
- **Complete, drop-in prompts**, ~6 files max per prompt. Over-decomposed structures are disliked;
  consolidate sensibly. For wide mechanical changes, prefer a shared hook/helper + batched conversion
  over duplicating logic per file.
- **Investigation-first prompts pay off.** Several "build X" tasks turned out to be "the frontend
  already exists; only the backend drops the data" (inline title/description editing) or "the affordance
  is stubbed" (record linking). Lead investigation prompts with "how much already exists?" before
  assuming a greenfield build.
- Reference implementations to follow:
  - `RECORD_DETAIL_SPEC.md` — source of truth for detail pages: all detail pages (Incident,
    Change, SR, Task, Risk, Issue, Maintenance, Check) render the shared `RecordDetailShell` +
    `StatusPopover`; page files stay thin (compose props from queries, own mutations).
    (NB: `CheckDetailPage` is the exception — a custom page, not the shell.)
  - `apps/web/src/routes/IncidentDetailPage.tsx` — the reference *instance* of that pattern.
  - `apps/api/src/auth/request-context.ts` — the client-scope chokepoint (see Architecture).
  - `apps/api/src/users/creator.ts` + `apps/api/src/record-links/resolve-links.ts` +
    `apps/api/src/attachments/resolve-attachments.ts` — the "resolver helper" pattern: a small
    function that, given `(prisma, clientId, ...)`, resolves a projection and is spread onto a
    record's read response in each `getForClient`. Mirror this for any new per-record derived data.
  - `apps/web/src/lib/` — shared web helpers: `api.ts` (axios + x-client-id interceptor),
    `rbac.ts`, `scope.ts` (selected-client localStorage), `useAssignableUsers.ts`,
    `infrastructure.ts` (DCIM asset/cabinet/site types + UI helpers), `tickets.ts` (unified
    SR/INC/CHG shape), `linkedRecords.ts` + `attachments.ts` (record-link / attachment types +
    api helpers, consumed by shared components — see Features).
- Prompts should state constraints explicitly (what NOT to touch), especially around auth/isolation.
- For changes touching many call sites, instruct Claude Code to VERIFY each site's actual usage before
  converting (don't blind-swap) — e.g. a `["users"]` query may feed an assignee picker OR a creator-name
  lookup, which need different treatment.

## Features — record-linking & attachments (shared cross-type patterns)
Both are cross-type, clientId-scoped, and built as ONE shared module + ONE shared frontend component
set (not per-record-type duplication). When extending either, mirror the existing structure.

- **Record-links** (`apps/api/src/record-links/`): a `RecordLink` join table — many-to-many,
  bidirectional, flat/peer (no typed relationships yet — `relationType` is the additive column to add
  if/when needed). Canonical endpoint ordering collapses (A,B)/(B,A) to one row. `POST` validates BOTH
  endpoints in-scope before writing; `DELETE` clientId-scoped; `GET /record-links/search`. Resolved
  links (`ref + title + status`) attach in each `getForClient`. Frontend: shared `LinkedRecordsContent`
  + `LinkRecordDialog` + `lib/linkedRecords.ts`. Linkable types = the six work-items
  (`LINK_RECORD_TYPES`). The old single-scalar `linkedEntityType`/`linkedEntityId` fields are DEAD
  (superseded by the join table) — left in place for an additive migration; carded to drop.
- **Attachments** (`apps/api/src/attachments/`): an `Attachment` model — metadata + `storageKey` in DB,
  bytes in object storage via the `StorageService` abstraction (S3 provider live, used with local MinIO;
  Azure provider is a STUB — not yet implemented). Files stream THROUGH the API (`GET /attachments/:id`)
  with an auth + tenant re-check on every access — NO pre-signed URLs (deliberate; keeps every access on
  the client-scope chokepoint). Security policy in `attachments/content-policy.ts`: magic-byte content
  validation (client-sent Content-Type is IGNORED for the type decision), allow-list = PDF + raster
  images (PNG/JPEG/GIF/WebP), SVG REJECTED (script-carrying XSS vector), `Content-Disposition: inline`
  only for the validated allow-list, `X-Content-Type-Options: nosniff` always, 25 MB cap. Frontend:
  shared `AttachmentsContent` + `AttachmentPreviewModal` (in-app blob preview fetched WITH auth — never a
  raw `<img/iframe src>` at the endpoint — object URL revoked on close). Attachable types
  (`ATTACHMENT_RECORD_TYPES`) = the six work-items + `maintenance` + `check` (DECOUPLED from the link
  union: Maintenance/Check are attachable but NOT linkable). `maintenance` (MaintenanceLog) has no
  `clientId` — scoped indirectly via `asset.clientId` in the resolver.
- **NOT YET WIRED IN PROD:** no storage backend / `S3_*`/`AZURE_STORAGE_*` env is configured on test or
  prod container apps, so attachment UPLOAD/DOWNLOAD does not function in deployed environments (verified
  local/MinIO only). Carded. Also: Maintenance/Check attachment *frontend panels* are not yet wired
  (backend done).

## Architecture — multi-tenant client scoping (CRITICAL)
Tenant isolation is centralised in ONE place: resolveClientScope (and the shared resolveAssignedClient) in apps/api/src/auth/request-context.ts. It is called by the controllers at the request edge (reading the x-client-id header + the JWT user), and returns a validated clientId which is passed into the service methods. Services then filter every query by that clientId — list queries use where: { clientId }; detail fetches use where: { id, clientId } together (never id alone), so a record cannot be fetched cross-client by guessing its id. (One exception: assets.service.ts fetches by id then checks clientId/ownerType after the fetch — safe, but the odd one out; new code should prefer query-scoping.) Do not scatter or reinvent client-filtering logic — resolve once in the controller, filter by the passed clientId in the service.

- **Multi-client model:** users are assigned to clients via the `UserClientAssignment` join table
  (many-to-many). `User.clientId` (the old single-client scalar) has been REMOVED — do not reintroduce it.
- **Per-request resolution:** assignments are looked up per request from the join table (NOT embedded in
  the JWT). The JWT carries `userId`, `email`, `role`, `organizationId` — NOT clientId.
- **Org-super roles** (ORG_OWNER/ORG_ADMIN/ADMIN): scope comes from the `x-client-id` header (the
  frontend client selector), validated against their org. They can switch among all org clients.
- **Client-scoped roles** (SERVICE_MANAGER etc.): scope comes from their assignments. A requested client
  must be IN their assigned set, else `Forbidden("Not assigned to this client")`.

### Client selector (frontend) — TWO-STATE model
The selector is ALWAYS visible for any logged-in user; only its DATA SOURCE differs by role:
- **Org-super** -> `GET /clients` (all org clients).
- **Client-scoped** -> `GET /clients/mine` (ONLY their assigned clients — one or many).
A single-assignment user sees a one-item selector (no other options). The `x-client-id` interceptor
(`apps/web/src/lib/api.ts`) injects the selected client for ANY authed user with a selection; the backend
validates it. There is NO "hidden selector / auto-scope" special-case — do not reintroduce one.
(`GET /clients/me` still exists for the single own-client lookup; `GET /clients/mine` is the multi list.)

### User-assignment authorization (who can assign whom to which client)
- Assigning a user to clients is gated by `assertActorMayAssignClients` (users.service.ts): org-super ->
  any client in their org; client-scoped actor -> ONLY clients the actor is themselves assigned to.
- **Subset-management rule:** a client-scoped actor may MANAGE a target user only if ALL the target's
  assigned clients are within the actor's own assigned set (and the target has >=1 assignment). This
  prevents a client-scoped actor from affecting assignments for clients they have no authority over.
  Org-super manage anyone in their org.

### Assignable-users model (assignee pickers)
- `GET /users/assignable` (operational-callable — AD-staff roles, NOT admin-only, unlike `GET /users`)
  returns the assignable set for the current client scope: active AD-staff (ORG_OWNER, ORG_ADMIN, ADMIN,
  SERVICE_MANAGER, SERVICE_DESK_ANALYST, ENGINEER) in the org WHERE **(org-super OR assigned to the scoped
  client)**. So org-super users (incl. ORG_OWNER) are assignable to EVERY client; client-scoped staff only
  to clients they're assigned to. Response is minimal (`{id, displayName, email}`) — not a user-mgmt leak.
- Frontend uses the shared `useAssignableUsers()` hook (`apps/web/src/lib/useAssignableUsers.ts`) — the
  single source of truth for assignee pickers. Do NOT add raw `GET /users` queries for pickers (admin-only
  -> 403 for operational users).
- **Person display name convention:** `displayName` = `knownAs` -> `"firstName lastName"` -> `email`
  (email is the last-resort fallback for a user with no name set). Implemented in `users/creator.ts`
  (`resolveCreator`) for "Submitted by" and in `toAssignableView` for pickers. "Submitted by" sources
  from the server-resolved `createdBy: {id, displayName}` projection on the read response (NOT a
  client-side `GET /users` lookup — that 403s for operational viewers). NB: assignee pickers and
  creator both render people, but via separate code paths — a shared `UserDisplay` component is carded
  to unify them (#99). If a person renders as a raw email, that's the fallback firing (user has no name).

- **Isolation is sacred.** Any change to `resolveClientScope` / `resolveAssignedClient` MUST be
  re-verified with the spoof test (a client-scoped user sending another client's `x-client-id` must get
  403, control returns their own data). New cross-record query surfaces (record-links, attachments) MUST
  also be spoof-tested per-type — esp. indirectly-scoped types like `maintenance` (via `asset.clientId`).
  There is currently NO automated isolation test — verify manually until one exists (carded).

## Deploy & DB
- **Environments:** TEST (`rg-adsm-test`, `.github/workflows/deploy.yml`, auto-deploys on push to
  `main` — CONFIRMED working: a PR merge to `main` triggers it) -> PROD (`rg-adsm-prod`,
  `.github/workflows/deploy-prod.yml`, manual `Deploy to production` workflow with approval gate; inputs
  `api_image_tag` + `web_source_ref`). PROD promotes the test API image (test ACR -> prod ACR) and builds
  the web image fresh with the prod URL.
- Pipeline: build api + web images -> migrate job (`prisma migrate deploy`) -> deploy api + web.
- DBs are **private (VNet)** on both envs — no direct connection from Cloud Shell; DB ops run via the
  migrate container-app job. Postgres 16, Azure Database for PostgreSQL Flexible Server.
- **Local schema sync uses `prisma db push`** (the container entrypoint), NOT `migrate deploy`. So
  hand-written migration SQL files run for the FIRST time on the cloud `migrate deploy` path — a migration
  verified locally has NOT actually exercised its SQL file. Watch the migrate job on the first test deploy
  of any new migration.
- Azure ops run in browser **Cloud Shell** (`az`). Cloud Shell mangles long pastes / nested heredocs and
  loses home-dir files on reconnect (Azure resources are never lost).

### Local dev gotcha (Windows)
- **The `nest start:dev` watcher does NOT reliably pick up host bind-mount edits** on Windows. After
  editing backend code, run `docker compose restart api` before testing — otherwise the container serves
  STALE code and you get false negatives (a fix that "didn't work" / an upload that 400s). This has caused
  false-negative verification runs repeatedly; restart first, debug second.

### Deploy & migration gotchas (HARD-WON — read before deploying/migrating)
1. **No `CREATE EXTENSION` for non-allow-listed extensions.** `pgcrypto` is NOT allow-listed on Azure
   Postgres and will fail the migration. `gen_random_uuid()` is built into PG13+ CORE — use it directly,
   no extension needed. Do not let auto-generated migrations add `CREATE EXTENSION pgcrypto`.
   (Newer models prefer app-generated `@default(uuid())` — also fine, avoids the question entirely.)
2. **Failed-migration recovery (private DB):** fix the migration file, then clear the failed record via
   the migrate job — update it with a **FULL-spec YAML that INCLUDES the `env: DATABASE_URL -> secretRef
   database-url` block** (a partial YAML silently drops the env and the job fails with "DATABASE_URL not
   found"), args = `npx prisma migrate resolve --rolled-back <migration_name>`, run it, confirm "marked
   as rolled back" in Log Analytics, then RESTORE args to `migrate deploy` (full-spec YAML again).
   Pitfalls: `--args` CLI flag mangles commands; verify args+env via `job show` before running.
3. **Transient migrate failures — re-run before assuming a code problem.** The **migrate step** can
   fail transiently (a long "Running" then "Failed", not a fast SQL error). Re-run to clear. CRITICAL:
   re-run the **FULL pipeline**, not just the migrate job — a migrate-only re-run applies the migration
   but SKIPS the deploy steps, leaving the DB migrated but the app on the OLD image (DB/app mismatch).
   - **Web-build Docker Hub rate-limit is FIXED (no longer worked around).** The web base images
     (`node:20-alpine`, `nginx:alpine`) are now mirrored into BOTH ACRs (`acradsmtest01`,
     `acradsmprod01`) via `az acr import`. `apps/web/Dockerfile` declares `ARG REGISTRY=docker.io/library`
     before each `FROM` (per stage), and both deploy workflows pass
     `--build-arg REGISTRY=${{ env.ACR_LOGIN_SERVER }}`, so CI web builds pull base images from the env's
     own ACR — Docker Hub is no longer in the web-build path, so the unauthenticated pull rate-limit
     failure should no longer occur. (Local `docker build` with no `--build-arg` still defaults to Docker
     Hub — unchanged.) **If base images are ever bumped (e.g. node 20→22), re-import them into both ACRs
     FIRST**, or the build will fail to find them. Base-image tags are mutable, so periodic re-import also
     picks up upstream security patches.
4. **Always verify the running image after any deploy issue** (matches the intended commit, and both API
   AND web if the failure skipped deploy steps):
   `az containerapp show -g <rg> --name adsm-api-<env> --query "properties.template.containers[0].image" -o tsv`

## Docs in repo
- `docs/MULTI_CLIENT_ASSIGNMENT_DESIGN.md` — multi-client architecture + phased plan
  (Card A — DONE; Phases 1–5 all shipped, latest 2026-06-09: `/users/assignable` + assignee pickers).
- `RECORD_DETAIL_SPEC.md` — record detail page spec (the `RecordDetailShell` pattern; §7 covers the
  attachments + linked-records right-panel sections).
- `docs/release-readiness.md` — release checklist (open PROD blockers: rotate prod DB password,
  error-response leak check, regression sweep, load test).
- Also present: `docs/DEPLOYMENT-PLAN.md`, `docs/rbac-role-matrix-audit.md`,
  `docs/regression-sweep-checklist.md`, `docs/triage-smoke-test.md`.

## UI conventions
- Buttons inline in the tab bar (not above cards). No page titles (top-bar breadcrumb is the identifier;
  detail pages call `setRecordLabel` via `BreadcrumbContext`).
- Chip-style response buttons with tinted backgrounds; no solid colour fills on interactive elements.
- `StatusPill` fixed width so it doesn't shift on status transitions.
- Design tokens: primary `#1d4ed8`, dark navy sidebar `#0d1526`, slate/blue palette;
  Space Grotesk + Manrope typefaces.