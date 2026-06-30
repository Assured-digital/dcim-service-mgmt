# DASHBOARD_SPEC.md — Operational Dashboard

Source of truth for the operational dashboard (`DashboardPage.tsx`). Scope: the
**operational dashboard only**. The analytics/reports route (MTTR + SLA-compliance
trends) is a separate surface, specified elsewhere — trends do **not** live here.

## Design principles

1. **Answers "what needs me now?", not "how many?"** The dashboard is a workspace,
   not a gallery of equally-weighted count cards. The previous card-grid is retired.
2. **Glanceable calm — alert by exception.** Calm-by-exception governs the **needs-attention
   list** and the **nav-row counts**: they are neutral at rest, and colour escalates only on
   threshold — amber = "worth a look", red reserved for genuinely urgent (e.g. a real SLA
   breach). A mostly-fine state must *look* fine — one slightly-overdue task must not make the
   whole board look like a crisis; good zeros (e.g. "0 breached") are muted/neutral, never red.
   **The principle's scope narrowed deliberately during the build:** TWO elements are now
   always-coloured by design and sit OUTSIDE calm-by-exception — the domain health RAG row (top
   of the board) AND the alert band (each count-stat carries a RAG dot, green at zero). Everything
   else obeys calm-by-exception.
3. **Honest denominators.** Any ratio shows what it is measured over — the SLA stat reads
   **"N of M on track"** (the covered-ticket count is the denominator, on the face) over a thin
   ratio-coloured bar, so a small-denominator figure can never masquerade as a crisis. When no
   open ticket carries an SLA due time it shows "—" + a neutral, unfilled bar, never a bare 0%.
4. **Glance open, drill-through gated.** The aim is a **client-wide glance** (a count is not
   sensitive) with role scoping applied only on drill-through. As shipped (**Approach A**,
   frontend-only) this holds for every role EXCEPT ENGINEER: the alert band + nav-row counts are
   derived client-side from the role-scoped list endpoints, which `applyAssignedScope` for
   ENGINEER — so an ENGINEER's open-work counts reflect their own assigned queue. The one count
   surface that IS client-wide for every role is the checks panel's follow-on counts (served by a
   count aggregate that bypasses `applyAssignedScope`; see Checks §6). Drill-through stays
   role-gated throughout. A true client-wide count aggregate for ENGINEER (Approach B) is a
   deferred follow-up — see Resolved decisions.
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
- **Always-coloured** (RAG dots — green / amber / red), following the domain-health RAG row's
  logic, **NOT** calm-by-exception grey-at-rest. It is the **second always-on-colour element**
  after the RAG row; calm-by-exception governs everything else (needs-attention list, nav-row
  counts).
- Order, left → right: **SLA · Unassigned · Due soon · Breached**.
- **No summary badge.** The old "N needs a look" / "All on track" worst-state badge was
  **removed** during the build — state now reads directly off the individual stats; no aggregate
  verdict sits to their left.
- **SLA stat** — point-in-time: of currently-open, SLA-covered (have a `dueAt`) SR + Incidents,
  the proportion not breached. Reads **"N of M on track"** (onTrack of covered) over a **thin
  progress bar** filled to onTrack ÷ covered. The bar is **ratio-coloured** — amber when on-track
  is a minority, green when most are on track, red when most are breached (> 50%). Informational
  (not clickable), **dot-less** (a ratio has no single RAG state) and carries **no per-type
  breakdown**. When **no** open SR/INC carries a `dueAt` it shows **"—" + a neutral, unfilled
  bar** (never a bare alarming 0%).
- **Unassigned** — open work items with no assignee (amber when > 0).
- **Due soon** — open SR/INC approaching `dueAt`, within the due-soon window (amber when > 0).
- **Breached** — open SR/INC past `dueAt` (red when > 0).
- Each **count-stat** is **always coloured via its dot, NOT a cell fill** (calm-by-exception is
  expressed through the dots, consistent with the RAG row — no `--bg-warning` / `--bg-danger`
  cell tint). Left: a RAG status dot (**green at 0** = "actively fine"; amber/red when active)
  beside the **big total number**, coloured to match (muted at 0). Right of that anchor: the stat
  label over a **per-type breakdown — SR / INC / CHG**, all three shown (**zeros included**, each
  non-zero figure emphasised, zeros muted). The **dot + total deep-links the whole filtered
  queue**; each **non-zero type figure deep-links its own slice** (`?type=…`); a zero figure is
  inert. No info tooltips.
- (Checks are **not** represented here — they are never "overdue"; see the Checks panel below.)

