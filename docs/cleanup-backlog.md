# Cleanup & Docs Backlog

Deferred items, originally from the repo-tidy session (2026-06-10), updated
2026-06-12 after the Jira-polish + login/settings sessions and again 2026-06-13
after the comment-system + typography + edit-affordance session. The repo is
"clean enough to build"; this file tracks the known remainder so it isn't
carried in anyone's head.

## PARKED WORK (added 2026-06-12 — after polish + login merges)

### Deferred phases (own branch/PR each, dependency-ordered)

**Audit trail** (`feat/audit-trail`) — backend-led, full plan drafted
Every mutation emits structured, client-scoped events with field-level old→new
diffs. New `emit-audit.ts` (shared helper, not injectable) + `diff-record.ts`
(humanise at emit time). Wire into ~9 services; record-links = 2 events/link;
attachments via parent; maintenance via asset.clientId. Two type→entityType
maps (snake↔PascalCase — silent-failure trap if wrong). Schema: AuditEvent
indexes (migration runs on cloud first — watch migrate job). Frontend
`auditEvents.ts`. Tenant-isolation spoof tests required.
ALSO carries the Comments|History|Approvals tab restructure (drop
Status/Assignments into a populated History). **History-tab spec:** History
shows ALL record activity as content-free audit-event lines — including "X added
a work note" / "X replied" (the fact, who/when, NOT the comment body/composer);
comment content stays in the Comments tab. So commenting/replying must generate
audit events. The current interim (History excludes comment content) holds until
this is built.

**Status workflow** — statuses/transitions/lifecycle per type, gated transitions.
The status-colour single-source (colors.ts) is groundwork. Note: the existing
`TransitionDialog` + `config/transitions/` layer (see section A) IS the start of
this — formalise it here.

**Approvals** — auditable decision/sign-off; brief drafted. Likely PART OF
status-workflow (approvals-as-gates); surfaces the Approvals tab. Change records
have existing approval fields to investigate/extend.

### Smaller cards (2026-06-12)
- `ForwardRef(Box3)` console warning on drawer open — pre-existing, non-breaking, investigate.
- Hardcoded-radius panels (Infra/Asset 10px, assorted 8px) now read rounder than
  the unified 6px baseline — sweep to token.
- SettingsPage uses `borderRadius: 2` + hardcoded colours — off the 6px/token system.
- Check-page Jira restyle (custom non-shell page) — see section A "Check detail page".
- Clear leftover dev stash entry + test SR↔Risk link in local Postgres (harmless).
- Automated tenant-isolation tests (standing gap).

### Smaller cards (2026-06-13)
- **Silent-error-swallow** — save handlers swallow errors with no user feedback.
  Partially fixed (subject/description got `notify.error` in edit-affordance Stage 2).
  Remaining: the Details-panel field saves still swallow — folds into the **Details
  inline-confirm** card. (Done for subject/description; remainder in Details-confirm.)
- **Dead `--color-text-tertiary` CSS var** — zero component refs after the typography
  work (commit 2c); the definition at `styles.css:7` is now dead. One-line removal.
- **`+` add-button hover** — verify the background-only-no-resize fix landed (was
  flagged, unsure if it was committed).
- **Maintenance comment posting** — renders rich comments now (threading), but confirm
  posting actually works vs is still a no-op stub (the half-state — renders, but may
  not be able to post).
- **Comments null-clientId behaviour** — comments on null-client Risk/Issue/Asset are
  excluded under concrete-client scope (consistent with resolve-links; a deliberate
  consequence of the comment-scope fix). Known behaviour, NOT a bug.
- **`ALTER TYPE ADD VALUE` footnote** — for future `NotificationType` additions (PG16:
  fine outside a txn, just can't use the new value in the same txn it's added in).

### Operational
**Pre-prod investigation + push (HIGHEST-RISK)** — prod is ~4 migrations behind
(comments, notifications, parentCommentId, REPLY enum) + a full session of frontend.
Pre-push steps: get prod's deployed commit
(`az containerapp show … --query "…image"`); `git log <prod-commit>..main` to
inventory the backlog; `git diff --stat <prod-commit>..main -- apps/api/prisma/` to
inventory the migrations. All four are additive — watch the migrate job on the first
deploy. Check gotcha shapes (pgcrypto/extensions, full-spec-YAML recovery). One
deliberate push, not incremental. The deferred-but-growing risk.

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

## Done — comment system + typography + edit-affordance session (2026-06-13)
- **Comment system** — rich comments with @mentions, notifications, and threading
  (`parentCommentId` / REPLY). Shipped across the work-item detail pages.
- **Typography consolidation** — section-header token unified (fixes CheckDetailPage
  drift), tertiary refs → `text.tertiary` token, queue greys + metadata label/value
  matched to scale, 12.5px queue orphan retired (PR #141).
- **Edit-affordance** — inline subject/description editing with pending/confirm; Stage 2
  added `notify.error` on commit failure. (Remaining silent-error fix for Details-panel
  field saves folds into the **Details inline-confirm** card below.)
- **#99 — User display** — assignee / "Submitted by" / History-actor now resolve to
  `displayName` (was leaking email); shared `UserDisplay` component. (Was "NEXT — in
  progress".)
- **The transition** — depth-0→1 navigator animation shipped. The last piece — Service
  Desk drill-down navigator now 100% done.

## Designed but not built / partially shipped
- **Details inline-confirm** (designed 2026-06-13 — ready to build) — editable Details
  fields (assignee / priority / severity / status / all) change to: pick value → pending
  state with inline ✓ confirm / ✗ cancel → confirm commits + success toast; cancel reverts
  (no API call). Applies to ALL editable Details fields. Intent: deliberate, audit-style
  changes that prevent misclicks. Each control type (select / dropdown / etc.) needs the
  ✓/✗ affordance fitted to it. Fold in `notify.error` on commit failure (+ revert) — this
  absorbs the remaining silent-error-swallow on Details-panel saves. Reuse the existing
  `notify` + dirty patterns. Connects to the **Audit trail** phase (the confirm is the UX;
  the audit event is the record).
- ~~**Service Desk rich-row redesign**~~ — LARGELY SHIPPED 2026-06-12 (rail rows,
  status display, type lead). Remainder (assignee knownAs display name) SHIPPED via #99
  (2026-06-13); the StatusPill/RecordTypeBadge extraction still pending a second example.