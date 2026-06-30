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
   "0 breached") are muted/neutral, never red. The sole exception is the domain health RAG row
   (top of the board), which is always coloured by design — everything beneath it obeys
   calm-by-exception.
3. **Honest denominators.** Any percentage shows what it is measured over (the SLA %
   must display its covered-ticket count) so a small-denominator figure (0% of 2) can
   never masquerade as a crisis.
4. **Glance open, drill-through gated.** The strip's counts are **client-wide** and
   visible to all roles (a count is not sensitive). Clicking through to the actual
   records applies the normal role scoping (ENGINEER assigned-only, etc.). The glance
   is public; the detail is gated.
5. **Density with breathing room** — Linear/Sentry bar. Tighten the dead space; no
   stretched cards, no reserved voids.
6. **Point-in-time, never live.** The dashboard is a snapshot, not a live feed. It carries an
   explicit "data as of HH:MM" stamp + a manual Refresh, and must never imply real-time data.

## Layout (top to bottom)

### Header (point-in-time)

A top-right strip carries a **"data as of HH:MM" stamp + a manual Refresh** control. The dashboard is
point-in-time, not live — every figure is a snapshot taken at the stamped time. It must never imply
live data; the stamp + explicit refresh are the contract.

### Zone: OPERATIONAL

**1. Domain health** (RAG row — the only always-coloured element)
- Four health dots across the top, one per domain: **Service Desk · Checks · Governance ·
  Infrastructure** — each green / amber / red, with a one-line status beneath ("All on track",
  "2 breached", "1 site awaiting review", …).
- This row is **always coloured** by design. It reconciles "status is always visible at a glance"
  with the calm-by-exception discipline of everything beneath it: the dots carry the standing signal
  so the detail below can stay neutral at rest.
- Detail below this row obeys calm-by-exception (neutral at rest; colour only on threshold).

**2. Alert band** (ALWAYS-COLOURED health signals — one horizontal strip)
- **Scope change (commit 3.5):** the band is now **always-coloured** (RAG dots — green /
  amber / red), following the domain-health RAG row's logic, **NOT** calm-by-exception
  grey-at-rest. Calm-by-exception still governs the **needs-attention list** and the
  **nav-row counts**; the alert band is the second always-on-colour element after the RAG row.
- Order, left → right: **SLA · Unassigned · Due soon · Breached**.
- Left of the stats: a summary badge reflecting the worst current state — "All on track"
  (green) / "N needs a look" (amber) / "N breached" (red).
- **SLA compliance %** — point-in-time: of currently-open, SLA-covered (have a `dueAt`)
  SR + Incidents, the proportion NOT breached (on-track ÷ covered). Informational (not
  clickable) and **dot-less** (a percentage has no RAG state). Shows "94% · of 12 covered";
  when **no** open SR/INC carries a `dueAt` it shows just **"—"**, with the "no SLA-covered
  tickets" explanation in the info tooltip (never a bare alarming 0%).
- **Unassigned** — open work items with no assignee. RAG dot; green at 0, amber when > 0.
- **Due soon** — open SR/INC approaching `dueAt` (within the due-soon window). Green at 0,
  amber when > 0.
- **Breached** — open SR/INC past `dueAt`. Green at 0, red when > 0.
- Each **count-stat** carries a RAG status dot (left, vertically centred; label + number
  to its right) and is **always coloured**: a **green dot at 0** ("actively fine", not
  absent, no cell tint); when non-zero the amber/red drives the dot, the number, AND the
  cell highlight (`--bg-warning` / `--bg-danger`). Each count-stat is clickable to its
  filtered queue and carries an info tooltip (hover / focus / tap).
- (Checks are **not** represented here — they are never "overdue"; see the Checks panel below.)

**3. Open work by type** (navigation row — click → pre-filtered queue)
- One compact tile per record type: Requests, Incidents, Changes, Tasks, Risks, Issues.
- Each shows the **client-wide open count**; clicking navigates to that type's
  pre-filtered queue.