**3. Open work by type** (navigation row — click → pre-filtered queue)
- One compact tile per record type: Requests, Incidents, Changes, Tasks, Risks, Issues.
- Each shows the open count (**client-wide for every role except ENGINEER** — Approach A,
  frontend-derived from the role-scoped lists, so an ENGINEER sees their own; see Principle 4);
  clicking navigates to that type's pre-filtered queue (drill-through role-gated).
- **Enriched stats** (the essential types carry extra inline signal):
  - **Requests** — open count + "N breached" inline (danger tint) when > 0.
  - **Risks** — open count + "N active" inline (warning tint) when > 0.
  - Others: plain count.

**4. Needs attention** (hero list — the new value)
- A prioritised, cross-type list of items genuinely needing action: breached / due-soon
  SLAs and unassigned items — ordered by urgency. **Full width** (recent activity moved to the
  page foot, so this no longer shares its row). Caps at 5 rows with an "N more →" overflow link.
- Each row leads with a **fixed-width severity column** (a dot + label: BREACHED / DUE SOON /
  UNASSIGNED) so every description aligns to one left edge. This is a lightweight severity label —
  **not** a filled pill, and **distinct** from the unified `StatusPill`. Then the title, and a
  trailing **contextual time descriptor** — directional by severity, with the severity word NOT
  repeated: **"1 day ago"** (since breach) for breached, **"in 2 hours"** (until due) for
  due-soon, **"14 days"** (since opened) for unassigned. The **record reference is deliberately
  not shown** (dashboard noise); the time is neutral (the severity dot carries urgency). The
  whole row is clickable to the record (drill-through is role-gated).
- **Honest empty state**: when the list is short or empty, say so plainly
  ("Nothing else needs attention right now.") — reinforces glanceable calm.

**5. Recent activity** (kept — already the strongest part of the old dashboard)
- Dense, most-recent-first list of latest status changes / assignments / new records across
  record types (tickets + risks + issues + checks). **Sits at the page foot, full-width** (it no
  longer sits beside needs-attention). Each row **drills into its record** (chevron + hover,
  role-gated). Starts collapsed at ~7 rows; **"Show more" expands inline** up to the builder's
  ceiling (~20), "Show less" collapses back — pure in-page disclosure, no navigation.

**6. Checks** (site-organised — planned-then-confirmed-on-the-day, never "overdue")
- Checks are **planned, then confirmed on the day** — there is **no "overdue check" state
  anywhere** (not derived, not displayed). The panel is organised by **site**, not as a flat
  overdue queue.
