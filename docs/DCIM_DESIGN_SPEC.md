# DCIM Evolution — Design Spec
## AD Service Management Platform

This document is the single source of truth for the next evolution of the DCIM product surface:
the interactive cabinet elevation, the device-type catalogue admin area, the power & capacity
model, and the client-facing infrastructure report. It was produced from competitive research on
NetBox 4.4/4.5, Sunbird dcTrack 9.x, Device42, and Hyperview v5.6 (June 2026), reconciled against
the current schema and web code. Design decisions were agreed with Jake on 2026-07-02.

Read this entire document before writing any code. Terminology note: this platform says
**"Cabinet", never "Rack"** — in code, UI, and URLs. Competitor patterns referenced below
("rack elevation", "rack reservation") are renamed accordingly throughout.

**Relationship to the existing DCIM docs (read together):**
- `docs/DCIM_DESIGN_BRIEF.md` is the **product/UX source of truth** for the module — the six
  screens, the architectural floor plan as the hero, and the navigation model ("app within the
  app": entering DCIM auto-collapses the main nav to its icon rail and shows the DCIM sub-nav —
  Floor plan · Sites · Asset register · Catalogue · deferred Monitoring). This spec's §6.1
  Horizon-3 "floor plans" line is SUPERSEDED by the brief: the floor plan is phase-one scope
  there, with its own schema in `DCIM_SCHEMA_SPEC.md` §2 (posX/posY/orientation, room shells,
  AisleZone, FloorObject, ImportMapping).
- `docs/DCIM_SCHEMA_SPEC.md` is the target data model this spec's migration extends. Rules
  adopted from it into this spec's engineering: **retired assets are DRAWN (greyed) but not
  COUNTED** (capacity frees at retirement — implemented in computed usedU and the elevation);
  the decommission workflow (`disposalStatus`, `physicallyRemoved`) is a pending migration from
  that spec, not this one.
- What THIS spec adds beyond those docs (extensions agreed 2026-07-02): CabinetReservation
  (advisory holds), U-slot collision enforcement, the nameplate→budgeted power model +
  weight/contracted-capacity fields, the client-facing PDF report, and the elevation
  interaction detail (click-to-move, 409-override).
- The **DCIM sub-nav shell** (brief §1) is its own build prompt — reuse the existing
  nav-minimise behaviour in `Shell.tsx`; route the catalogue (§3) as a sub-nav item rather
  than a standalone `/device-catalogue` top-level entry.

---

## 0. Strategy — why these four workstreams

The platform already has: a Site → Room → Cabinet → Asset hierarchy, a 2D cabinet elevation with
lifecycle stripes (the same pattern Hyperview ships as a headline feature), a global
Manufacturer/DeviceType catalogue v1, per-client tenancy that is architecturally stronger than
Hyperview's access-policy overlay, and a native ITSM that dcTrack needs a ServiceNow connector
for. The wedge no competitor has: **DCIM + ITSM + genuine per-client tenancy in one product.**

Patterns adopted from the research:

