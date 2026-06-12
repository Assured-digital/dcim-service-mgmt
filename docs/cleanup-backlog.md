# Cleanup & Docs Backlog

Deferred items, originally from the repo-tidy session (2026-06-10), updated
2026-06-12 after the Jira-polish + login/settings sessions. The repo is
"clean enough to build"; this file tracks the known remainder so it isn't
carried in anyone's head.

## PARKED WORK (added 2026-06-12 — after polish + login merges)

### Deferred phases (own branch/PR each, dependency-ordered)

**#99 — User display (NEXT — in progress)**
Assignee shows email; "Submitted by" blank on tasks; History actor shows email.
Root cause: user FKs not resolved through `resolveCreator` on read paths
(assignee projected as `{id,email}`; audit-events actor resolves to email).
Fix: extend assignee/createdBy projections + audit-events actor → `displayName`;
shared frontend `UserDisplay` component. Investigation-first: enumerate ALL
email-leaking surfaces before fixing. Relates #48 (StatusPill) and the old
"rich-row assignee knownAs" card below. Also needs the 3 list services to
select knownAs/firstName/lastName.

**Audit trail** (`feat/audit-trail`) — backend-led, full plan drafted
Every mutation emits structured, client-scoped events with field-level old→new
diffs. New `emit-audit.ts` (shared helper, not injectable) + `diff-record.ts`
(humanise at emit time). Wire into ~9 services; record-links = 2 events/link;
attachments via parent; maintenance via asset.clientId. Two type→entityType
maps (snake→PascalCase — silent-failure trap if wrong). Schema: 2 indexes on
AuditEvent (migration runs on cloud first — watch migrate job). ALSO carries the
Comments|History|Approvals tab restructure (drop Status/Assignments into a
populated History). Tenant-isolation spoof tests required.

**Status workflow** — statuses/transitions/lifecycle per type, gated transitions.
The status-colour single-source (colors.ts) is groundwork. Note: the existing
`TransitionDialog` + `config/transitions/` layer (see section A) IS the start of
this — formalise it here.

**Approvals** — auditable decision/sign-off; brief drafted. Likely PART OF
status-workflow (approvals-as-gates); surfaces the Approvals tab. Change records
have existing approval fields to investigate/extend.

### Polish finale
**The transition** — depth-0→1 navigator animation (table→rail compress + detail
entry). START with investigation: remount vs re-layout (determines feasibility).
Instinct: fast/subtle slide-fade (~150-200ms), not literal morph. Build against
the now-frozen layout. Last piece to make Service Desk 100% done.

### Smaller cards (2026-06-12)
- `ForwardRef(Box3)` console warning on drawer open — pre-existing, non-breaking, investigate.
- Hardcoded-radius panels (Infra/Asset 10px, assorted 8px) now read rounder than
  the unified 6px baseline — sweep to token.
- SettingsPage uses `borderRadius: 2` + hardcoded colours — off the 6px/token system.
- Check-page Jira restyle (custom non-shell page) — see section A "Check detail page".
- Clear leftover dev stash entry + test SR↔Risk link in local Postgres (harmless).
- Automated tenant-isolation tests (standing gap).

### Operational
**Pre-prod investigation + push** — prod stale, not pushed in a while.
Before pushing: `git log` prod-image-commit..main to inventory backlog; find which
commits carry migrations (each runs on prod DB first time on promotion); check
gotcha shapes (pgcrypto/extensions, full-spec-YAML recovery). One deliberate push
after, not incremental. Login PR = no migration; navigator/polish set needs checking.

---

## A. Design source of truth
- ~~**Right-panel width:** 264 vs 290.~~ RESOLVED (2026-06-11): **280px**.
- ~~**Section headers:** collapsible vs static.~~ RESOLVED (2026-06-12): static,
  text-only, non-collapsible; icons removed. Spec to be updated to match.