- **Summary strip:** awaiting review · in rework · average score (with 90-day delta) · next planned.
- **Per-site rows**, each carrying: a **health dot** · site name · **context subtext** (either the
  next check's title + day, or the current review-state) · **current score + 90-day delta** · and
  three **follow-on counts** — Tasks / Risks / Issues raised from checks at that site. The per-site
  follow-on counts come from a **follow-on-summary reverse-lookup** on `CheckItemFollowOn`
  (`GET /checks/follow-on-summary` → `followOnCountsBySite`), keyed under `["checks", …]` so the
  dashboard Refresh reaches it.
- **Inline site expansion** (click a row) — **NOT a routed drill**. The row unfolds its recent
  checks **directly beneath it** as a **single-open accordion** (opening one collapses any other);
  there is **no navigation**. Each check renders as a **container** with its review-state pill +
  score, and any open follow-on items **nested beneath it** — so the originating check is always
  visible above the work it generated. The review-state pills are the **unified `StatusPill`** (the
  checks drill now consumes it, not a bespoke pill).
- The **score delta** is explained on **hover / focus** (tooltip), not inline.
- **Scope (ENGINEER) — one accepted split:** the panel's **follow-on counts are client-wide** for
  every role (the `follow-on-summary` aggregate deliberately bypasses `applyAssignedScope`), while
  the **summary strip's review counts** (awaiting review / in rework) remain **self-scoped for
  ENGINEER** (they ride the role-scoped `GET /checks` list). This is a known, accepted
  inconsistency, not an oversight.

### Zone: CLIENT (the client home-page)

**7. Infrastructure summary** (existing — derived from `GET /sites`, no backend)
- A **light estate summary only**: Sites / Cabinets / Assets (sited) counts + a **clickable sites
  list** (name + cabinet count, each row → that site's hierarchy) + a **"View estate →"** link.
  **No health bars, U-fill or capacity visualisation** — estate health is deferred to the DCIM
  module (see below). This is the estate's presence on the dashboard (and the content the
  "estate-forward" cold-start state leans on). Now **full-width** (Contacts removed — see below).

**8. Contacts** (removed until the Contact model lands — #174 / #161)
- **Not rendered.** There is **no reserved/placeholder slot** on the dashboard — the earlier
  dashed-placeholder plan was dropped during the build. The infrastructure summary claims the full
  width in its place. Contacts return as real content once the Contact model (#174) ships.

### Deferred: estate health visualisation
- Per-cabinet **U-fill bars** and a **site health roll-up** are **deferred to the DCIM module**,
  where real rack elevation + telemetry will do them properly. The underlying data exists
  (`Cabinet.totalU`/`usedU`, `Asset.uHeight`/`uPosition`), but the dashboard deliberately does
  **not** build fill bars or a health visual here — its infrastructure presence stays the minimal
  band above. When the DCIM module lands its elevation/telemetry, the richer estate-health view
  belongs there, not on this dashboard.

## Cold-start & empty states

The dashboard has distinct resting/empty states — a **cold-start state machine**
(`deriveColdState`) with three states, **detected entirely from already-fetched data** (no new
query), each visibly different from the others **and** from a failed load (a failed load is an error
state, never dressed up as "calm"):

- **(a) `onboarding`** — new client, nothing set up (no estate, no checks, no open work) → an
  **onboarding checklist**. The board's job here is to guide setup, not to show a wall of zeros.
- **(b) `estate`** — set up but quiet (has estate, no open work, no checks needing attention) → an
  **estate-forward layout**: the estate leads as the hero and the operational band collapses to a
  single calm "all on track" line.
- **(c) `active`** — established with live estate and/or work → the **full dashboard** (the normal
  layout; when currently calm, RAG row green, the alert band's dots green, needs-attention showing
  its honest empty state — a healthy steady state, not an empty one).

These are distinct from a **failed load**, which must present as an explicit error with retry — never
as a calm or empty state.

## Responsive

- **Laptop-first, mobile-usable.** Laptop: RAG row + alert band 4-across; count row 6-across;
  needs-attention **full-width**; infrastructure full-width; recent activity full-width at the page
  foot. (Needs-attention and recent activity are no longer two-up — recent activity moved to the
  foot.)
- **Narrow/mobile:** the count row reflows (2-across on xs, 3-across on sm); the RAG row + alert
  band + checks summary strip reflow from 4-across to **2×2** below md. Order keeps the alert band +
  needs-attention near the top (don't bury what needs action).
- No card stretches beyond its content; no reserved voids.

## Colour discipline (calm-by-exception)

- **Always-coloured exceptions (via DOTS, not fills):** the domain health RAG row (top of the
  board) AND the alert band are always-coloured — their **RAG dots** carry the standing signal,
  and there is **no cell tint/fill** (calm-by-exception is expressed through the dots). A
  count-stat's dot + total is **green at 0** ("actively fine"), amber/red when non-zero. The rules
  below govern everything ELSE (needs-attention list, nav-row counts).
- **Neutral/rest:** `--text-primary` number, `--text-muted` label. The default.
- **Amber ("look"):** `--text-warning` (dot + text; no cell fill) — for due-soon, unassigned,
  active risks.
- **Red ("urgent"):** `--text-danger` (dot + text) — reserved for SLA breach. Rare.
- Red is never spent on "a count that happens to be non-zero." If it's not act-now, it's
  not red.

## SLA stat definition (precise)

`covered`  = open SR + Incident with a non-null `dueAt`.
`onTrack`  = covered AND not past `dueAt`.
`breached` = covered AND past `dueAt`.
Displayed as **"{onTrack} of {covered} on track"** over a thin bar filled to `onTrack / covered`.
**Bar colour** (ratio-driven): **red** when `breached / covered > 0.5` (mostly breached); else
**green** when `onTrack / covered ≥ 0.66` (most on track); else **amber** (on-track a minority).
If `covered === 0`: show **"—" + a neutral, unfilled bar** ("no SLA-covered tickets"), never "0%".
(The earlier "limited SLA visibility" small-denominator badge was **not** built — the honest
"N of M" denominator + the "—" empty state make a bare percentage impossible, so the badge was
unnecessary.)

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

## Resolved decisions (were open during design)

1. **ENGINEER glance-count scope → Approach A shipped (frontend-only).** ENGINEER glance counts
   (alert band + nav row) reflect their own assigned queue — derived client-side from the
   role-scoped list endpoints (`applyAssignedScope`), with **no count aggregate**; all other roles
   already see client-wide counts. **Approach B** (a `/dashboard/counts` aggregate that bypasses
   `applyAssignedScope` for counts only, with a "showing your assigned items" banner on the
   role-gated destination queues) remains a **deferred follow-up — not built**. The one
   client-wide-for-all count is the checks follow-on summary (already shipped via its own bypass
   aggregate; see Checks §6).
2. **"Limited SLA visibility" badge → dropped.** The SLA stat ships as "N of M on track" + a
   ratio bar with a "—" empty state (see SLA stat definition), which removes the need for a
   small-denominator badge. Not built.
