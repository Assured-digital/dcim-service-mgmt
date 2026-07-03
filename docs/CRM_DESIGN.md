# CRM Module — Design

**Status:** DRAFT v3 — full-lifecycle scope agreed 2026-07-03; competitive review
(`docs/CRM_COMPETITIVE_REVIEW.md`) folded in same day; no code written.
**Significance:** New product surface. Adds a full client-lifecycle CRM: presales pipeline,
contacts, activity/comms log (incl. email capture), quotes, projects, renewals, and a
Microsoft 365 layer (SharePoint documents + shared-mailbox email sync). AD-staff-only.
**Decisions (Jake, 2026-07-03):**
- Full lifecycle including presales pipeline (v1 of this doc excluded it — superseded).
- Prospect = a `Client` row with a `lifecycleStage` (NOT a separate entity).
- Clients never see any CRM surface (`CLIENT_VIEWER` fully excluded).
- Email capture: manual logging first; **shared-mailbox Graph sync** as the designed
  integration (per-user mailbox sync explicitly rejected for v1).
- SharePoint: one site, **folder per client** — Client maps to a folder path.
- Build order: foundations first (contacts → activities → pipeline → quotes → projects →
  overview/renewals → Graph layer last).
- Competitive review folded in (2026-07-03): pipeline hygiene fields, quote line items +
  versioning, renewal auto-creation, raw health signals, email correlation ladder, eager
  SharePoint folder creation. Conscious skips (Lead entity, CPQ, per-user mail sync,
  multi-client contacts, AI scoring…) documented with reasons in
  `docs/CRM_COMPETITIVE_REVIEW.md` — check there before proposing one of them.
**Branch:** `feat/crm-design` (worktree, parallel to DCIM work).

---

## 1. Purpose

Assured Digital manages long-running client relationships, but the platform only knows about
clients *after* they're won, and even then holds no relationship data. Today:

