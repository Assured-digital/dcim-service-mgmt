# DCIM Module — Feature & Flow Brief

The design brief for the DCIM module of ADSM. This is the *product/UX plan* — what the module does, its screens, and how they connect — written to be taken into Claude Design as the brief to mock against. The technical data model lives separately in `DCIM_SCHEMA_SPEC.md`; the original seven-screen "full vision" lives in `DCIM_MODULE_SPEC.md` and is now the *reference*, superseded for build scope by this brief.

---

## 1. What this is

A DCIM (Data Centre Infrastructure Management) module that lets **data-centre managers manage their DCs effectively** — see the estate, find and manage assets, understand what's in each cabinet, track space and power, and act on problems. Its edge over pure-DCIM competitors (dcTrack, Sunbird, Hyperview, iTRACS) is **integration with the service desk and checks already in ADSM**: an asset on the floor links to the incidents raised against it, the checks run on it, the tasks to fix it. The competitors are stronger at deep modelling; ADSM wins on being *operationally connected* and *fast to stand up* — no CAD imports, no professional-services engagement.

**Scope stance:** achievable production, not feature-parity. Build the operational core well — including a full architectural floor plan (validated as the industry-standard pattern, matching NetBox Visual Explorer / Hyperview) — and defer only the heavy modelling (capacity what-if, cable-tracing, live telemetry) that DC managers don't need day-one. Deferred features are designed for in the schema (latent) so they're additive later. Note: the floor plan grew from a simple row/position grid into the full architectural view during design (walls/shell, placed CRACs/UPS, rotation, hot/cold aisle zones) — this is a deliberate, eyes-open scope increase because the floor plan is the hero and the competitive centrepiece; it means a longer build runway before the hero ships.

**Design language:** one coherent language across all six screens, consistent with the recently-rebuilt operational dashboard — calm-by-exception (colour means something, neutral at rest), dense but readable, sentence-case, minimal chrome, breadcrumb-as-identifier. The module should feel like one thing, and like the rest of ADSM.

**Quality bar — Hyperview's management layer.** The target for feel and completeness is Hyperview's *management and 2D-floor-plan UX* — clean, fast to stand up, no professional services, self-serve catalogue. Explicitly **not** Hyperview's auto-discovery / live-telemetry / digital-twin engine (see monitoring, below). Match how well Hyperview lets a manager see assets, space, power, and the floor; don't try to match its network-integrated monitoring.

**Navigation — DCIM as an "app within the app."** DCIM has enough internal surface to warrant its own navigation world. Entering DCIM **auto-collapses the main app nav to its existing icon rail** (reusing the nav-minimise behaviour already built — not a new nav system) and shows a **DCIM sub-nav panel** beside it: Floor plan · Sites · Asset register · Catalogue, plus a visibly-deferred "Monitoring" item under a "later" heading. The icon rail keeps every module one click away (cross-module movement is the ITSM-integration edge — a manager jumps from a hot cabinet to its incident). Built for DCIM only; the other modules keep their current nav until separately migrated. Leaving DCIM restores the prior nav state.

