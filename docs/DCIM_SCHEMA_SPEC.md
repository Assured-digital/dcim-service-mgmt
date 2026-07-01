# DCIM Target Schema Spec

Source of truth for the DCIM data model. Same role as `DASHBOARD_SPEC.md` / `RECORD_DETAIL_SPEC.md`: Claude Code builds migrations against this; Claude Design mocks against it.

**Governing principle:** design the schema for the *full production vision*, build only the *achievable subset* now. Every capability the module will eventually need has a home in the schema from day one, so future features **populate** fields rather than **migrate** the database. Fields are marked **[NOW]** (built and used in phase one) or **[LATENT]** (exists in schema, nullable/empty, populated by a later feature — no migration needed to switch it on).

**Non-negotiable:** every change here is **additive**. Nothing in this spec renames, drops, or repurposes an existing field. The preservation constraints in §8 are sacred.

---

## 1. What already exists (do not rebuild)

Confirmed by ground-truth investigation. The foundation is substantially built:

- **Hierarchy:** `Client → Site → Room? → Cabinet → Asset`, fully navigable (4-level tree).
- **Capacity:** `Cabinet.totalU/usedU`, `Cabinet.powerKw` (capacity), `Asset.powerDrawW` (nameplate).
- **Rack position:** `Asset.uPosition/uHeight/rackSide`; working `RackElevation` UI.
- **Connections:** asset-to-asset `Connection` model with `ConnectionStatus`.
- **Audit:** `AuditEvent` covering Asset (rich), Site, Cabinet (create).
- **Lifecycle:** `AssetLifecycleState` enum + `entityStatusIntent()` colour map.
- **Maintenance:** `MaintenanceLog` per asset.

This spec **adds to** the above. It does not touch the existing fields except where explicitly additive.

---

## 2. Spatial model — unlocks the architectural floor plan  **[the priority]**

**Design decision (updated):** the floor plan is the full **architectural view** in phase one (not just a row/position grid), validated as the industry-standard pattern (NetBox Visual Explorer, Hyperview). So the free-form coordinate layer is promoted from LATENT to **NOW** — cabinets carry real x/y positions on a room canvas, with row/position kept as the human label. The room shell comes from an uploaded plan image or a simple drawn shape, not CAD.

### 2.1 Cabinet — additive fields
```
row            String?   [NOW]     // e.g. "R3" — human label / grouping
positionInRow  Int?      [NOW]     // slot within the row, 1-based, e.g. 7 → "R3-07"
orientation    Int?      [NOW]     // rotation in degrees: 0 | 90 | 180 | 270 (default 0). Every DCIM tool has this.
posX           Float?    [NOW]     // x on the room canvas (grid units or mm). Promoted to NOW — the architectural view needs it.
posY           Float?    [NOW]     // y on the room canvas
```
- **[NOW] renderer:** the architectural floor plan places cabinets at `posX`/`posY` on the room canvas, rotated by `orientation`, over the room shell (uploaded image or drawn shape). `row`/`positionInRow` remain the human-readable label ("R3-07") and a grouping aid. A cabinet with no position falls into an "unplaced" tray (honest — never guessed).
- **Setup writes these:** the three setup paths (§2.4) all populate `posX`/`posY` — drag-and-drop plotting, quick-row (lays a row of cabinets at incrementing positions), or CSV import (row/position → derived coordinates).
- **orientation is an Int (degrees), not a compass string** — matches the NetBox 0/90/180/270 convention; the elevation/plan rotate the cabinet glyph accordingly.

### 2.2 Room — additive fields
```
widthMm        Int?      [NOW]     // room dimensions — promoted to NOW; the architectural canvas needs scale
depthMm        Int?      [NOW]
gridCols       Int?      [NOW]     // optional grid width hint for snap-to-grid
gridRows       Int?      [NOW]     // optional grid height hint
```
- Dimensions give the canvas real scale (for drawn rooms, typed directly; for uploaded plans, from calibration — calibration itself is a fast-follow).