| Pattern | Source | Where it lands |
|---|---|---|
| Click-empty-U-to-add, position prefilled | NetBox | Workstream A |
| Re-rack from the elevation (NetBox's most-complained-about gap) | dcTrack (drag) → ours (click-to-move) | A |
| Advisory reservations, mandatory name, hatched render | NetBox + dcTrack expiry | A |
| Zero-U / unplaced buckets under the elevation | Hyperview | A |
| `excludeFromUtilization` (blanking panels occupy but don't count) | NetBox v3.7 | A + B + C |
| Weight, airflow, images, part numbers on the type record | NetBox / Sunbird models library | B |
| Nameplate → budgeted (derate %) power; all capacity maths on budgeted | dcTrack (their marquee feature) | C |
| Contiguous-U free-block tracking | dcTrack capacity search | C |
| Top-10 cabinets by power, per-level dashboards | Hyperview v5.4 | C |
| Client report: power vs contracted, U vs contracted, lifecycle inventory | Colo-portal synthesis (Hyperview/Nlyte/Modius) | D |

Competitor UX gaps we deliberately exploit: NetBox cannot place or move an existing device from
the elevation; dcTrack has a two-product monitoring seam and rigid fields; Device42 is dated and
dense. Deferred (explicitly out of scope for this cycle): port/interface inventory, cable path
tracing, PDU/circuit modelling, floor plans, telemetry/measured power, IPAM.

### 0.1 Agreed product decisions

1. **Move gesture: click-to-move** (select asset → Move → valid slots highlight → click target →
   confirm chip). No drag-drop dependency in v1; `@dnd-kit` may be layered on later over the same
   validation model.
2. **Reservations are advisory** — placing into a reserved range returns `409`; the UI offers
   "Place anyway" (request retried with `overrideReservationId`) or "Release reservation".
3. **Contracted capacity is per-site** — `Site.contractedKw` + `Site.contractedU`. A per-cabinet
   allocation entity is deliberately deferred until a real contract needs it.
4. **Client report ships as PDF first** (reusing the pdfkit check-report stack); a read-only web
   view for `CLIENT_VIEWER` follows once capacity numbers are proven.

Defaults (adjustable without redesign): power derate default **60%** of nameplate
(`DCIM_DEFAULT_DERATE_PCT` env, overridable per DeviceType via `deratePct`, then per Asset);
catalogue **create** stays ENGINEER/SERVICE_DESK_ANALYST+ (the field flow in `DeviceTypePicker`
must keep working), **edit/delete/images** are SERVICE_MANAGER/ADMIN/ORG_ADMIN/ORG_OWNER;
cross-tenant usage counts ("used by 37 assets") appear only in the internal catalogue admin area;
`Cabinet.startingUnit` lands in the schema but stays dormant (default 1).

---

## 1. Foundations migration (Phase 0)

**One additive migration** carries every schema delta from workstreams A–D. All new columns are
nullable or defaulted — a pure `ADD COLUMN` migration, zero risk to existing screens, and each
workstream's UI then ships independently against columns that already exist.

> Deploy note: local dev uses `prisma db push`, so the hand-written migration SQL first executes
> on the cloud `migrate deploy` path — watch the migrate job on the first test deploy
> (CLAUDE.md, Deploy & DB).

```prisma
enum DeviceAirflow { FRONT_TO_REAR REAR_TO_FRONT SIDE_TO_REAR PASSIVE MIXED }

model Asset {
  // A — placement semantics
  isFullDepth   Boolean?               // denormalised from DeviceType at placement; null = full depth
  isZeroU       Boolean  @default(false) // zero-U tray (side-mounted PDU strips etc.); uPosition stays null
  // C — capacity
  budgetedDrawW Float?                 // budgeted watts — ALL capacity maths runs on this
  weightKg      Float?                 // denormalised from DeviceType.weightKg at placement
}

model Cabinet {
  startingUnit Int    @default(1)      // bottom U number; dormant until a real estate needs it
  maxWeightKg  Float?                  // weight capacity denominator (C)
  reservations CabinetReservation[]
}

model CabinetReservation {
  id          String    @id @default(uuid())
  cabinetId   String
  cabinet     Cabinet   @relation(fields: [cabinetId], references: [id], onDelete: Cascade)
  clientId    String    // denormalised tenancy guard — always = cabinet.site.clientId
  client      Client    @relation(fields: [clientId], references: [id])
  uStart      Int
  uHeight     Int       @default(1)
  rackSide    String?   // "FRONT" | "REAR" | null = both faces
  name        String    // mandatory — renders in the elevation block (NetBox: mandatory description)
  notes       String?
  expiresAt   DateTime? // app-side default now + 1 month (dcTrack); null = open-ended
  createdById String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([cabinetId])
  @@index([clientId, expiresAt])
}

model DeviceType {
  weightKg               Float?
  airflow                DeviceAirflow?
  category               String?        // aligns with Asset.assetType vocabulary ("Server", "Switch"…)
  excludeFromUtilization Boolean @default(false) // blanking panels / cable management
  deratePct              Int?           // per-type override of DCIM_DEFAULT_DERATE_PCT
  frontImageKey          String?        // storage object key — see §3.2 (NOT the Attachment model)
  frontImageType         String?
  rearImageKey           String?
  rearImageType          String?
  updatedAt              DateTime @updatedAt
}

model Site {
  contractedKw Float?   // D — contracted power (commercial figure, set by staff)
  contractedU  Int?     // D — contracted space
}
```

Reservation expiry needs **no cron**: every read that renders or collision-checks filters
`expiresAt == null OR expiresAt > now()` — capacity auto-frees by exclusion. Expired rows remain
listed (greyed) in the cabinet's reservations panel until deleted.

---

## 2. Workstream A — Cabinet elevation v2

### 2.1 Interactions

- **Click-empty-U-to-add.** Empty slots are hover targets with a faint `+ Add here` affordance.
  Click opens the existing `AddAssetDialog` (`InfraDialogs.tsx`) prefilled with `cabinetId`,
  `uPosition`, and `rackSide` (from the active side). The dialog's position select offers only
  feasible slots, computed client-side from the cabinet payload.
- **Click-to-move.** Selecting an asset shows a **Move** action (drawer button). The elevation
  enters move mode: valid target slots highlight green, invalid grey, reserved amber. Clicking a
  target shows a confirm chip ("Move SRV-014 to U17 front? ✓ ✗"). Candidates are pre-validated
  client-side; the server re-validates on write. Works identically for re-siding (front↔rear)
  and for pulling an asset out of the Unplaced tray into a slot.
- **Front/rear.** The FRONT/REAR toggle stays; wide panes render both faces **side by side**.
  A full-depth asset renders solid on its `rackSide` face and as a muted outlined **ghost** on
  the opposite face ("Occupied by ⟨name⟩ — front-mounted"); it collides on both faces.
- **Zero-U and Unplaced trays** render under the elevation. Zero-U assets (`isZeroU`) count
  toward power and weight but never U; Unplaced assets (in cabinet, `uPosition == null`,
  not zero-U) are the current `unrackedAssets` given a first-class home.
- **Reservations** render as hatched blocks (name + expiry tooltip) inside the elevation, with a
  reservations panel on the cabinet dashboard tab listing active + expired (greyed).

### 2.2 Collision semantics (server-authoritative)

An asset occupies U interval `[uPosition, uPosition + ceil(uHeight) − 1]` on face F. Two
placements **conflict** iff their intervals intersect AND NOT (both are half-depth on opposite
faces). `isFullDepth: null` is treated as full depth (conservative; matches the DeviceType
default). Zero-U and unplaced assets never collide.

- `assertUSlotAvailable(tx, { cabinetId, uPosition, uHeight, rackSide, isFullDepth,
  excludeAssetId })` — a pure helper in `AssetsService`, called from **both** `create` and
  `updateForClient` whenever any placement field is in play, executed inside a `$transaction`
  with the write (closes the check-then-write race; no serialisable isolation needed at this
  concurrency).
- Asset-vs-asset overlap → hard `400`, message naming the blocker
  ("U17–18 front is occupied by SRV-014").
- Reservation overlap → `409` unless the request carries `overrideReservationId` (§0.1.2).
  Reservation-vs-reservation overlap is also blocked on reservation create.
- Client mirror: `computeSlotModel()` in `apps/web/src/lib/elevation.ts` builds the same
  occupancy map from the cabinet payload for instant paint of valid/invalid targets. The server
  remains the enforcer.
- `Cabinet.usedU` becomes **computed on read** in `cabinets.listForSite`, excluding
  `excludeFromUtilization` types — the NetBox distinction between *occupancy* (collision) and
  *utilisation* (fill %). The stored column is no longer written (drop later, not now).

Known constraint: `Asset.uHeight` is `Int` while `DeviceType.uHeight` is `Float` (0.5U kit).
Half-U devices occupy a full slot for now (`ceil`); a true half-slot model is deferred. Note this
in code where the copy happens.

### 2.3 API surface (A)

| Endpoint | Notes |
|---|---|
| `POST /sites/:siteId/cabinets/:cabinetId/reservations` | New `ReservationsService`; scope via the site→client chain exactly like `CabinetsService`; validates overlap via the shared helper |
| `PATCH /sites/:siteId/cabinets/:cabinetId/reservations/:id` | Same guards |
| `DELETE /sites/:siteId/cabinets/:cabinetId/reservations/:id` | Same guards |
| `PUT /assets/:id` (existing) | **Single write path stays** — collision validation added inside `updateForClient`; no separate `/move` endpoint |
| `POST /assets` (existing) | Same validation on create; stamps `isFullDepth`/`weightKg`/`budgetedDrawW` from the DeviceType (§4.1) |
| `GET /sites/:siteId/cabinets` (existing) | `include: { reservations }` (active-filtered) + computed `usedU` |

### 2.4 Web components (A)

Extract the elevation out of `CabinetDetailView.tsx` (inline `RackElevation`, line ~56,
`RACK_U_HEIGHT = 15`) into `apps/web/src/components/elevation/`:

```
components/elevation/
  CabinetElevationV2.tsx   // frame, U rail (honours startingUnit), side-by-side layout
  ElevationAssetSlot.tsx   // current AssetSlot + ghost variant; keeps assetBg/stripeBg lifecycle stripe
  EmptySlot.tsx            // hover "+ Add here", move-mode target states (valid/invalid/reserved)
  ReservationBlock.tsx     // hatched repeating-linear-gradient on semanticTokens.warning bg/text
  ZeroUTray.tsx            // zero-U + unplaced trays
  useElevationModel.ts     // slot map, occupancy, move-mode valid-target computation
  ReservationDialog.tsx    // create/edit reservation (name required, expiry default +1 month)
```

`CabinetDetailView` keeps its tabs and drawer and shrinks. Reuse `assetBg`, `stripeBg`,
`normalizeRackSide`, `formatKw` from `lib/infrastructure.ts` and the semantic tokens from
`components/shared/tokens/colors.ts` — no new colour values.

---

## 3. Workstream B — Device-type catalogue UI

### 3.1 Route & structure

**`/device-catalogue`** (British spelling in the URL and UI, per convention). Master-detail:

- **Manufacturers rail** (left): name + device-type count; search.
- **Device-types table**: model, part number, U height, depth, nameplate W, weight, airflow,
  category, seeded badge, **usage count** (cross-tenant aggregate — internal staff eyes only).
- **Detail drawer**: full spec, front/rear images, "assets using this type", edit action for
  permitted roles.

Nav entry in `Shell.tsx` under the DCIM group. `DeviceTypePicker` gains category chips and the
richer spec line later — otherwise unchanged.

### 3.2 Images — deliberately NOT the Attachment model

`Attachment.clientId` is a required FK and the entire attachments chokepoint depends on that
invariant; DeviceType is global. **Do not weaken Attachment.** Instead DeviceType owns its image
keys directly and calls `StorageService` (already a thin provider-agnostic
`putObject/getObject/deleteObject`; the client-scoping lives in `AttachmentsService`, not the
storage layer):

- `PUT /device-types/:id/images/:face` (`face` = `front|rear`, multipart, SERVICE_MANAGER+) —
  magic-byte content validation (lift the helper from `attachments/content-policy.ts` into
  `common/`; raster images only, no SVG, same rationale as attachments), store at
  `device-types/<id>/<face>.<ext>`, save key+type on the row, delete the old object.
- `GET /device-types/:id/images/:face` — any authenticated user; bytes stream **through the API**
  (no presigned URLs, matching the attachments security posture), `X-Content-Type-Options:
  nosniff`.

Two nullable columns per face beat a join table for a strict 0..1-per-face relationship.

### 3.3 Rules

- **Delete** returns `409` when `_count.assets > 0` — the drawer shows "in use by N assets"
  instead of a delete button.
- **Seeded types** (`isSeeded`) are editable like any other (the seeder only creates, never
  updates, so edits survive re-seeds); the badge distinguishes provenance.
- **Editing a type never rewrites assets** (the denormalised-copy convention). A per-asset
  "re-sync specs from catalogue" action is a possible later addition — out of scope.

### 3.4 API surface (B)

| Endpoint | Notes |
|---|---|
| `GET /manufacturers` | with `_count.deviceTypes`; global, no `x-client-id` (existing catalogue precedent) |
| `GET /device-types` (extend) | `manufacturerId` filter + `_count.assets` |
| `GET /device-types/:id` | full record + usage count |
| `PATCH /device-types/:id` | SERVICE_MANAGER+; class-validator DTO |
| `DELETE /device-types/:id` | SERVICE_MANAGER+; 409 if referenced |
| `PUT/GET /device-types/:id/images/:face` | §3.2 |

---

## 4. Workstream C — Power & capacity

### 4.1 The nameplate → budgeted model (dcTrack pattern)

| Number | Lives | Status |
|---|---|---|
| **Nameplate W** | `DeviceType.powerDrawW` → copied to `Asset.powerDrawW` | exists |
| **Budgeted W** | `Asset.budgetedDrawW` | **new — authoritative for ALL capacity maths** |
| Measured W | telemetry | explicitly deferred; note in code comments |

At placement: `budgetedDrawW = powerDrawW × (deviceType.deratePct ?? DCIM_DEFAULT_DERATE_PCT=60)%`,
stamped onto the Asset. Thereafter it is a plain editable asset field (per-asset override,
dcTrack's "Auto Power Budget" direction without telemetry). **Editing budget does not clear
`deviceTypeId`** — budget is operational data, not a spec copy. Legacy assets get no backfill:
compute with `effectiveBudgetW = budgetedDrawW ?? (powerDrawW × 0.6) ?? 0` so history
participates without a data migration. `Cabinet.powerKw` is reinterpreted (tooltip/docs only) as
**feed capacity** — the denominator.

> Release note required: displayed cabinet power utilisation will drop to ~60% of current values
> when the maths moves from nameplate to budgeted. This is the number becoming honest, not a bug.

### 4.2 Capacity engine

`apps/api/src/dcim/capacity.util.ts` — pure and unit-tested:

- `computeUOccupancy(totalU, startingUnit, placements[])` → `{ usedU, freeU, freeBlocks:
  [{start, size}], largestContiguousU }` per face, full-depth merged, `excludeFromUtilization`
  types excluded from `usedU` (joined via `deviceTypeId` at query time) while still occupying
  slots for collision.
- Power: `budgetedKw = Σ effectiveBudgetW / 1000`; `powerPct = budgetedKw / powerKw`.
- Weight: `Σ asset.weightKg` vs `Cabinet.maxWeightKg`; renders "—" when the denominator is null.
- **Stranded flags** (dimensional imbalance, pre-telemetry): `strandedPower` when U-fill ≥ 85%
  but power ≤ 50% (power you can't sell — no space); `strandedSpace` for the inverse. Thresholds
  reuse the `barColor` 65/85 breakpoints as the single RYG vocabulary.

### 4.3 API surface (C)

| Endpoint | Notes |
|---|---|
| `GET /sites/:siteId/capacity` | per-cabinet rows + site totals; scoped through the site→client guard |
| `GET /capacity/overview` | per-site rollup via `resolveClientScope`; includes stranded-cabinet count and expiring-reservations count |

Read-only; validation is scope guards only.

### 4.4 Web (C)

- **Extract `CabinetCapacityCard`** from `RoomCabinetGrid` (`AssetHierarchyPage.tsx`) into
  `components/dcim/` — extend, don't replace. Adds weight bar, `largestContiguousU` badge,
  stranded corner flag; power bar switches to budgeted (served pre-computed). Both
  `RoomCabinetGrid` and the dashboard consume it.
- **`DcimOverviewPage` → capacity dashboard** (replaces the five count cards): KPI row (U used %,
  budgeted kW vs feed kW, stranded cabinets, expiring reservations, active assets), per-site RYG
  capacity strips, **top-10 cabinets by budgeted power** as hand-rolled sorted bars (no chart
  library — none exists in the app), drill-through to `AssetHierarchyPage`.
- **Cabinet dashboard tab**: budgeted power primary (nameplate secondary), weight card,
  largest-contiguous-block card, reservations row.
- `AddAssetDialog` / asset edit: budgeted field auto-filled with helper text
  ("60% of nameplate — adjust if known").

---

## 5. Workstream D — Client-facing infrastructure report (lightest)

- Schema: `Site.contractedKw`, `Site.contractedU` (§1); staff set them in the site-edit dialog.
- `GET /reports/infrastructure.pdf?siteId=` — `InfrastructureReportService` mirroring
  `ChecksReportService` (model assembled through clientId-scoped reads only), rendered by
  `buildInfrastructureReportPdf`, a sibling of `buildCheckReportPdf` on the existing pdfkit
  stack (`common/reporting/report-pdf.ts`).
- Contents: budgeted vs contracted kW (RYG), U used vs contracted, inventory by lifecycle state,
  asset counts by type, maintenance summary (last 90 days + upcoming `nextDueAt`), outstanding
  reservations.
- Phase 2 of D: a read-only `/infrastructure-report` web page reusing the same JSON model — the
  natural first surface for `CLIENT_VIEWER` (the "Reporting role" gap identified at Hyperview).

---

## 6. Phasing & build prompts

Dependencies: **0 → A**; **0 → B → C → D**; A and B are parallelisable after 0.

| Phase | Ships | Rationale |
|---|---|---|
| **0** | Foundations migration (§1) + collision validation + reservations API (prompt A1) | One additive migration; collision protection guards data **before** any new UI writes positions |
| **1** | A2, A3 — elevation v2 render, then interactions | Highest-leverage differentiator |
| **2** | B1–B3 — catalogue API + UI + images | Populates weight/derate/images that C's maths and A's rendering consume |
| **3** | C1–C3 — capacity engine, cabinet surfaces, dashboard | Wants B underway; its endpoints are D's data source |
| **4** | D1, D2 — PDF report, then CLIENT_VIEWER web view | Pure consumer of C; deliberately last and lightest |

Prompt decomposition (~6 files each, drop-in style):

- **A1** `schema.prisma` + migration, `assets.service.ts` (collision helper + wire-in),
  `cabinets.service.ts` (reservations include, computed usedU), `reservations.controller.ts`,
  `reservations.service.ts`, module wiring.
- **A2** `CabinetElevationV2.tsx`, `ElevationAssetSlot.tsx`, `ReservationBlock.tsx`, `ZeroUTray.tsx`,
  `useElevationModel.ts`, `infrastructure.ts` types, `CabinetDetailView.tsx` wire-up.
- **A3** `EmptySlot.tsx` click-to-add, `InfraDialogs.tsx` prefill, move mode + confirm chip,
  `ReservationDialog.tsx`, error toasts + query invalidation.
- **B1** DeviceType/manufacturers API extensions, image endpoints, MIME helper in `common/`.
- **B2** `DeviceCataloguePage.tsx`, `ManufacturerRail.tsx`, `DeviceTypeTable.tsx`,
  `lib/deviceTypes.ts`, `Shell.tsx` nav, `App.tsx` route.
- **B3** `DeviceTypeDetailDrawer.tsx`, `DeviceTypeEditDialog.tsx`, image upload widget,
  picker spec-line polish, delete-guard messaging.
- **C1** `dcim/capacity.util.ts` + unit tests, `capacity.controller.ts`, `capacity.service.ts`,
  `assets.service.ts` budget/weight stamping.
- **C2** `CabinetCapacityCard.tsx` extraction, `AssetHierarchyPage.tsx`, `CabinetDetailView.tsx`
  dashboard cards, `InfraDialogs.tsx` budget field, `infrastructure.ts`.
- **C3** `DcimOverviewPage.tsx` rebuild, `lib/capacity.ts` client helpers.
- **D1** `InfrastructureReportService`, `buildInfrastructureReportPdf`, controller, site-edit
  dialog contracted fields.
- **D2** `/infrastructure-report` page + nav + CLIENT_VIEWER gating.

### 6.1 Full-parity roadmap — beyond this cycle

The goal is a full-fledged DCIM module competitive with Hyperview/Sunbird/Device42. Workstreams
A–D are **Horizon 1**. The rest of the parity gap, sequenced by dependency (each horizon builds
on the data the previous one created):

**Horizon 2 — connectivity & placement workflow** (needs A+B data)
- **Port/interface inventory**: `PortTemplate` on DeviceType (typed, indexed — network/power/
  console, the NetBox component-template pattern with `[1-48]` range stamping) → `Port` rows
  stamped onto Assets at placement. Unlocks port-level capacity ("free 10G ports in this
  cabinet") and gives Connections real endpoints.
- **Connections v2**: terminate connections on Ports instead of bare Assets; cable type/length/
  colour; patch-panel pass-through (front→rear port mapping); **end-to-end trace view**
  (NetBox's vertical path diagram — their most-praised feature). The existing Connection model
  migrates additively (nullable `fromPortId`/`toPortId`).
- **Capacity search → Place or Reserve** (dcTrack's signature workflow): constraints in
  (contiguous U from C's freeBlocks, budgeted power headroom, port availability from this
  horizon) → ranked candidate cabinets → elevation preview → create PLANNED asset or a
  CabinetReservation. C builds the maths; this builds the workflow UI.
- **MAC work orders fused with ITSM** — our structural advantage: an install/move/decommission
  raises a Task/Change linked to the asset (record-links already exist), approval via existing
  role flows, the elevation shows PLANNED shadow state until the work order completes. dcTrack
  needs ServiceNow for this; we own both sides.

**Horizon 3 — spatial & live** (needs Horizon 2 maturity)
- **Floor plans**: cabinet x/y/rotation per Room, drag-to-place grid (Device42's approach — no
  CAD import, which is dcTrack's most-hated feature), RYG capacity overlays per metric from C's
  engine. SVG-rendered, same aesthetic as the elevation.
- **Measured power / telemetry**: the third number in the C model. Start manual/CSV (field
  readings per PDU/feed, consistent with the Checks field-work culture), then SNMP/Modbus
  polling. Unlocks true stranded-capacity (budgeted − measured) and per-client billing-grade
  usage in D's report.
- **Environmental**: temp/humidity readings per cabinet (manual first, sensors later), ASHRAE
  band compliance in the client report.
- **Client portal deepening**: CLIENT_VIEWER live dashboard (D web view grown up) — usage vs
  contracted, inventory, compliance, report downloads. Hyperview charges for this as a colo
  feature; our tenancy gives it almost free.
- **Sustainability**: kWh/carbon estimates from measured power (EU EED-driven reporting is the
  clearest new client-report requirement in the market — Schneider shipped it in 2025).

**Explicitly not on the roadmap** (poor fit for a consultancy platform): auto-discovery agents
(Device42's moat — our estates are field-managed, Checks are the data-quality mechanism), 3D
digital twin (demo candy, low operational value), IPAM/DDI (adjacent product), BMS/SCADA
integration (partner territory).

### 6.2 Constraints (state these in every build prompt)

- Do NOT touch `resolveClientScope` / `resolveAssignedClient`, the Attachment model, or the
  `x-client-id` interceptor. New endpoints follow the existing controller-resolves /
  service-filters pattern; spoof-test any new query surface.
- Manufacturer/DeviceType stay **global** (no clientId) — the §3.4 endpoints are the only
  non-scoped surface, matching the existing catalogue precedent.
- Denormalised spec copies on Asset remain authoritative for display; the catalogue populates,
  never replaces. Hand-editing manufacturer/model still clears `deviceTypeId`.
- All new UI uses existing tokens/helpers (`semanticTokens`, `assetBg`, `stripeBg`, `uFill`,
  `barColor`, `StatusPill`, `PanelCard`); British spelling in UI strings only; list pages keep
  full-bleed behaviour.
- **Dark mode is mandatory for all new UI.** The app has a full dark theme (`lib/theme.tsx`
  ThemeModeProvider; mode-aware helpers `semanticToken()`/`ragToken()`/`accentToken()` in
  `components/shared/tokens/colors.ts`). KNOWN GAP to fix in A2: `lib/infrastructure.ts`
  helpers are light-only — `lifecycleGlyphColor`/`stripeBg` read the light `semanticTokens`
  literal instead of the mode-aware `semanticToken()`, and `ASSET_TYPE_BG` + `barColor` have no
  dark variants. A2 must add dark counterparts (`ASSET_TYPE_BG_DARK`, mode-aware `assetBg`/
  `barColor`/`stripeBg` following the existing `*Dark` + byMode pattern in colors.ts) and the
  extracted elevation components must take all colours from these helpers — no inline hex.
