# CRM Competitive Review — gap check against CRM_DESIGN.md

**Date:** 2026-07-03. **Sources:** web research on Zendesk (Support+Sell), Freshworks
(Freshdesk/Freshservice/Freshsales), Salesforce, HubSpot, Dynamics 365 (two research passes with
cited sources — see session notes); PSA/MSP platform observations (HaloPSA/ConnectWise) from
general knowledge, unverified. Shelf life: feature comparisons go stale — treat as a 2026 snapshot.

## Headline: the design is structurally sound

- **Company-first, no Lead entity** — validated hard. HubSpot ran for years with no Lead object
  (lifecycle stage on the company did the work) and its recent Leads object is a thin overlay,
  not a person store. Salesforce/Dynamics lead-conversion machinery is their single biggest
  duplication/complexity tar pit. Our `Client.lifecycleStage = PROSPECT` model is the modern
  (HubSpot-classic / Attio) pattern.
- **One database, one Client entity is our moat.** Zendesk Sell↔Support and Freshsales↔Freshdesk
  are two databases joined by email-matching sync (lag, duplicate contact stores, per-module
  widgets). We get their headline integration feature for free. Corollary: never build a "sync";
  build cross-module surfacing (tickets on the CRM view, open deals on desk views).
- **Contracts-next-to-ITSM validated**: Freshservice (not Freshsales) is where Freshworks does
  contract renewals properly — contracts belong beside assets/work-packages, not inside the
  pipeline. Matches our WorkPackage-extension decision.
- **Shared-mailbox capture validated by counter-example**: Salesforce Einstein Activity Capture
  stores captured email *outside* the CRM (not reportable, expires, vanishes if disabled) and is
  the most-complained-about design in that ecosystem. Storing synced mail as first-class rows we
  own — as designed — is the right call.
- Our lifecycle stage list (PROSPECT→ONBOARDING→ACTIVE→FORMER) is better suited to an MSP than
  HubSpot's marketing-funnel defaults (Subscriber/MQL/SQL…).

## Gaps found — recommended ADDITIONS to the design

Ordered by value-for-effort; ①–⑥ are cheap schema/fields, ⑦–⑩ are features.

1. **Opportunity pipeline hygiene fields** *(phase 3, near-free)*
   - `lastStageChangeAt` — powers rotting/stalled-deal flags (Freshsales deal rotting, Zendesk
     stagnant-deal smart lists; both treat time-in-stage as THE health signal).
   - `probability` — stage-level default %, → weighted pipeline value. That's all "forecasting"
     is at this tier.
   - `lostReason` → managed **picklist** (price / competitor / no decision / timing / scope /
     relationship) + optional free-text detail, **required on LOST**. Never free-text-only.
   - `nextStep` + `nextStepDate` on the opportunity — the most-cited pipeline discipline: a deal
     with no future-dated next step is by definition stalled.
2. **Quote line items from day one** *(phase 4)* — `QuoteLineItem` (description, qty, unit
   price, line total); quote value derived. A single scalar forces a rebuild the moment anyone
   wants an itemised PDF. Also: **revise-as-new-version** (Dynamics pattern: revising a SENT
   quote closes it and clones a new DRAFT version; one live version at a time) and a
   primary-quote pointer per opportunity. Product catalogue NOT needed.
3. **Auto-created renewal opportunities** *(phase 6 upgrade)* — promote the design's "prompt"
   to the Salesforce-CPQ/HubSpot-standard automation: scheduled job at
   `renewalDate − noticePeriodDays − buffer` auto-creates the RENEWAL opportunity + follow-up
   Task, with a dedupe flag so it fires once. For an MSP, renewals-due is worth more than any
   new-business report.
4. **Lifecycle automation with no auto-downgrade** *(phase 3)* — opportunity WON on a PROSPECT
   client ⇒ advance to ONBOARDING (prompted, as designed). Borrow HubSpot's guard: stages never
   move backwards automatically; regression is always a deliberate manual act.