### 2.3 Room shell — background image OR drawn shape  **[NEW model]**
The room shell is either an uploaded plan image (dimmed backdrop, plot on top) or a simple drawn shape. Store both possibilities additively on Room:
```
model Room {                          // additive fields
  shellType        String?  [NOW]     // "IMAGE" | "DRAWN" | null (no shell yet)
  backgroundImageKey String? [NOW]    // Azure Blob key for the uploaded plan image (PDF rasterised to PNG)
  backgroundOpacity Float?  [NOW]     // display opacity of the backdrop (default 0.4)
  shellShape       Json?    [NOW]     // for DRAWN: { type: "rect"|"L", points: [...] } — simple geometry, not CAD
}
```
- **[NOW]** Uploaded images cache to Azure Blob (same pattern as the planned elevation-image cache). Drawn shells store simple geometry as JSON (rectangle or L-shape points) — deliberately not a vector/CAD model.
- **No .DWG/AutoCAD/Visio import** — the heavyweight professional-services path (dcTrack/Sunbird/iTRACS). The image-backdrop approach is the lighter differentiator.

### 2.4 Aisle zones — hot/cold aisle designation  **[NEW model, NOW]**
Universal across DCIM tools; ties into cooling reasoning and the Space/Power lenses.
```
model AisleZone {                     [NOW]
  id        String  @id @default(uuid())
  roomId    String                    // FK → Room
  type      String                    // "HOT" | "COLD"
  geometry  Json                      // area on the canvas: { points: [...] } or grid-cell range
  label     String?                   // "Cold aisle 1"
  createdAt DateTime @default(now())
  // scoped via room.site.clientId (indirect — spoof-test per §8)
}
```

### 2.5 Placed infrastructure objects — CRAC / UPS / PDU on the plan  **[NEW model, NOW]**
The architectural view shows non-cabinet objects (CRACs, UPS, floor PDUs) placed on the floor. These aren't Assets-in-cabinets; they're floor-level infrastructure.
```
model FloorObject {                   [NOW]
  id          String  @id @default(uuid())
  roomId      String                  // FK → Room
  objectType  String                  // "CRAC" | "UPS" | "PDU" | "COLUMN" | "DOOR"
  posX        Float
  posY        Float
  orientation Int?     @default(0)
  label       String?
  assetId     String?                 // optional FK → Asset, if this object is also a tracked asset
  createdAt   DateTime @default(now())
  // scoped via room.site.clientId (indirect — spoof-test per §8)
}
```
- `assetId` optional link — a CRAC can be both a floor object *and* a tracked asset with maintenance/lifecycle. Placement and asset-tracking are separable.

### 2.6 Cabinet status — additive
```
status         String?   [NOW]     // cabinet lifecycle: "ACTIVE"|"PLANNED"|"DECOMMISSIONING"|"RETIRED", default "ACTIVE"
```
- Feeds the floor plan's per-cabinet Status lens. **New CabinetStatus enum** using keys the existing `entityStatusIntent()` map (§8) already resolves, so colours come for free.

### 2.7 CSV import mapping — bulk populate  **[NEW model, NOW]**
The highest-value setup path: map a spreadsheet's columns to cabinet/asset fields, preview, bulk-create. Store the mapping so re-imports are repeatable.
```
model ImportMapping {                 [NOW]
  id         String  @id @default(uuid())
  clientId   String                   // client-scoped (direct)
  name       String                   // "Cardiff rack sheet"
  targetType String                   // "CABINET" | "ASSET"
  columnMap  Json                     // { "Rack Name": "cabinet.name", "Row": "cabinet.row", ... }
  createdAt  DateTime @default(now())
}
```
- The import itself is an idempotent operation (validate rows → dedupe against existing → bulk-create), not a schema concern. The mapping is stored so a manager's recurring spreadsheet imports cleanly each time.

---

## 3. Hardware catalogue — unlocks proper asset creation + elevation imagery

Today `manufacturer`/`modelNumber` are denormalised strings on Asset. Add a real catalogue **alongside** them (strings stay, for legacy assets and free-text entry), with an optional FK so new assets can reference the catalogue and inherit its dimensions, power, and elevation image.