- **Check detail page:** code has `CheckDetailPage` fully custom (WorkflowStrip,
  no shell). Decide: conform (code task — see "Check-page Jira restyle" card) OR
  intentionally custom (document why in spec).
- ~~**Detail field-row layout:** fixed label width vs right-align.~~ Largely
  addressed by the Jira re-layout (2026-06-12); verify against spec §7.2 and update spec.
- **Status-change flow:** code's `TransitionDialog` + `config/transitions/` layer
  undocumented — this is the start of the Status-workflow phase (above). Document the real flow.
- **Spec gaps (Tier 3):** `TransitionDialog.tsx`, `WorkflowStrip.tsx`,
  `PropertiesPanelShell`/`PropertyRow`, `config/transitions/` (8 files), `RecordMetadata`,
  the `index.ts` barrel — none documented. (Note: detail components were heavily
  consolidated 2026-06-12 — EditableTitleCard, activityTabs, etc. — spec needs a refresh pass.)
- **Grow RECORD_DETAIL_SPEC into a design-system doc** (tokens, StatusPill, shared atoms).
  Note: status colour now has a single source (colors.ts) — partial groundwork done.

## B. Doc fixes (low-stakes)
- **README.md** — MVP-era, broadly stale (non-existent Survey entities, dropped single-client
  clientId scoping, old role list, seed admin mislabelled). Biggest writing job, lowest urgency.
- **CLAUDE.md** — accurate; gap: OpenAPI/Swagger infra not under "Docs in repo". One-line add.
  Also worth adding: the drawer-renders-second-detail-page pattern (suppress page-level state
  writes via narrow flag) and "commit per-stream promptly" (both hard-won 2026-06-12).
- **OpenAPI infra undocumented** in README, DEPLOYMENT-PLAN, release-readiness.

## C. Stale code comments
- `clients.controller.ts:32` — comment says scope "derived from JWT clientId" but JWT no longer
  carries it; `getMine` resolves from `UserClientAssignment`. Fix the comment.

## D. Hygiene passes not yet run (optional)
- **API-side dead code:** dead-code sweep covered only `apps/web`; `apps/api` and
  `packages/shared` never inventoried.
- **Unused dependencies:** no `depcheck` pass on either app.
- **`.claude/` plan files:** confirm `.claude/` gitignored; periodically clear.

## Done — repo-tidy session (2026-06-10)
- Branch confusion resolved; OpenAPI kept, ERD experiment dropped (−3,500 lockfile lines).
- Dead frontend pages removed (IssuesPage, RisksIssuesIssuesListPage, ServiceDeskInbox).
- Legacy asset rollback pages + `asset-management-legacy/*` removed.
- Generated artifacts removed from git + gitignored.
- Operational/security docs reconciled; obsolete PRISMA_SEED_NOTE removed.
- Org-hierarchy phase docs consolidated into `docs/organization-hierarchy-history.md`.

## Done — Jira-polish + login sessions (2026-06-12)
- Service Desk drill-down navigator (queue→ticket→association drawer), URL-driven.
- Detail pages re-laid to Jira model; shared components consolidated
  (TasksSectionContent, activityTabs, EditableTitleCard, detailLayoutContext).
- Activity restyled to tabs (Comments|History|Status|Assignments); comment box restyled.
- Status colour system: single source (colors.ts), bold pill on detail+rail,
  dot+text in queue table.
- Border-radius unified at 6px; PANEL_RADIUS retired.
- Rail rows: status-colour dot, full type name, created date, taller rows.
- Per-instance activity tab state; full-bleed survives drawer close.
- Login/settings redesign: two-panel login, change-own-password (the original
  "colleague can't change password" need — CLOSED).

## Designed but not built / partially shipped
- ~~**Service Desk rich-row redesign**~~ — LARGELY SHIPPED 2026-06-12 (rail rows,
  status display, type lead). Remainder folds into #99 (assignee knownAs display name)
  and the StatusPill/RecordTypeBadge extraction (still pending a second example).