5. **Client-card raw health signals** *(phase 6)* — on `/crm` overview: "days since last
   activity" + open-incident / SLA-breach count (we already own that data — the thing Zendesk
   and Freshworks have to sync for). Explicitly NOT a composite/AI health score.
6. **Email correlation ladder** *(phase 7b)* — order of reliability, from Dynamics server-side
   sync: participant-address match → Contact→Client (as designed); thread continuity via Graph
   `conversationId` (survives subject edits); optional `[OPP-2026-0001]`-style subject token for
   record-level pinning (we already use refs on desk records). Optional cheap add: a
   plus-address per opportunity (`crm+opp-…@`) for deal-scoped BCC.
7. **The reporting five** *(phase 6 / later)* — pipeline by stage (count/value/weighted),
   forecast by close-date period, stalled+pushed deals, **renewals due 90 days**, win/loss with
   reasons. Skip leaderboards/quota/coverage reports.
8. **Onboarding task checklist on WON** *(later phase, natural fit)* — PSA tools and HubSpot
   practice: winning a prospect spawns a templated onboarding checklist. We already have the
   CheckTemplates pattern and Tasks; a "task template set" applied at ONBOARDING is a natural
   extension. Park as a carded follow-on, not v1.
9. **Time-based automation sweep** *(cross-cutting, later)* — Zendesk/Freshdesk both split
   automation into event-triggers vs an hourly time-based sweep. The sweep is what powers
   rotting alerts, renewal countdowns, quote-sent-but-unanswered nudges — one scheduled job
   emitting Tasks/notifications. Design the three v1 nudges (stalled opportunity, renewal
   window, stale quote) to come from ONE sweep job, not three bespoke ones.
10. **SharePoint mapping, hardened** *(phase 7a)* — Dynamics' Document Location pattern
    validates ours, and its warts tell us what to fix: create the client folder **eagerly** (at
    client creation / mapping time), name it by client name + stable id (no GUID suffixes), keep
    the mapping in a table, and **never treat SharePoint permissions as the tenant boundary** —
    CRM document surfaces stay AD-staff-only and delegated auth means SharePoint still enforces
    its own per-user permissions underneath.

## Considered and consciously SKIPPED (with reasons)

| Feature | Why skipped |
|---|---|
| Lead entity + conversion | Duplication tar pit; company-first covers MSP volume (HubSpot proves it) |
| Full CPQ (catalogue, bundles, approvals, e-sign) | Even Freshworks gates it as an add-on; line items + statuses suffice |
| Order object | Services firm: quote → work package directly |
| Per-user mailbox sync | OAuth sprawl + noise; EAC's data-ownership trap; shared mailbox chosen |
| Email open/click tracking, sequences/drip | Outbound-prospecting machinery; account-based MSP doesn't cold-drip |
| AI deal scoring / composite health scores | Raw signals give 90% of value at ~30 clients; scores are theatre at this size |
| Forecast categories / quotas / leaderboards | Needs a sales team of >3 |
| Multiple pipelines | One pipeline + type field (NEW_BUSINESS/RENEWAL/EXPANSION); revisit on real demand |
| Multi-client contacts (one person ↔ many clients) | Zendesk/Freshdesk support it (default-company pattern) and MSPs are the use case — but it breaks our simple clientId scoping. v1: duplicate the person per client; revisit if it hurts. Documented trade-off. |
| Round-robin / skill routing | Team too small; owner field suffices |
| Elaborate CSAT scales | If CSAT ever ships: binary good/bad embedded in resolution email (desk-side, not CRM) |
| Side conversations (Zendesk) | Genuinely good pattern for vendor threads docked to records; too big for v1 — parked |

## Impact on the phased plan

No re-ordering needed. Phase 3 absorbs the pipeline hygiene fields (①③④), phase 4 gains line
items + versioning (②), phase 6 gains the renewal automation + signals + first reports (③⑤⑦),
phase 7 gains the correlation ladder + hardened folder mapping (⑥⑩). The automation sweep (⑨)
and onboarding checklists (⑧) are carded follow-ons.