### 3.1 New models
```
model Manufacturer {
  id          String   @id @default(uuid())
  name        String   @unique          // "Dell", "Cisco", "APC"
  slug        String   @unique          // netbox slug, for seed matching
  deviceTypes DeviceType[]
  createdAt   DateTime @default(now())
  // NOT client-scoped — global catalogue, shared across tenants (like the check-template library pattern)
}

model DeviceType {
  id             String   @id @default(uuid())
  manufacturerId String
  manufacturer   Manufacturer @relation(fields: [manufacturerId], references: [id])
  model          String                   // "PowerEdge R740"
  slug           String   @unique         // netbox slug
  uHeight        Float?                   // nameplate U height — supports 0.5U increments (some kit is half-U)
  isFullDepth    Boolean? @default(true)  // consumes both front and rear faces — drives the rear elevation view
  powerDrawW     Float?   [LATENT]        // nameplate power, auto-fills Asset.powerDrawW on placement
  frontImageKey  String?  [LATENT]        // Azure Blob key — lazy-fetched NetBox elevation PNG
  rearImageKey   String?  [LATENT]
  partNumber     String?
  isSeeded       Boolean  @default(false) // true if from NetBox seed, false if user-created
  createdAt      DateTime @default(now())
  assets         Asset[]
  // [LATENT] port templates live here — see §6. Ports defined once on the DeviceType (template),
  //          instantiated per-Asset on placement. DeviceType is the natural home for the port layer.
  @@unique([manufacturerId, model])
}
```
- **Global, not client-scoped** — same rationale as the shared check-template/device library. A `Dell R740` is the same everywhere. (Tenant isolation still applies to *Assets*, which reference the type.)
- **Seed source:** NetBox `netbox-community/devicetype-library` (Apache 2.0). `isSeeded` distinguishes seeded from user-added so a re-seed never clobbers user entries.
- **Seeding is lazy + selective, never a bulk dump.** Do NOT load all ~30k device types into every tenant's view. The picker shows the tenant's used types first, then offers the wider library on demand; picking one lazily materialises that DeviceType (dedupe-safe on slug). This mirrors the NetBox community import script (duplicate detection + vendor-selective) but as a user-facing action, not a Python/API job. The API-based bulk seed is a one-time backend concern for the *global* catalogue, never something a manager touches.
- **Half-U support:** `uHeight` is a Float for 0.5U increments — matches the NetBox device-type schema; the elevation renderer must handle half-U blocks.
- **`isFullDepth`** drives the rear-face elevation (full-depth devices appear on both front and rear views).
- **Manual creation is first-class:** user-created DeviceTypes (`isSeeded=false`, manufacturer may be "in-house") come from a data-sheet form — this is a routine path for in-house/OT kit, not an edge case.
- **Elevation images [LATENT]:** lazy-fetch from raw GitHub on first use of a DeviceType, cache to Azure Blob, store the key. SVG-rendered elevation is the [NOW] baseline; real PNGs are progressive enhancement.

### 3.2 Asset — additive field
```
deviceTypeId   String?   [NOW]     // optional FK → DeviceType; null = free-text (legacy/manual)
deviceType     DeviceType? @relation(...)
```
- **[NOW]:** the add-asset flow gains a catalogue picker. Choosing a DeviceType auto-fills `uHeight`, `powerDrawW`, manufacturer/model strings (kept in sync for display), and unlocks the elevation image. Manual free-text entry still works — `deviceTypeId` stays null.
- Existing denormalised `manufacturer`/`modelNumber`/`uHeight`/`powerDrawW` on Asset **remain** — the catalogue *populates* them, never replaces them. Legacy assets are untouched.

---

## 4. Decommission workflow — lifecycle + capacity-freeing  **[NOW]**

A DC-manager core task the sources flag universally: retiring equipment. Distinct from deleting — it's a workflow with capacity and audit consequences. The schema mostly *exists* (`AssetLifecycleState` has RETIRED); the additions are a disposal marker and the *interim state*, plus the capacity-freeing rule (which is logic, not schema).