**Monitoring — designed for, not built.** Live power/environmental telemetry, auto-discovery, health status, sensor feeds (Hyperview's core) are a **future stage**, not phase one. Build the *skeleton* only: the schema carries latent telemetry/health fields (see `DCIM_SCHEMA_SPEC.md`); the UI leaves seams — a deferred "Monitoring" nav slot, a floor-plan lens toggle designed to accept a future "Health" lens, an asset-detail slot where a live-health panel would sit, and the existing `hyperviewAssetId`/`lastSyncedAt` fields as the integration hook. Zero monitoring is built now; adding it later populates latent fields and fills reserved seams rather than re-architecting.

---

## 2. Goals

- A DC manager can **browse the estate spatially** — site → room floor plan → cabinet → asset — and always know where they are.
- A DC manager can **find any asset fast** — search/filter across the whole estate, not just by browsing.
- **Space and power at a glance** — per cabinet and per room: how full, how much power headroom, what's where.
- **Accurate asset data with low effort** — a catalogue picker auto-fills device dimensions/power so data quality doesn't depend on hand-typing.
- **Operationally connected** — from any asset/cabinet/site, see and create the linked tickets, checks, risks, and issues.
- **Stands up without services** — a manager populates a floor plan themselves via one of three paths (upload a plan image and plot on it, draw a simple room, or bulk-import from a spreadsheet), no CAD, no consultant. CSV import turns the estate's existing rack spreadsheet into a populated floor in one step.
- **Manages the full asset lifecycle** — including a proper decommission workflow: retire a device, free its U-space and power budget back to the cabinet, mark it for disposal, keep the audit trail. Retired-but-not-yet-removed devices are an honest interim state.
- **Reports for compliance/audit** — filtered CSV export of the register (asset inventory) and audit trail, the artefacts managers hand to auditors. (Full analytics/trend reporting is the separate `/analytics` surface, deferred.)
- **Finds space for new kit** — a light capacity-finder on the floor plan highlights cabinets with enough free U (and power headroom) for a new device. The basic version of capacity planning; the full what-if modeller is deferred.

## 3. Non-goals (this version)

- **Capacity / what-if planner** — drag-and-drop scenario modelling, intelligent placement search. A differentiator, not table-stakes; deferred. (Schema-latent.)
- **Cable-tracing / port-level connectivity** — visual trace routes, patch-panel modelling. Needs the latent Port layer; deferred.
- **Live environmental/power telemetry** — real PDU/UPS/sensor feeds, temperature heatmaps. Power is modelled from nameplate only. A separate product concern.
- **Multi-site estate roll-up (region view)** — schema-latent; not a phase-one screen.
- **3D visualisation** — explicitly a presentation "wow factor", not daily ops. Not built. (The 2D architectural floor plan IS phase one.)
- **.DWG / AutoCAD / Visio import** — the heavyweight, professional-services-led import that dcTrack/Sunbird/iTRACS rely on. We deliberately use a lighter on-ramp (plan *image* upload, not CAD) — this is the differentiation, not a gap.

---

## 4. The screens (six)

Four already exist and get a redesign lift to the coherent language; one is genuinely new (the hero); one is new-ish. Each screen's *purpose* here — layouts are for the design phase.

| # | Screen | Status | Purpose (one line) |
|---|--------|--------|--------------------|
| 1 | **Site overview** | exists (lift) | Two levels. **Estate landing** (the DCIM entry point): all sites as cards with RAG dot, roll-up counts, space bar, headline. **Single site** (floor-plan-forward): the selected room's plan featured, switchable via a room list, compact site stats on the right. Leads with the spatial view at every level. |
| 2 | **Floor plan (room)** | **NEW — hero** | The room as an architectural plan: shell (uploaded image or drawn), cabinets on true positions with rotation, placed CRACs/UPS, hot/cold aisle zones; Space/Power/Status lens colours the cabinets; a "find space" helper highlights cabinets with ≥N U free; click a cabinet → slide-in panel (space/power + open incidents/checks) → elevation. Includes an edit mode: upload-plan / draw-room / CSV-import setup paths, drag + quick-row placement, rotate, aisle zones, snap-to-grid. |
| 3 | **Cabinet elevation** | exists (lift) | The rack front/rear U-view: devices as blocks at their U-positions, coloured by lifecycle (colour-by selector switches to type/status). Hover an empty U → "add device" → catalogue picker pre-filled with that cabinet + U. Click a device → slide-in panel → full asset detail. Retired-but-racked devices show greyed until physically removed. |
| 4 | **Asset detail** | exists (lift + bug) | One device: hardware, location, power, lifecycle, maintenance, linked tickets/checks/risks/issues. **Persistent compact elevation rail on the left** shows this device highlighted in its rack; click any block to load its detail (browse the rack without leaving); coming out lands at cabinet/room level. Unracked assets: no rail, full-width overview. Includes the decommission action (retire → free capacity → mark for disposal → audit). |
| 5 | **Asset register** | exists (lift) | The searchable/filterable table of every asset — Linear-style rich rows (matching Service Desk), search + filter chips (lifecycle/site/type/manufacturer), and **filtered CSV export** ("export N (filtered)" — the subset an auditor asked for). |
| 6 | **Catalogue / add-asset picker** | new-ish | The device-type library + picker. Picker: search + browse, **your catalogue first then the wider library on demand (lazy/selective seed)**, a confirm step showing what auto-fills (U/power/image) before placing, and a **first-class manual device-type creation** flow (data-sheet entry) for in-house/OT kit. Invoked pre-filled from the elevation's hover-to-add, or standalone. |

---

## 5. The flow / navigation skeleton

The spine is a spatial drill-down, mirrored by a search escape-hatch. Persistent left-hierarchy tree (already exists) keeps orientation throughout; breadcrumb in the top bar is the identifier (no page titles).

```
                    ┌─────────────────────────────────────────┐
                    │  Asset register (search/filter anything) │  ← escape hatch,
                    └───────────────┬─────────────────────────┘     reachable anytime
                                    │ click an asset
                                    ▼
  Site overview ──▶ Floor plan ──▶ Cabinet elevation ──▶ Asset detail
   (rooms, counts)   (the hero:      (rack U-view,          (the record +
                     cabinet grid)    click an asset)        linked tickets/checks)
        │                                                          ▲
        └──────────────────── add asset ──▶ Catalogue picker ──────┘
                                            (choose model, auto-fill)
```

- **Primary path:** Site → Floor plan → Cabinet → Asset. Each level drills into the next; the tree + breadcrumb always show the path back.
- **Register** is the non-spatial way in — search "all Dell servers in RETIRED state", click a result, land on Asset detail (which shows its location, so you can jump *into* the spatial view from there).
- **Catalogue picker** is invoked from "add asset" at the cabinet (or register); choosing a device type auto-fills the asset.
- **Cabinet drill-in style:** to be decided in design — full-page navigation vs. a slide-in panel from the floor plan (the master-detail pattern). Flag for the design phase.

---

## 6. Key interactions (the handful that define the module)

- **Floor plan (hero) — view:** architectural plan — room shell, cabinets on true positions (row + position now, free x/y latent) with rotation (0/90/180/270°), placed CRACs/UPS/PDU, hot/cold aisle zones. A lens toggle switches what the cabinets colour by — **Space** (U utilisation), **Power** (kW draw vs capacity), **Status** (lifecycle); **Health** is a latent lens for the monitoring stage. Click a cabinet → slide-in panel (space/power + open incidents + checks due — the ITSM edge on the floor) → "open elevation". Cabinets with no position sit in an "unplaced" tray (honest — never guessed).
- **Floor plan — edit mode (setup):** the same canvas, toggled to edit. Three setup paths meet the manager where they are: **upload a plan image** (PDF/PNG as a dimmed backdrop, plot cabinets on top), **draw a simple room** (rectangle/L-shape, typed dimensions — deliberately basic, not CAD), or **CSV import** (map spreadsheet columns → cabinets/rows/positions, preview, bulk-create — the fastest on-ramp for estates that already live in spreadsheets). Placement: drag from a palette, snap-to-grid, **quick-row** drops a whole row at once, rotate cabinets, place CRACs/UPS, designate aisle zones. Validated as the NetBox/Hyperview pattern (upload-or-grid + drag + snap + status/orientation).
- **Cabinet elevation:** vertical U-numbered rack, front/rear toggle, devices as blocks at their true U-position/height, coloured by lifecycle with a **colour-by selector** (switch to type/role or status — mirrors the floor-plan lens at a deeper zoom). **Hover an empty U → "add device" → catalogue picker pre-filled with that cabinet + U** (the NetBox interaction — the rack is the workspace, not a form). Click a device → slide-in panel (details + open incidents) → full asset detail.
- **The navigation spine is consistent:** every level drills the same way — click → slide-in panel (with ITSM data: incidents/checks) → "open full". Floor-plan cabinet-panel → elevation → device-panel → asset detail. The consistency is the quality bar.
- **Asset detail — persistent elevation rail:** a compact rack elevation lives on the left of asset detail, this device highlighted; click any block to load that device's detail (browse the rack without leaving); coming out lands at cabinet/room level. Racked assets only — unracked assets show no rail, full-width overview. The rail is bonus context when there's a rack, absent when there isn't. (Build-time watch: icon-rail + DCIM sub-nav + elevation rail = three left columns; check at real width.)
- **Catalogue picker — lazy, selective, self-serve:** search + browse; **your catalogue shows first** (clean, relevant), the wider NetBox library beneath, dimmed, with "Add" — picking one lazily pulls it into your catalogue (dedupe-safe, vendor-selective — never a 30k-item dump). A **confirm step shows what auto-fills** (U-height, power, image, manufacturer) before placing — the catalogue's value made visible. **Manual device-type creation is first-class** (data-sheet form: manufacturer incl "in-house", model, U-height in 0.5 increments, power, full-depth, part-number, optional elevation image) for in-house/OT kit not in any library. Free-text entry always available.
- **Decommission workflow:** on asset detail — retire a device → frees its U-space and power budget back to the cabinet (capacity roll-ups honour it immediately) → marks for disposal → writes audit. A **"retired but still racked" interim state** handles the real gap between decommissioned and physically removed: freed from capacity maths but still shown greyed in the elevation until pulled.
- **Export:** filtered CSV from the register (asset inventory) and an audit-trail export — the compliance artefacts. Reflects the active filter ("export N (filtered)"). A read/format operation, no schema.
- **Find-space helper:** a floor-plan mode highlighting cabinets with ≥N U free (and optionally ≥N kW headroom) — "where does this new server go?". Derives from existing U/power data, no new schema. The basic capacity-finder; the what-if modeller is deferred.
- **Linked-records everywhere:** from asset, cabinet, and site, view and create linked tickets/checks/risks/issues (this exists on asset today; extend to cabinet + site) — the ITSM-integration edge made visible.
- **Space & power roll-ups:** room shows aggregate fill/power across its cabinets; site shows aggregate across rooms; estate landing rolls up per site. Calm-by-exception colour (amber near capacity, red at/over).

---

## 7. Scope summary (MoSCoW)

**Must (v1 — the achievable core):**
- Architectural floor plan (room shell, positioned cabinets with rotation, placed CRACs/UPS, hot/cold aisle zones) with Space/Power/Status lens — the hero.
- Floor-plan edit mode with all three setup paths: upload-plan-image, draw-simple-room, CSV import (column-mapping + preview + bulk-create).
- Placement tooling: drag + snap-to-grid, quick-row, rotate, place infrastructure objects, designate aisle zones.
- Cabinet elevation lift + colour-by selector + hover-to-add (catalogue pre-fill) + click-through wired from the floor plan.
- Asset detail lift + persistent elevation rail (racked) / full-width fallback (unracked) + the cabinet→asset navigation bug fix.
- Asset register lift: Linear rows + filter chips + filtered CSV export.
- Site overview lift: estate landing + floor-plan-forward single-site (room-switching).
- Catalogue: picker (search+browse, lazy/selective seed, confirm-auto-fill) + first-class manual device-type creation + NetBox seed.
- **Decommission workflow** (retire → free capacity → dispose → audit; retired-but-racked interim state).
- **Export** (filtered register CSV + audit-trail CSV).
- **Find-space helper** (highlight cabinets with free U/power).
- Linked-records (view + create) on cabinet and site (parity with asset).
- One coherent design language across all six.

**Should (fast follow):**
- Elevation imagery (real PNGs from NetBox, cached) over the SVG baseline.
- Field-diff audit on cabinet/room/asset updates; connection auditing.
- Plan-to-scale calibration (align uploaded image to real dimensions).

**Could (if time):**
- Rear-view PDU/cabling detail on the elevation.

**Won't (this version — schema-latent, designed-for):**
- Capacity/what-if planner (the full modeller — basic find-space IS in) · cable-tracing/ports · region roll-up · live telemetry/Health lens · 3D · .DWG/CAD import · analytics/trend reporting (separate `/analytics` surface).

---

## 8. Open questions for the design phase

**Resolved during design:**
- ~~Cabinet drill-in~~ → slide-in panel (with ITSM data), then "open full" to the elevation/asset. Consistent across all levels.
- ~~Floor plan setup UX~~ → three paths: upload plan image / draw simple room / CSV import.
- ~~Free-form vs grid~~ → row/position now (architectural view), free x/y latent.

**Still open:**
- **Lens default:** which lens does the floor plan open on — Space, Power, or Status? (Leaning Space — "how full is my room" is the most common glance.)
- **Module landing:** entering DCIM (not a specific site) — land on the estate/site list, the register, or a specific floor plan?
- **CSV import staging:** is import phase-one or the immediate fast-follow? (Highest-value but fiddliest of the three setup paths — the natural candidate to stage if the hero's first ship needs to be sooner.)
- **Draw-room richness:** rectangle + L-shape only for v1, or more shapes? (Deliberately basic is the recommendation — most rooms are one of those two.)
- **Remaining screens:** catalogue, asset detail, register, site overview still to design (lean on existing data, lighter on new schema).

---

*This brief is the design input. Next: take it into Claude Design to mock the six screens as a linked, clickable prototype in the coherent language, resolving the §8 open questions visually. The schema to support it is in `DCIM_SCHEMA_SPEC.md`; both are additive over the existing (substantially-built) foundation.*