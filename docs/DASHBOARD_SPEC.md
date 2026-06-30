# DASHBOARD_SPEC.md — Operational Dashboard

Source of truth for the operational dashboard (`DashboardPage.tsx`). Scope: the
**operational dashboard only**. The analytics/reports route (MTTR + SLA-compliance
trends) is a separate surface, specified elsewhere — trends do **not** live here.

## Design principles

1. **Answers "what needs me now?", not "how many?"** The dashboard is a workspace,
   not a gallery of equally-weighted count cards. The previous card-grid is retired.
2. **Glanceable calm — alert by exception.** Stats are neutral at rest. Colour escalates
   only on threshold: amber = "worth a look", red = reserved for genuinely urgent
   (e.g. a real SLA breach). A mostly-fine state must *look* fine — one slightly-overdue
   task must not make the whole board look like a crisis. Zeros that are good (e.g.
   "0 breached") are muted/neutral, never red.
3. **Honest denominators.** Any percentage shows what it is measured over (the SLA %
   must display its covered-ticket count) so a small-denominator figure (0% of 2) can
   never masquerade as a crisis.
4. **Glance open, drill-through gated.** The strip's counts are **client-wide** and
   visible to all roles (a count is not sensitive). Clicking through to the actual
   records applies the normal role scoping (ENGINEER assigned-only, etc.). The glance
   is public; the detail is gated.
5. **Density with breathing room** — Linear/Sentry bar. Tighten the dead space; no
   stretched cards, no reserved voids.

## Layout (top to bottom)

### Zone: OPERATIONAL

**1. Alert band** (calm-by-exception health signals; one horizontal strip)
- Left: a summary badge reflecting the worst current state — "All on track" (green) /
  "N needs a look" (amber) / "N breached" (red).
- **SLA compliance %** — point-in-time: of currently-open, SLA-covered (have a `dueAt`)
  SR + Incidents, the proportion NOT breached (on-track ÷ covered). **Show the
  denominator inline** ("94% · of 12 covered"). If few/no tickets have a due date,
  this must be honest, not alarming.
- **Breached** — open SR/INC past `dueAt`. Red when > 0.
- **Due soon** — open SR/INC approaching `dueAt` (within the due-soon window). Amber when > 0.
- **Unassigned** — open work items with no assignee. Amber when > 0.
- **Checks overdue** — overdue engineering checks. Amber/red when > 0.
- Each stat: neutral at rest; threshold drives amber/red on that cell only.

**2. Open work by type** (navigation row — click → pre-filtered queue)
- One compact tile per record type: Requests, Incidents, Changes, Tasks, Risks, Issues.
- Each shows the **client-wide open count**; clicking navigates to that type's
  pre-filtered queue.
- **Enriched stats** (the essential types carry extra inline signal):
  - **Requests** — open count + "N breached" inline (danger tint) when > 0.
  - **Risks** — open count + "N active" inline (warning tint) when > 0.
  - Others: plain count.

**3. Needs attention** (hero list — the new value)
- A prioritised, cross-type list of items genuinely needing action: breached / due-soon
  SLAs, overdue checks, unassigned items — ordered by urgency.
- Each row: severity pill (OVERDUE / DUE SOON / BREACHED / UNASSIGNED), title, ref + age,
  clickable to the record (drill-through is role-gated).
- **Honest empty state**: when the list is short or empty, say so plainly
  ("Nothing else needs attention right now.") — reinforces glanceable calm.

**4. Recent activity** (kept — already the strongest part of the old dashboard)
- Dense list of latest status changes / assignments across record types. Beside the
  needs-attention list on laptop.

### Zone: CLIENT (the client home-page)

**5. Infrastructure band** (existing — derived from `GET /sites`, no backend)
- Sites / Cabinets / Assets (sited) counts + a short sites list (name + cabinet count),
  "View all" → asset hierarchy. Tightened density.

**6. Infrastructure health visual** (health-aware; structural now, telemetry later)
- Replaces / upgrades the plain text Infrastructure band with a glanceable,
  Hyperview-flavoured visual. **Health-aware, gracefully degrading**: renders the
  structural truth today; *lights up* with health telemetry when that data exists —
  health is **optional throughout**, never faked.
- **Structural (build now, real data):**
  - Summary: Sites / Cabinets / Assets / Avg fill.
  - **Cabinet fill bars** — per cabinet, U-utilisation (assets' U-footprint vs cabinet
    U-height), grouped by site. Colour = fill threshold (near-full → amber/red), same
    calm-by-exception discipline. Half-empty cabinets stay calm.
  - "View all" → asset hierarchy.
  - **Data dependency (verify at build):** requires cabinet U-height + asset U-size. If
    only asset *counts* are stored (not U-footprint), either add that or fall back to a
    simpler "assets per cabinet" density bar. Investigation must confirm.
- **Health layer (design for, do NOT build now):** when per-asset telemetry exists
  (power draw, thermal, capacity, environmental — all optional per asset), each cabinet
  gains optional indicators alongside its fill bar; sites gain a health roll-up. The
  component is *designed* to accept this layer; building the telemetry data model is the
  **DCIM rebuild**, out of scope for this dashboard. Build the structural view with the
  health layer stubbed/optional so it slots in cleanly later.
- Honesty: no faked telemetry, no empty-states masquerading as data. Structural is real;
  health renders only where real data exists.

**7. Contacts** (reserved slot — Part C, #174 / #161)
- Honest dashed placeholder until the Contact model exists. Does not leave a blank void —
  renders as an explicit "reserved" state.

## Responsive

- **Laptop-first, mobile-usable.** Laptop: alert band full width; count row 6-across;
  needs-attention + recent activity two-up; client zone two-up.
- **Narrow/mobile:** count row reflows (`repeat(auto-fit, minmax(~150px, 1fr))`); the
  two-up rows stack to single column. Order on mobile keeps alert band + needs-attention
  near the top (don't bury what needs action).
- No card stretches beyond its content; no reserved voids.

## Colour discipline (calm-by-exception)

- **Neutral/rest:** `--text-primary` number, `--text-muted` label. The default.
- **Amber ("look"):** `--bg-warning` cell tint + `--text-warning` — for due-soon,
  unassigned, checks-overdue, active risks.
- **Red ("urgent"):** `--bg-danger` + `--text-danger` — reserved for SLA breach. Rare.
- Red is never spent on "a count that happens to be non-zero." If it's not act-now, it's
  not red.

## SLA % definition (precise)

`covered` = open SR + Incident with a non-null `dueAt`.
`onTrack` = covered AND not past `dueAt`.
`SLA% = round(onTrack / covered * 100)`, displayed with `of {covered} covered`.
If `covered === 0`: show "—" / "no SLA-covered tickets", never "0%".

## Out of scope (this spec)

- MTTR / SLA-compliance **trends** → the analytics route (separate spec). The
  `resolvedAt` foundation + `/metrics/*` endpoints already built (branch
  `feat/rich-dashboards`, commit `3f5bd46`) feed that surface, not this one.
- Contacts content → blocked on the Contact model (#174 / #161).
- Per-role dashboard *layouts* → not now; one layout, data/visibility scoped by role.

## Build notes

- The needs-attention list and enriched counts derive largely from data the dashboard
  already fetches (SLA status via `computeSlaStatus`/`serviceDeskQueue`, the ticket
  union via `useTickets`, checks). Investigate how much is client-side-derivable vs.
  needs a small aggregate before building.
- Reuse existing card primitives / tokens; this is a re-composition, not a new visual
  language. Keep British English throughout.