### 4.1 Asset — additive fields
```
disposalStatus String?   [NOW]     // null | "MARKED_FOR_DISPOSAL" | "DISPOSED" — the retire→dispose track
physicallyRemoved Boolean @default(false) [NOW]  // false = still in the rack though retired (interim state)
```
- **The "retired but still racked" interim state** is the honest model. Real DCs have a gap between *decommissioned* (logically retired) and *physically removed* (pulled from the rack). So:
  - `lifecycleState = RETIRED` + `physicallyRemoved = false` → the interim state: **freed from capacity maths, but still shown (greyed) in the elevation** until someone pulls it.
  - `physicallyRemoved = true` → gone from the rack; its U-position/rackSide clear.
- **Capacity-freeing is logic, not schema:** cabinet fill and power roll-ups must **exclude assets where `lifecycleState = RETIRED`** (regardless of `physicallyRemoved`). A retired device stops counting against the cabinet the moment it's retired — that's the space/power coming back. The elevation still *draws* it (greyed) while `physicallyRemoved = false`, but capacity treats it as gone. Keep these two truths separate: *drawn* vs *counted*.

### 4.2 The workflow (application logic, on asset detail)
1. **Retire** → set `lifecycleState = RETIRED` (frees capacity immediately), `disposalStatus = MARKED_FOR_DISPOSAL`, write AuditEvent.
2. **Physically remove** → set `physicallyRemoved = true`, clear `uPosition`/`rackSide`, write AuditEvent (removes the greyed block from the elevation).
3. **Dispose** → `disposalStatus = DISPOSED`, write AuditEvent (the compliance record of destruction/return).
- Each step is audited (the disposal audit trail managers hand to auditors). No hard-delete — retirement preserves history; the existing asset-deletion request/approve flow stays separate for genuine removal-from-records.

---

## 5. Geography above Site — [LATENT] for multi-site estates

```
model Region {                        [LATENT — schema only, no UI phase one]
  id        String  @id @default(uuid())
  clientId  String                    // client-scoped (a client's own regions)
  name      String                    // "UK South", "EMEA"
  createdAt DateTime @default(now())
  sites     Site[]
}
```
Site additive:
```
regionId  String?  [LATENT]  // FK → Region; null today, groups sites when the estate view is built
```
- Purely latent — no phase-one UI. Exists so a future multi-site estate roll-up (region → sites) needs no migration. Below-Site (Floor/Zone) is deliberately **not** added: Room already covers the operational need, and `Room.floor` (string) handles multi-floor labelling.

---

## 6. Ports & connectivity — [LATENT] layer beneath existing Connection

Today `Connection` is asset-to-asset. Cable-tracing (a differentiator, not table-stakes) needs port-level modelling. Design it now, build later.

```
model Port {                          [LATENT — schema only, no UI phase one]
  id         String   @id @default(uuid())
  assetId    String                   // FK → Asset
  asset      Asset    @relation(...)
  name       String                   // "eth0", "PSU1", "port 24"
  portType   String                   // "NETWORK"|"POWER"|"CONSOLE"|"FIBRE"
  position   Int?
  createdAt  DateTime @default(now())
}
```
Connection additive [LATENT]:
```
fromPortId String?  [LATENT]  // FK → Port; null = asset-level connection (today's behaviour)
toPortId   String?  [LATENT]
```
- **Additive & backward-compatible:** existing asset-level connections keep working (`fromPortId`/`toPortId` null). When port-level cabling is built, connections gain port endpoints without breaking the asset-level ones.
- Populating this later unlocks the connectivity/power-chain screen (deferred Phase 4 in the module spec) with no re-architecture.

---

## 6b. Monitoring & telemetry — [LATENT] skeleton for a future stage

Hyperview's core (auto-discovery, live power/environmental telemetry, health, digital twin) is a **future stage**, not phase one. Design the seam now so adding it later populates fields rather than migrating. **Nothing here is built in phase one** — these are schema hooks + preserved integration fields only.

### Preserve the existing integration seam
Asset already carries `hyperviewAssetId?` and `lastSyncedAt?` (from the original Hyperview integration intent). **Keep them** — they are the hook a future discovery/sync feature writes to. Do not repurpose or drop.