- There is no pipeline: prospective clients, live deals, and renewal risk are invisible.
- Contact knowledge (who's the decision maker, who signs off access) lives in staff heads.
- Calls / meetings / emails are unrecorded unless they happen to produce a ticket.
- Quotes are ad-hoc documents with no status or history.
- Client documents live in SharePoint with no bridge to the app; emails live in Outlook.
- `WorkPackage` holds `value`/`startDate`/`endDate` but nothing tracks renewals or groups the
  project work underneath an engagement.

The CRM closes those gaps as an **internal AD-staff tool**, so that *everything attributable to
a client — people, conversations, deals, documents, projects — is findable and workable from
one place*, layered on the existing multi-tenant architecture.

**Non-goals (explicitly out of scope):**
- Client-facing visibility. `CLIENT_VIEWER` never sees any CRM surface or endpoint.
- Per-user mailbox sync (every staff Outlook auto-synced) — rejected for v1; see §8.
- Marketing automation, campaigns, bulk email sending.
- Invoicing / payments. Quotes stop at ACCEPTED/REJECTED; finance stays elsewhere.
- Storing SharePoint file *bytes* in the app — SharePoint remains the document system of
  record; the app browses, searches, links, and opens (§8).

## 2. The client lifecycle (the spine of the design)

```
PROSPECT ──── opportunities, activities, quotes, contacts, documents
   │  (opportunity WON → work package created)
ONBOARDING ── project work package, tasks, site/asset setup
   │
ACTIVE ────── service desk, DCIM, maintenance … + ongoing CRM
   │             └─ renewal window → RENEWAL opportunity → loop
FORMER ────── offboarded; full history retained
```

`Client.lifecycleStage: PROSPECT | ONBOARDING | ACTIVE | FORMER` (default `ACTIVE` so every
existing client is unaffected by the migration).

**Why prospect-as-Client-row:** everything in the platform scopes on `clientId`. Recording a
prospect as a Client means its contacts, activities, quotes, opportunities, and documents are
scoped correctly from day one, and **winning the deal migrates nothing** — the stage flips and
the same id flows into work packages, service desk, and DCIM. A separate Prospect entity would
duplicate all scoping and need a re-parenting conversion on every win.

**Containment rules for prospects:**
- The client selector groups/labels prospects (and hides FORMER by default).
- Operational surfaces (service desk, DCIM, checks…) are unchanged — a prospect simply has no
  data there. No per-surface stage-gating in v1 (keep it simple; revisit if prospect clutter
  appears in practice).
- `GET /clients` list responses include `lifecycleStage`; the Clients admin grid gains a stage
  column + filter. Stage transitions are an ORG_SUPER/SERVICE_MANAGER edit on the client.

Renewals are lifecycle events, not just dates: when `renewalDate − noticePeriodDays − buffer`
is reached, a scheduled sweep **auto-creates an Opportunity of type RENEWAL** (+ a follow-up
Task, deduped against any open RENEWAL opportunity for that work package), so new business and
renewals share one pipeline view (§3). Stage transitions never move backwards automatically —
regression (e.g. ACTIVE → FORMER) is always a deliberate manual act.

## 3. Settled design decisions

1. **Everything is clientId-scoped and hangs off the existing `Client`.** No new tenant
   concepts. The client selector IS the account switcher; there is no separate CRM "account".
2. **Prospect = Client row** with `lifecycleStage` (§2).
3. **Contacts are NOT Users.** A `Contact` is a person *at the client* (no login, no role).
   `User` stays untouched. A contact MAY reference a portal user via optional `userId`
   (display-only convenience).
4. **Pipeline = `Opportunity` model.** Stages `DISCOVERY → QUALIFIED → PROPOSAL → NEGOTIATION →
   WON | LOST`; types `NEW_BUSINESS | RENEWAL | EXPANSION`. A won opportunity is what spawns a
   WorkPackage. Quotes attach to opportunities via optional `opportunityId`.
5. **Contracts = WorkPackage, extended — not a new entity.** WorkPackage already models the
   engagement (value, dates, type, `WP-` reference). Additive renewal fields (`renewalDate`,
   `noticePeriodDays`, `autoRenews`, `commercialNotes`); no parallel `Contract` model.
6. **Projects = WorkPackage detail, not a new entity.** `type: PROJECT` already exists. The
   missing piece is connective tissue: Tasks group under a work package via the existing
   generic parent-context pointer (`linkedEntityType: "work_package"` — same live mechanism as
   asset/cabinet-linked tasks), plus a WorkPackage detail page that becomes the project
   workspace (tasks, progress, commercial fields, documents) (§7).
7. **Follow-ups reuse Tasks.** "Raise follow-up" on an activity creates a `Task` with
   `linkedEntityType: "crm_activity"` — provenance for the CRM, the full existing task
   lifecycle (assignee, due date, filters) for free.
8. **Email capture is two-tier:** manual "log email" activity from day one; **shared-mailbox
   Graph sync** as the integration phase (§8). Synced and manual entries land in the same
   `Activity` timeline, distinguished by `source`.
9. **SharePoint is the document system of record; the app is the window.** One site, folder per
   client (`Client.sharePointFolderPath`). Graph-powered browse/search in-app, open-in-SharePoint
   to work. The existing `DocumentReference` model (clientId + title + url + docType + generic
   parent context — already in schema, `apps/api/src/documents/`) becomes the pin/link layer
   for "this file matters to this record". No file bytes duplicated into the app.
10. **Quote detail uses `RecordDetailShell`** (per `RECORD_DETAIL_SPEC.md`) — quotes have a
    status lifecycle, attachments, details panel. Opportunity detail likewise fits the shell.
    Contacts (rolodex), activities (timeline), and pipeline (board) do NOT use the shell.
11. **Attachments extend the existing union; record-links do not (yet).** `quote` (and later
    `opportunity`) join `ATTACHMENT_RECORD_TYPES`. `LINK_RECORD_TYPES` stays the six work-items
    in v1.
12. **AD-staff-only, two write tiers.** All CRM endpoints exclude `CLIENT_VIEWER`. Commercial
    writes (opportunities, quotes, renewal fields, lifecycle transitions) = ORG_SUPER +
    `SERVICE_MANAGER`; relationship writes (contacts, activities) = all AD-staff; reads = all
    AD-staff (open question §11.2 on hiding values from ENGINEER).

## 4. Data model

Additive migration only — new tables, plus new columns on `Client` and `WorkPackage`.

```prisma
// Client — ADDITIVE columns:
//   lifecycleStage        String  @default("ACTIVE") // PROSPECT | ONBOARDING | ACTIVE | FORMER
//   sharePointFolderPath  String?                    // folder within the org SharePoint site

model Contact {
  id        String   @id @default(uuid())
  clientId  String
  client    Client   @relation(fields: [clientId], references: [id])
  firstName String
  lastName  String
  jobTitle  String?
  email     String?  // match key for email sync — see §8
  phone     String?
  mobile    String?
  siteId    String?  // optional: primarily based at this site
  site      Site?    @relation(fields: [siteId], references: [id])
  category  String   @default("GENERAL") // DECISION_MAKER | TECHNICAL | BILLING | OPERATIONS | ACCESS | GENERAL
  isPrimary Boolean  @default(false)
  userId    String?  // optional link to a portal User (display-only)
  notes     String?
  status    String   @default("ACTIVE")  // ACTIVE | INACTIVE
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  activities    ActivityContact[]
  quotes        Quote[]
  opportunities Opportunity[]

  @@index([clientId, status])
  @@index([email]) // cross-client lookup for email-sync matching
}

model Activity {
  id          String    @id @default(uuid())
  clientId    String
  client      Client    @relation(fields: [clientId], references: [id])
  type        String    // CALL | MEETING | EMAIL | SITE_VISIT | NOTE
  source      String    @default("MANUAL") // MANUAL | EMAIL_SYNC
  subject     String
  body        String?
  occurredAt  DateTime  @default(now())
  emailMessageId String? @unique  // Graph internetMessageId — dedupe for synced mail (§8)
  createdById String?   // AD staff who logged it (null for EMAIL_SYNC)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  contacts ActivityContact[]

  @@index([clientId, occurredAt])
}

model ActivityContact {
  activityId String
  activity   Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  contactId  String
  contact    Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@id([activityId, contactId])
}

model Opportunity {
  id                String    @id @default(uuid())
  clientId          String
  client            Client    @relation(fields: [clientId], references: [id])
  reference         String    @unique            // OPP-YYYY-NNNN (mirror WP- generator)
  title             String
  type              String    @default("NEW_BUSINESS") // NEW_BUSINESS | RENEWAL | EXPANSION
  stage             String    @default("DISCOVERY")
  // DISCOVERY | QUALIFIED | PROPOSAL | NEGOTIATION | WON | LOST
  lastStageChangeAt DateTime  @default(now()) // stamped on every stage change → rotting flags,
                                              // time-in-stage reporting
  probability       Int?      // % — defaulted from stage on stage change, editable per-deal;
                              // weighted pipeline = Σ(value × probability)
  value             Float?
  currency          String    @default("GBP")
  expectedCloseDate DateTime?
  nextStep          String?   // pipeline hygiene: a deal with no future-dated next step is
  nextStepDate      DateTime? // by definition stalled
  ownerId           String?   // AD staff owner (assignable-users pattern)
  contactId         String?
  contact           Contact?  @relation(fields: [contactId], references: [id])
  workPackageId     String?   // set on WON → the resulting engagement
  renewsWorkPackageId String? // for type RENEWAL: the WP being renewed (also the dedupe key
                              // for the renewal sweep: one open RENEWAL opp per WP)
  lostReason        String?   // REQUIRED on LOST — managed picklist:
                              // PRICE | COMPETITOR | NO_DECISION | TIMING | SCOPE | RELATIONSHIP
  lostDetail        String?   // optional free text
  notes             String?
  createdById       String
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  quotes Quote[]

  @@index([clientId, stage])
}

model Quote {
  id            String    @id @default(uuid())
  clientId      String
  client        Client    @relation(fields: [clientId], references: [id])
  reference     String    @unique              // QUO-YYYY-NNNN
  title         String
  description   String?
  status        String    @default("DRAFT")    // DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED | WITHDRAWN
  version       Int       @default(1)          // revise-as-new-version (Dynamics pattern):
  revisedFromId String?                        // revising a SENT quote marks it WITHDRAWN and
                                               // clones a new DRAFT v+1; one live version at a time
  isPrimary     Boolean   @default(true)       // the quote whose value feeds the opportunity
  value         Float                          // DERIVED: Σ line totals (denormalised for lists)
  currency      String    @default("GBP")
  validUntil    DateTime?
  contactId     String?
  contact       Contact?  @relation(fields: [contactId], references: [id])
  opportunityId String?
  opportunity   Opportunity? @relation(fields: [opportunityId], references: [id])
  workPackageId String?                        // set on acceptance
  sentAt        DateTime?
  decidedAt     DateTime?
  notes         String?
  createdById   String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  lineItems QuoteLineItem[]

  @@index([clientId, status])
}

model QuoteLineItem {
  id          String  @id @default(uuid())
  quoteId     String
  quote       Quote   @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  description String
  quantity    Float   @default(1)
  unitPrice   Float
  // line total = quantity × unitPrice, computed; quote.value = Σ line totals.
  // NO product catalogue in v1 — free-text lines (see competitive review: CPQ skipped).
  sortOrder   Int     @default(0)
}

// WorkPackage — ADDITIVE columns (the "contract layer"):
//   renewalDate        DateTime?
//   noticePeriodDays   Int?
//   autoRenews         Boolean @default(false)
//   commercialNotes    String?
```

**Lifecycles enforced server-side:**
- Quote: `DRAFT → SENT → ACCEPTED | REJECTED | EXPIRED | WITHDRAWN`; illegal jumps rejected.
  Post-DRAFT quotes are read-only; "revise" withdraws the current version and clones a new
  DRAFT (`version + 1`, `revisedFromId` set). `value` recomputed from line items on every
  line write; the `isPrimary` quote feeds the opportunity's value display.
- Opportunity: forward through stages, direct-to-LOST from any open stage; every stage change
  stamps `lastStageChangeAt` and re-defaults `probability` from the stage map. LOST requires
  `lostReason` (picklist). WON requires a confirmation step that offers "create Work Package"
  (pre-filled from opportunity/primary quote — sets `workPackageId`; also flips a PROSPECT
  client to ONBOARDING, prompted not automatic).
- On ACCEPTED quote inside an open opportunity, prompt to advance the opportunity.
  Human-driven prompts, not triggers — with ONE exception: the renewal sweep (§2, §9 phase 6),
  which auto-creates RENEWAL opportunities. Lifecycle stages never auto-downgrade.

**Deletion policy:** contacts soft-delete via `status`; activities have NO delete endpoint (a
log you can delete isn't a log — edit by author + org-super only); DRAFT quotes may be
hard-deleted, post-SENT becomes `WITHDRAWN`; opportunities never delete, they LOSE.

## 5. Tenant isolation (the critical bit)

Nothing novel — the point is to change nothing about the pattern:

- Every controller resolves scope via `resolveClientScope` (`auth/request-context.ts`) and
  passes `clientId` into the service. Lists `where: { clientId }`; details
  `where: { id, clientId }` — never `id` alone.
- `ActivityContact` writes validate BOTH endpoints belong to the resolved `clientId` (mirror
  the record-links both-endpoints check). Same for `quote.opportunityId`,
  `opportunity.workPackageId` / `renewsWorkPackageId`, `contact.siteId` — every cross-reference
  validated in-scope on write.
- Email-sync matching (§8) is the one place that reads `Contact.email` ACROSS clients — it runs
  as a system job, not a user request, and writes each Activity under the matched contact's own
  clientId. No user-facing endpoint ever queries cross-client.
- **Spoof test per new endpoint before merge** (client-scoped user + foreign `x-client-id` →
  403), same as the record-links/attachments discipline. `resolveClientScope` itself is NOT
  touched.

## 6. Backend modules

Standard NestJS shape (mirror `work-packages/`): controller (edge scope resolution + role
guards) → service (clientId-filtered Prisma) → dto.

- `apps/api/src/contacts/` — `GET /contacts` (filters: status/category/siteId), `GET /:id`,
  `POST`, `PATCH /:id`. Read + write: AD-staff.
- `apps/api/src/activities/` — `GET /activities` (filters: type/source/contactId/date range),
  `GET /:id`, `POST`, `PATCH /:id` (author or org-super). `POST /activities/:id/follow-up` →
  Task with `linkedEntityType: "crm_activity"`. Read response spreads `resolveCreator` +
  resolved contact names (the resolver-helper pattern).
- `apps/api/src/opportunities/` — `GET /opportunities` (filters: stage/type/ownerId), `GET /:id`,
  `POST`, `PATCH /:id` (incl. stage transitions), `POST /opportunities/:id/work-package` (WON
  path). Write: ORG_SUPER + SERVICE_MANAGER; read: AD-staff. `OPP-` reference generator.
- `apps/api/src/quotes/` — `GET /quotes`, `GET /:id`, `POST`, `PATCH /:id` (lifecycle-validated),
  `PUT /quotes/:id/line-items` (replace-set while DRAFT; recomputes value),
  `POST /quotes/:id/revise` (withdraw + clone next version), `POST /quotes/:id/work-package`.
  Write: ORG_SUPER + SERVICE_MANAGER; read: AD-staff. `QUO-` generator.
- **CRM sweep job** (one scheduled job, not three): nightly pass that (a) creates due RENEWAL
  opportunities (`renewalDate − noticePeriodDays − 14d buffer`, deduped on
  `renewsWorkPackageId`), (b) flags stalled opportunities (days-in-stage over per-stage
  threshold OR `nextStepDate` in the past) and (c) flags SENT quotes unanswered past
  `validUntil` → each emits a Task for the owner. Mirrors the Zendesk/Freshdesk "time-based
  automation" pattern; new nudge types join this job rather than spawning bespoke schedulers.
- `clients/` — additive: `lifecycleStage` + `sharePointFolderPath` on DTOs; stage transition =
  PATCH gated ORG_SUPER + SERVICE_MANAGER.
- `work-packages/` — additive: renewal fields on DTO; `GET /work-packages?renewingBefore=<date>`
  filter; `GET /work-packages/:id` read response gains task rollup (via the parent-context
  pointer) for the detail page.
- `tasks/` — no schema change; `linkedEntityType` gains accepted values `"crm_activity"` and
  `"work_package"` (validation list + list-filter labels).
- `record-links/resolve-links.ts` — add `"quote"` (and `"opportunity"` when its detail ships) to
  `ATTACHMENT_RECORD_TYPES`; frontend mirror in `lib/attachments.ts`. `LINK_RECORD_TYPES`
  untouched.
- **Graph layer (§8):** `apps/api/src/msgraph/` (auth + client wrapper), consumed by
  `documents/` (SharePoint browse/search) and a `mail-sync/` job module.

## 7. Frontend

New nav section **"CRM"** in `Shell.tsx` (client-scoped sections), gated `AD_STAFF_ROLES`,
between Service Management and DCIM. Lazy-loaded routes in `App.tsx` under `RequireRoles`.
Shared types/helpers in `apps/web/src/lib/crm.ts` (Contact/Activity/Opportunity/Quote types,
status/stage/category visual maps, api helpers) — mirroring `infrastructure.ts` / `tickets.ts`.

- **`/crm`** — Account overview for the selected client: lifecycle stage, primary contact card,
  open opportunities, recent activity, open quotes, next renewal, pinned documents — plus two
  **raw health signals** we already own the data for: *days since last activity* and *open
  incidents / SLA breaches* (deliberately raw numbers, NOT a composite health score — see
  competitive review). The de-facto "client detail page" — the selector picks the account.
  KPI-card style per the DCIM visual system.
- **`/crm/pipeline`** — Opportunity board (columns = stages with count + value + **weighted
  value** headers; cards = value/owner/close date/next step, **rotting badge** when
  days-in-stage exceeds the stage threshold) + list toggle. NB: the board reads across the *selected client*; an org-wide all-clients
  pipeline is the natural end state but cuts across client scope — it follows the org-wide-read
  pattern (`/admin/users`-style, org-super + SERVICE_MANAGER) as a later increment (§11.5).
- **`/crm/opportunities/:id`** — `RecordDetailShell` detail: stage popover, value/dates panel,
  linked quotes, activities, WON → create-WP action.
- **`/crm/contacts`** — full-bleed list (`setPageFullBleed(true)`), category chips, create/edit
  drawer (mirror `ClientFormDrawer`), primary-contact star.
- **`/crm/activity`** — timeline (newest first), type/source filter chips, "Log activity" inline
  in the tab bar, quick-log drawer, per-entry "Raise follow-up". Synced emails render with an
  email glyph + source badge in the same feed.
- **`/crm/quotes`** + **`/crm/quotes/:id`** — list + shell detail (`StatusPopover`,
  `AttachmentsContent` for the quote PDF, line-items table (editable while DRAFT), version
  chain, details panel, linked opportunity/WP).
- **Reports (the high-value five, phase 6+):** pipeline by stage (count/value/weighted),
  forecast by close-date period, stalled + close-date-pushed deals, **renewals due next 90
  days**, win/loss with reason breakdown. Explicitly skipped: leaderboards, quotas,
  pipeline-coverage ratios (need a sales team, not 1–3 people).
- **`/crm/documents`** — SharePoint browser for the client's folder (§8): tree + search,
  open-in-SharePoint, "pin to record" (creates a `DocumentReference` with parent context).
- **Work package detail page** (`/work-packages/:id`) — the project workspace: description,
  commercial + renewal fields, task list (grouped via parent context, "add task" pre-linked),
  % complete, pinned documents. Serves both PROJECT and MANAGED_SERVICE types.
- **Clients admin grid** — stage column + filter; client selector groups prospects, hides
  FORMER by default.

## 8. Microsoft 365 layer (SharePoint + email)

Both ride **Microsoft Graph** and share one setup: an Entra app registration in the AD tenant,
credentials via the container app's managed identity where possible (mirroring the storage
pattern — and the same gotcha applies: `AZURE_CLIENT_ID` must be set explicitly, deploy gotcha
#5). Config out-of-band like all env (deploy gotcha #6).

### SharePoint documents (folder-per-client, one site)
- `Client.sharePointFolderPath` maps each client to its folder in the org document library.
  Admin sets it on the client record (with a "browse to pick" affordance later). Folders are
  created **eagerly** when the mapping is set (or at client creation once the integration is
  live), named by client name + stable short id — NOT lazily on first visit with GUID-suffixed
  names (Dynamics 365's documented wart; see competitive review).
- **SharePoint permissions are never the tenant boundary.** CRM document surfaces are
  AD-staff-only by our RBAC; delegated auth additionally means SharePoint enforces its own
  per-user permissions underneath. Neither layer substitutes for the other.
- **Delegated auth** (auth-code flow, each staff user's own M365 identity): SharePoint
  permissions are respected per-user — the app can never show a staff member a document
  SharePoint itself wouldn't. Token acquisition on the API (`msgraph/` module), refresh tokens
  server-side; the frontend never touches Graph directly.
- Capabilities: browse the client folder (Graph drive items), search within it, open in
  SharePoint/Office online (link-out — files are *worked on* in Office, not re-implemented
  in-app), pin files to records via `DocumentReference` (title/url/docType + parent context).
- The app stores paths/ids/links only — never file bytes. Existing `Attachment` streaming stays
  for record-level artefacts the app owns (photos, quote PDFs); SharePoint is for the client
  document estate. The two coexist by purpose.

### Shared-mailbox email sync
- One dedicated mailbox (e.g. `crm@…`). Staff **BCC** it on outbound client email; **forward**
  inbound emails worth recording. Known limitation, accepted: it captures what staff choose to
  capture — deliberate, low-noise, tiny build. (Per-user full-mailbox sync = rejected
  alternative: OAuth per staff mailbox, big build, serious noise/privacy filtering problem.
  Revisit only if BCC discipline fails in practice.)
- App registration gets `Mail.Read` **application** permission constrained by an Exchange
  **application access policy** to ONLY that mailbox — the app cannot read any other mail.
- Sync job (polling via Graph delta query; change-notification webhook as a later optimisation)
  reads new messages and correlates via a **ladder, most→least reliable** (the Dynamics
  server-side-sync pattern): (1) `[QUO-…]`/`[OPP-…]`-style reference token in the subject →
  pin to that specific record; (2) Graph `conversationId` matches a previously-synced thread →
  same client/record (survives subject edits); (3) sender/recipient addresses match
  `Contact.email` → the contact's client. Creates `Activity(type: EMAIL, source: EMAIL_SYNC)`
  — deduped on `internetMessageId`. Multiple matched contacts on one client → one activity,
  several `ActivityContact` rows. Optional cheap add: per-opportunity plus-address
  (`crm+opp-2026-0001@…`) for deal-scoped BCC.
- **No match → triage queue** (small admin view: assign to client/contact in one click, or
  create the missing contact from the email address — a contact-discovery loop).
- Stores subject + body preview + participants; original stays in Exchange (link-out to the
  message). Attachment ingestion from emails: NOT in v1.

## 9. Phased build plan

Each phase independently shippable and ~prompt-sized (≤6 files). Foundations first; the Graph
layer is deliberately LAST — everything before it works with zero external dependencies.

1. **Lifecycle + Contacts** — Client additive migration (`lifecycleStage`,
   `sharePointFolderPath` — added now so it's one client migration, used in phase 7), Contact
   migration + module, `/crm/contacts` page + drawer, CRM nav section + routes, stage
   column/filter on Clients grid + selector grouping. *Proves the whole vertical.*
2. **Activity log** — Activity + ActivityContact migration (incl. `source`/`emailMessageId`,
   dormant until phase 7), activities module, timeline page, follow-up→Task wiring
   (`crm_activity` parent context).
3. **Pipeline** — Opportunity migration + module (incl. hygiene fields: `lastStageChangeAt`,
   `probability`, `nextStep`/`nextStepDate`, loss-reason picklist enforced on LOST),
   `/crm/pipeline` board (weighted headers, rotting badges) + list, opportunity shell detail
   page, WON → create-WP flow (incl. ONBOARDING prompt).
4. **Quotes** — Quote + QuoteLineItem migration + module + lifecycle (incl. line-item
   endpoints and revise-as-new-version), list + shell detail, `ATTACHMENT_RECORD_TYPES` +
   attachments resolver extension, link to opportunity.
5. **Projects** — WorkPackage additive migration (renewal fields), WP detail page (task
   grouping via `work_package` parent context, % complete, commercial panel), task-side
   validation/filter labels.
6. **Account overview + renewals + sweep** — `/crm` overview page (incl. raw health signals);
   renewals panel (`renewingBefore`); the **CRM sweep job** (auto-create RENEWAL
   opportunities, stalled-deal + stale-quote nudge Tasks); first reports (pipeline by stage,
   renewals due 90 days).
7. **M365 layer** — 7a: `msgraph/` module + delegated auth + `/crm/documents` SharePoint
   browser (eager folder creation) + DocumentReference pinning. 7b: shared-mailbox sync job
   (correlation ladder) + unmatched-email triage view. (7a and 7b are separately shippable;
   both need the Entra app registration first — an ops task, not a code task.)

**Carded follow-ons (post-v1, from the competitive review):** onboarding task-checklist
templates applied on WON→ONBOARDING (natural extension of the CheckTemplates pattern);
remaining reports (forecast by period, win/loss breakdown); lightweight side-conversation
threads docked to records; multi-client contacts if per-client duplication proves painful.

## 10. Verification

- Spoof test each new endpoint type (contacts, activities, opportunities, quotes, follow-up
  creation, documents browse) — §5.
- Lifecycle enforcement: illegal quote/opportunity transitions rejected server-side; LOST
  without a picklist reason rejected; revising a SENT quote withdraws it and yields v+1.
- Sweep idempotency: running the CRM sweep twice creates ONE renewal opportunity per work
  package and does not duplicate nudge Tasks.
- Follow-up task appears in task lists filtered by parent context; the activity shows it.
- Quote attachment: upload/preview/download via existing streamed path; content-policy
  untouched (PDF already allow-listed).
- Email sync: dedupe on re-poll (same `internetMessageId` twice → one activity); unmatched mail
  lands in triage, never auto-attached to a wrong client; access policy verified by attempting
  to read a non-CRM mailbox (must fail).
- SharePoint: a staff user without SharePoint permission on a folder sees Graph's denial, not a
  bypass (delegated auth property).
- Migrations run for real on cloud `migrate deploy` first — watch the migrate job on first test
  deploy of each phase (local `db push` doesn't exercise the SQL files).

## 11. Open questions (decide before the relevant phase)

1. **Contact categories** — `DECISION_MAKER | TECHNICAL | BILLING | OPERATIONS | ACCESS |
   GENERAL` the right starter set? (Free-text rejected: unfilterable.) *(Phase 1)*
2. **Should ENGINEER see opportunity/quote values?** Current design: yes (read = all AD-staff).
   If commercial figures are sensitive, restrict commercial reads to ORG_SUPER +
   SERVICE_MANAGER. *(Phases 3–4)*
3. **Opportunity stage names** — `DISCOVERY / QUALIFIED / PROPOSAL / NEGOTIATION` match how AD
   actually sells? Rename freely before phase 3; migrating stage names later is annoying.
4. **Renewal window** — how far out should the renewals panel look / prompt a RENEWAL
   opportunity? (Draft: 90 days; `noticePeriodDays` overrides where set.) *(Phase 6)*
5. **Org-wide pipeline view** — all-clients board for ORG_SUPER + SERVICE_MANAGER (the
   `/admin/users`-style org-wide-read pattern). Wanted at phase 3, or a later increment?
6. **Entra app registration ownership** — who creates it and grants admin consent in the AD
   M365 tenant (needed before phase 7; delegated scopes for SharePoint + `Mail.Read`
   application permission + Exchange application access policy for the shared mailbox).
7. **Shared mailbox address** — e.g. `crm@assureddigital.co.uk`; needs creating in M365 before
   phase 7b.