- **Enriched stats** (the essential types carry extra inline signal):
  - **Requests** — open count + "N breached" inline (danger tint) when > 0.
  - **Risks** — open count + "N active" inline (warning tint) when > 0.
  - Others: plain count.

**4. Needs attention** (hero list — the new value)
- A prioritised, cross-type list of items genuinely needing action: breached / due-soon
  SLAs and unassigned items — ordered by urgency.
- Each row leads with a **fixed-width severity column** (a dot + label: BREACHED / DUE SOON /
  UNASSIGNED) so every description aligns to one left edge. This is a lightweight severity label —
  **not** a filled pill, and **distinct** from the unified `StatusPill`. Then: title, ref + age,
  clickable to the record (drill-through is role-gated).
- **Honest empty state**: when the list is short or empty, say so plainly
  ("Nothing else needs attention right now.") — reinforces glanceable calm.

**5. Recent activity** (kept — already the strongest part of the old dashboard)
- Dense list of latest status changes / assignments across record types. Beside the
  needs-attention list on laptop.

**6. Checks** (site-organised — planned-then-confirmed-on-the-day, never "overdue")
- Checks are **planned, then confirmed on the day** — there is no "overdue check". The panel is
  organised by **site**, not as a flat overdue queue.
- **Summary strip:** awaiting review · in rework · average score (with 90-day delta) · next planned.
- **Per-site rows**, each carrying: a **health dot** · site name · **context subtext** (either the
  next check's title + day, or the current review-state) · **current score + 90-day delta** · and
  three **follow-on counts** — Tasks / Risks / Issues raised from checks at that site.
- **Site drill** (click a row): a site-scoped view of recent checks. Each check renders as a
  **container** with its review-state pill + score, and any open follow-on items **nested beneath
  it** — so the originating check is always visible above the work it generated.
- The **score delta** is explained on **hover / focus** (tooltip), not inline.
- A **mini-calendar** of planned checks is a **drill-in**, not an inline element.

### Zone: CLIENT (the client home-page)

**7. Infrastructure band** (existing — derived from `GET /sites`, no backend)
- Sites / Cabinets / Assets (sited) counts + a short sites list (name + cabinet count),
  "View all" → asset hierarchy. Tightened density. This is the estate's presence on the dashboard
  (and the content the "estate-forward" cold-start state leans on).
- **Estate health visualisation is deferred** — see below.

**8. Contacts** (reserved slot — Part C, #174 / #161)
- Honest dashed placeholder until the Contact model exists. Does not leave a blank void —
  renders as an explicit "reserved" state.

### Deferred: estate health visualisation
- Per-cabinet **U-fill bars** and a **site health roll-up** are **deferred to the DCIM module**,
  where real rack elevation + telemetry will do them properly. The underlying data exists
  (`Cabinet.totalU`/`usedU`, `Asset.uHeight`/`uPosition`), but the dashboard deliberately does
  **not** build fill bars or a health visual here — its infrastructure presence stays the minimal
  band above. When the DCIM module lands its elevation/telemetry, the richer estate-health view
  belongs there, not on this dashboard.

## Cold-start & empty states

The dashboard has distinct resting/empty states — a state machine, each visibly different from the
others **and** from a failed load (a failed load is an error state, never dressed up as "calm"):

- **(a) New client, nothing set up** → an **onboarding checklist** (no estate, no work items yet).
  The board's job here is to guide setup, not to show a wall of zeros.
- **(b) Set up, but no live activity** → an **estate-forward layout**: lead with the infrastructure
  band / estate presence, since there is no operational work to surface yet.
- **(c) Established and currently calm** → the **"all on track" resting state** within the *normal*
  layout (RAG row green, alert band calm, needs-attention showing its honest empty state). This is a
  healthy steady state, not an empty one.

These are distinct from a **failed load**, which must present as an explicit error with retry — never
as a calm or empty state.

## Responsive

- **Laptop-first, mobile-usable.** Laptop: alert band full width; count row 6-across;
  needs-attention + recent activity two-up; client zone two-up.
- **Narrow/mobile:** count row reflows (`repeat(auto-fit, minmax(~150px, 1fr))`); the
  two-up rows stack to single column. Order on mobile keeps alert band + needs-attention
  near the top (don't bury what needs action).
- No card stretches beyond its content; no reserved voids.

## Colour discipline (calm-by-exception)

- **Always-coloured exceptions:** the domain health RAG row (top of the board) AND the
  alert band (commit 3.5 — see Alert band above) are always-coloured: their RAG dots carry
  the standing signal. A count-stat dot is **green at 0** ("actively fine"), amber/red when
  non-zero. The rules below govern everything ELSE (needs-attention list, nav-row counts).
- **Neutral/rest:** `--text-primary` number, `--text-muted` label. The default.
- **Amber ("look"):** `--bg-warning` cell tint + `--text-warning` — for due-soon,
  unassigned, active risks.
- **Red ("urgent"):** `--bg-danger` + `--text-danger` — reserved for SLA breach. Rare.
- Red is never spent on "a count that happens to be non-zero." If it's not act-now, it's
  not red.

## SLA % definition (precise)

`covered` = open SR + Incident with a non-null `dueAt`.
`onTrack` = covered AND not past `dueAt`.
`SLA% = round(onTrack / covered * 100)`, displayed with `of {covered} covered`.
If `covered === 0`: show "—" / "no SLA-covered tickets", never "0%".
**Limited SLA visibility:** when `covered` is non-zero but small (few open tickets carry a `dueAt`),
show a calm **"limited SLA visibility"** badge instead of a bare percentage — a small denominator must
never read as a crisis. The exact threshold + wording is an open decision (see Open decisions).

## Out of scope (this spec)

- MTTR / SLA-compliance **trends** → the analytics route (separate spec). The
  `resolvedAt` foundation + `/metrics/*` endpoints already built (branch
  `feat/rich-dashboards`, commit `3f5bd46`) feed that surface, not this one.
- Contacts content → blocked on the Contact model (#174 / #161).
- Per-role dashboard *layouts* → not now; one layout, data/visibility scoped by role.
- **Estate health visualisation** (per-cabinet U-fill bars + site health roll-up) → **deferred to
  the DCIM module** (real elevation/telemetry). Not built on this dashboard.

## Build notes

- The needs-attention list and enriched counts derive largely from data the dashboard
  already fetches (SLA status via `computeSlaStatus`/`serviceDeskQueue`, the ticket
  union via `useTickets`). Investigate how much is client-side-derivable vs. needs a
  small aggregate before building.
- The **checks panel** is richer than the rest of the dashboard (per-site scores, 90-day deltas,
  follow-on Task/Risk/Issue counts, review-state, planned-check calendar). Its aggregation is its own
  data question — size it separately; it is unlikely to be fully client-side-derivable from the flat
  `GET /checks` list.
- Reuse existing card primitives / tokens; this is a re-composition, not a new visual
  language. Keep British English throughout.

## Open decisions

1. **ENGINEER glance-count scope.** The strip's counts are meant to be client-wide (Principle 4),
   but the work-item list endpoints are assignee-scoped for ENGINEER (`applyAssignedScope`). Two paths:
   - **Approach A (self-scoped, no backend):** ENGINEER glance counts reflect their own assigned
     queue; all other roles already see client-wide counts.
   - **Approach B (client-wide):** add a small **unscoped count aggregate** feeding only the glance
     strip; drill-through stays role-gated. Decision pending live review of Approach A.
2. **"Limited SLA visibility" badge.** The exact threshold (how few covered tickets triggers it) and
   wording for the small-denominator SLA state (see SLA % definition).