### Latent health/telemetry fields
```
model Asset {                          // additive, all [LATENT]
  healthStatus     String?   [LATENT]  // "OK"|"WARNING"|"CRITICAL"|"UNKNOWN" — populated by monitoring, null until then
  lastTelemetryAt  DateTime? [LATENT]  // when live data last arrived
  // (live time-series readings live in a separate store/table, NOT on Asset — designed when monitoring is built)
}
```
```
model SensorReading {                  [LATENT — schema stub only, no phase-one table build]
  id         String   @id @default(uuid())
  assetId    String                    // FK → Asset
  metric     String                    // "temperature"|"powerDrawW"|"humidity"
  value      Float
  unit       String
  readAt     DateTime
  // time-series; real implementation (partitioning, retention) designed when monitoring is built
}
```
- **[LATENT] rule:** `healthStatus` null = "not monitored", never rendered as a problem (same honesty rule as null passRate on the dashboard — absence of data is not a failure state).
- **UI seams (from the design brief):** the floor-plan lens toggle is built to *accept* a future "Health" lens; asset detail reserves a slot for a live-health panel; the DCIM sub-nav shows a deferred "Monitoring" item. These are structural anticipation, not built features.
- `SensorReading` is a **stub in the spec** — it documents the intended shape so the schema author knows telemetry lands in a separate time-series table (not columns on Asset), but it is not created in phase-one migrations.

---

## 7. Audit & status polish — [NOW], additive, small

Close the coverage holes the investigation flagged. All additive over the `AuditEvent` contract (§8):
- **Connection auditing:** emit `CREATED`/`UPDATED`/`DELETED` audit events (currently none).
- **Field-diff emission** on Cabinet, Room, and Asset *updates* (currently create-only or thin) — populate `data.changes = [{field,label,from,to}]` per the existing humaniser contract.
- **Room auditing:** emit create/update (currently none).
- **Site status [LATENT]:** optional `Site.status` for future "site under maintenance" states — schema only.

No new AuditEvent *shape* — only new `action` values (additive) and fuller `data.changes` payloads on existing actions.

---

## 8. Preservation constraints — SACRED (from ground-truth investigation)

Every change above is additive over these. **Do not** rename, drop, or repurpose:

1. **Tenant isolation:** `clientId` on Site/Asset/Connection/Check/ImportMapping; indirect scoping (via parent's `clientId`) on Room/Cabinet/MaintenanceLog/AisleZone/FloorObject. **Asset uses the deliberate fetch-then-check pattern** (`ownerType` INTERNAL/CLIENT asymmetry — org-super sees INTERNAL) — preserve; do NOT force into a WHERE clause. New indirectly-scoped entities (AisleZone + FloorObject via Room→Site, Port via Asset, Region direct) must be spoof-tested per CLAUDE.md.
2. **AuditEvent contract:** `{entityType, entityId, action, actorUserId, clientId, data(Json), createdAt}` immutable. `data.changes = [{field,label,from,to}]` read by the humaniser (`web/src/lib/auditEvents.ts`). New actions/fields additive only.
3. **Lifecycle colours:** `AssetLifecycleState` + `ConnectionStatus` enums; the `entityStatusIntent()` map in `colors.ts` (ACTIVE→success, STAGING→active, PROCUREMENT→warning, PLANNED/RETIRED→neutral, DEGRADED→warning) feeds every StatusPill and the rack-elevation glyphs. New status values must map to existing intents. New `CabinetStatus`/`SiteStatus` enums must use keys the intent map already resolves (or extend the map additively).
4. **Resolved-data contracts:** `Cabinet.listForSite` inlines `assets[]`+`_count`; `Site.getForClient` inlines `cabinets[]`/`assets[]`/`checks[]`; `Connection.getForClient` inlines `fromAsset`/`toAsset`. New includes are additive; don't remove or rename existing ones.
5. **`linkedEntityType`/`linkedEntityId`:** the LIVE generic parent-context pointer (Asset, Cabinet parents today). String-typed, same-named. NOT dead, NOT to be dropped. New parent types (Site, Connection, DeviceType) are opt-in additive — frontend query + backend scope-validate, no schema change.
6. **Structural relations:** Asset↔Cabinet↔Room↔Site chain; Asset↔Connection (from/to); Asset↔MaintenanceLog (Cascade); Site/Client↔Check. Keep intact.

---

## 9. Migration strategy

- **All additive** — new nullable columns, new tables, new enum values. No data migration, no backfill, no column drops. Safe on live PROD.
- **Enum additions isolated** in their own migration (Postgres `ALTER TYPE ADD VALUE` constraint — per CLAUDE.md).
- **Catalogue seed** is a separate, idempotent data step (NetBox import), not a schema migration — run after the tables exist, re-runnable, `isSeeded=true` guards user entries.
- **Order:** (1) spatial — Cabinet posX/posY/orientation/row/position/status, Room dimensions/grid/shell/background, AisleZone, FloorObject, ImportMapping, CabinetStatus enum; (2) catalogue tables + Asset.deviceTypeId; (3) Asset decommission fields (disposalStatus, physicallyRemoved); (4) Region + Site.regionId [latent]; (5) Port + Connection port FKs [latent]; (6) monitoring latent fields; (7) audit polish. Each independently deployable through TEST. Note: this is a larger phase-one spatial migration than originally scoped (the architectural-view decision promoted x/y + added shell/aisle/floor-object/import models) — still all additive, still PROD-safe, just more tables.

---

## 10. Phase-one build scope (what actually gets built on this schema)

**[NOW] — built in phase one:**
- Spatial: Cabinet `row`/`positionInRow`/`orientation`/`posX`/`posY`/`status`; Room `widthMm`/`depthMm`/`gridCols`/`gridRows`/`shellType`/`backgroundImageKey`/`backgroundOpacity`/`shellShape`; `AisleZone`, `FloorObject`, `ImportMapping` models; `CabinetStatus` enum.
- **Architectural floor plan** — room shell (uploaded image or drawn), cabinets placed at x/y with rotation, placed CRACs/UPS/PDU (FloorObject), hot/cold aisle zones, Space/Power/Status lens, find-space helper, click-cabinet → panel → elevation.
- **Floor-plan edit mode** — three setup paths (upload plan image / draw simple room / CSV import via ImportMapping), drag + snap-to-grid, quick-row, rotate, place infrastructure, designate aisle zones.
- Catalogue: Manufacturer/DeviceType tables + lazy/selective NetBox seed + add-asset picker (search+browse, confirm-auto-fill) + first-class manual device-type creation + half-U support. SVG elevation baseline.
- **Elevation** lift: colour-by selector, hover-U → add-device (catalogue pre-fill), click-device → panel → asset detail, retired-but-racked greying.
- **Asset detail** lift: persistent elevation rail (racked) / full-width (unracked); `deviceTypeId` FK + picker flow.
- **Decommission workflow**: Asset `disposalStatus`/`physicallyRemoved` + capacity-freeing logic (retired assets excluded from cabinet fill/power roll-ups) + retire/remove/dispose audit steps.
- **Register**: Linear rows + filter chips + filtered CSV export (+ audit-trail export). Export is read/format logic, no schema.
- **Find-space helper**: derives from existing U/power, no new schema.
- Audit polish (Connection/Room/field-diffs).
- Bug fix: Cabinet→Assets tab no-op wiring (copy the Elevation tab's navigate).
- Feature parity: task/risk/issue creation on Cabinet & Site pages (exists on Asset; add to the other two).

**[LATENT] — schema only, built later, no migration when we do:**
- DeviceType image keys → PNG elevations; DeviceType port-templates → the port layer.
- Region + Site.regionId → multi-site estate roll-up.
- Port + Connection port FKs → cable-tracing / connectivity-power-chain screen.
- Site.status → site maintenance states.
- Monitoring/telemetry fields + Health lens → the monitoring stage.

---

*This schema is designed for the full production DCIM vision. Phase one builds the achievable operational core (floor plan, catalogue, polish) on it; every deferred feature populates latent fields rather than migrating. All additive over the preservation constraints in §8.*