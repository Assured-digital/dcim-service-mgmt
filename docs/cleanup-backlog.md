# Cleanup & Docs Backlog

Deferred items, originally from the repo-tidy session (2026-06-10), updated
2026-06-12 (Jira-polish + login/settings), 2026-06-13 (comment-system +
typography + edit-affordance), and 2026-06-14 (Details-confirm, link-removal,
the prod catch-up, and the full audit-trail story). The repo is "clean enough to
build"; this file tracks the known remainder so it isn't carried in anyone's head.

## PARKED WORK

### Deferred phases (own branch/PR each) — candidate next big pieces

**Roles & permissions / user management** — emerging as the next foundational
theme; unblocks the client-facing work. Cluster: #93 (global/cross-client admin
role), #94 (user management UI), #96 (client-administrator role + client-scoped
user management), #111 (colleague role/permissions definition — the re-scoped
part; audit-trail *visibility* portion is done). Worth taking as one coherent
phase rather than picking off individually. Related: the external/client-user
experience below.

**Status workflow** — statuses/transitions/lifecycle per type, gated transitions
(#128). The status-colour single-source (colors.ts) is groundwork; the existing
`TransitionDialog` + `config/transitions/` layer (see section A) IS the start —
formalise it. Pairs naturally with the just-shipped audit work (transitions →
audit events → approvals-as-gates).

**Approvals** — auditable decision/sign-off (#132); brief drafted. Likely PART OF
status-workflow (approvals-as-gates); surfaces the **Approvals tab** (deliberately
deferred during the audit work — it should arrive WITH this mechanism, not as an
empty placeholder). Change records have existing approval fields to investigate/extend.

**External / client-user experience (large theme)** — client-facing comment
visibility, the CLIENT_VIEWER / PUBLIC_USER experience, the work-note vs
customer-update distinction (incl. a content-free audit `type` discriminator —
deferred from the audit work specifically to design here as one coherent piece),
and a possible client portal view. Design as one unit. Depends partly on the
roles/permissions phase.

### Smaller cards (2026-06-12)
- `ForwardRef(Box3)` console warning on drawer open — pre-existing, non-breaking,
  investigate. (Re-confirmed pre-existing during the link-removal work 2026-06-14.)
- Hardcoded-radius panels (Infra/Asset 10px, assorted 8px) now read rounder than
  the unified 6px baseline — sweep to token.
- SettingsPage uses `borderRadius: 2` + hardcoded colours — off the 6px/token system.
- Check-page Jira restyle (custom non-shell page) — see section A "Check detail page".
- Clear leftover dev stash entry + test SR↔Risk link in local Postgres (harmless).
  (Also: leftover test Risk RSK-2026-5180 + Issue ISS-2026-9403 in local dev — no
  delete endpoint for those types; harmless, handy as History examples.)
- Automated tenant-isolation tests (standing gap).

### Smaller cards (2026-06-13)
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

### Smaller cards (2026-06-14) — from the audit-trail work
- **`ORG_SUPER_ROLES` still includes deprecated ADMIN** (API `auth/role-scope.ts` +
  web `rbac.ts`) — many routes/endpoints still admit ADMIN via this constant. Purge it
  and audit all call sites. SEPARATE access-control task (changes access across many
  routes — needs its own verification); do NOT fold into other work. The audit-view
  gating worked around it by writing the three live admin roles explicitly.
- **`date` kind for `diffRecord`** — date-field changes (scheduledStart/End, dueAt,
  reviewDate) are currently EXCLUDED from audit History because `diff-record.ts` has no
  date kind. Add a `date` kind to the 1a helper so they appear. Clean future addition.
- **`emitAudit` accept a tx client** — triage moved its audit emit just OUTSIDE its
  `$transaction` (emitAudit takes PrismaService, not a tx; the shared helper was
  off-limits) to match every other service. Optional: extend emitAudit to accept a tx
  client to restore transactional audit emits where wanted.
- **`checks.createFollowOn` bypasses CREATED audit emits** — it creates Task/Risk/Issue
  via direct `prisma.create`, skipping those services' CREATED emit. Audit-completeness
  gap; pre-existing.
- **APPROVAL_RECORDED humaniser phrasing** — renders via the humaniser default case
  ("changed Decision: …"), which reads oddly for an approval. Consider a dedicated case
  ("recorded decision: Approved").
- **Asset/Cabinet history consolidation** — Asset & Cabinet kept their separate, richer
  (status-chip) history UI rather than the shared `AuditHistoryList`. Converge LATER by
  levelling-UP the shared component to preserve their chips — do NOT downgrade them to
  force uniformity. Optional.
- **Entity-ref resolution: read-time vs emit-time (note, not a fix)** — the admin audit
  view (#95) resolves entity refs at READ time (shows current names); the per-record
  History tab uses emit-time FROZEN humanised values. Both correct for their purpose;
  documenting the deliberate difference.

### Operational
- **Pipeline/secret rotation, CI hardening** — tracked as GitHub issues (#76–83, #90,
  #69). Not duplicated here.

---

## A. Design source of truth
- ~~**Right-panel width:** 264 vs 290.~~ RESOLVED (2026-06-11): **280px**.
- ~~**Section headers:** collapsible vs static.~~ RESOLVED (2026-06-12): static,
  text-only, non-collapsible; icons removed. Spec to be updated to match.
- **Check detail page:** code has `CheckDetailPage` fully custom (WorkflowStrip,
  no shell). Decide: conform (code task — see "Check-page Jira restyle" card) OR
  intentionally custom (document why in spec). Note: Check now emits CREATED +
  STATUS_UPDATED lifecycle audit events (added 2026-06-14) — a Check History tab
  needs zero backend work when built.
- ~~**Detail field-row layout:** fixed label width vs right-align.~~ Largely
  addressed by the Jira re-layout (2026-06-12); verify against spec §7.2 and update spec.
- **Status-change flow:** code's `TransitionDialog` + `config/transitions/` layer
  undocumented — this is the start of the Status-workflow phase (above). Document the real flow.
- **Activity tabs** — now **Comments | History** only (Status/Assignments dropped
  2026-06-14, folded into the audit-driven History). Approvals tab deferred until the
  approvals mechanism exists. Spec to be updated to match.
- **Spec gaps (Tier 3):** `TransitionDialog.tsx`, `WorkflowStrip.tsx`,
  `PropertiesPanelShell`/`PropertyRow`, `config/transitions/` (8 files), `RecordMetadata`,
  the `index.ts` barrel — none documented. (Detail components heavily consolidated
  2026-06-12/13/14 — EditableTitleCard, activityTabs, RecordDetailShell, AuditHistoryList,
  auditEvents.ts — spec needs a refresh pass.)
- **Grow RECORD_DETAIL_SPEC into a design-system doc** (tokens, StatusPill, shared atoms).
  Note: status colour now has a single source (colors.ts) — partial groundwork done.

## B. Doc fixes (low-stakes)
- **README.md** — MVP-era, broadly stale (non-existent Survey entities, dropped single-client
  clientId scoping, old role list, seed admin mislabelled). Biggest writing job, lowest urgency.
- **CLAUDE.md** — accurate; gap: OpenAPI/Swagger infra not under "Docs in repo". One-line add.
  Also worth adding: the drawer-renders-second-detail-page pattern (suppress page-level state
  writes via narrow flag), "commit per-stream promptly", and "check the branch before building
  + watch the push land" (hard-won across 2026-06-12/13/14).
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
- Detail pages re-laid to Jira model; shared components consolidated.
- Activity restyled to tabs; comment box restyled.
- Status colour system: single source (colors.ts), bold pill on detail+rail, dot+text in queue.
- Border-radius unified at 6px; PANEL_RADIUS retired.
- Login/settings redesign: two-panel login, change-own-password (CLOSED).

## Done — comment system + typography + edit-affordance session (2026-06-13)
- **Comment system** — rich comments with @mentions, notifications, and threading
  (`parentCommentId` / REPLY). Shipped across work-item detail pages, then to PROD.
- **Typography consolidation** — section-header token unified, tertiary → `text.tertiary`
  token, queue greys + metadata matched to scale, 12.5px orphan retired (PR #141).
- **Edit-affordance** — inline subject/description editing with pending/confirm; Stage 2
  added `notify.error` on commit failure.
- **#99 — User display** — assignee / "Submitted by" / History-actor resolve to
  `displayName` (was leaking email); shared `UserDisplay` component.
- **The transition** — depth-0→1 navigator animation; Service Desk drill-down 100% done.

## Done — Details-confirm + prod catch-up + audit-trail session (2026-06-14)
- **Details inline-confirm** — editable Details fields stage as pending; a single
  **Save changes / Discard** bar appears at the panel bottom when any field is dirty
  (batch model, NOT per-field). Save commits all (partial-on-failure: successes commit,
  failures stay pending + error toast); Discard reverts all; Escape discards (or closes
  an open popover). No-op-dirty fixed (re-selecting current value / changing back to
  original doesn't dirty). Closed the REMAINING silent-error-swallow for Details fields.
  Shipped to PROD.
- **Silent-error-swallow — FULLY CLOSED** — subject/description (edit-affordance) +
  Details fields (Details-confirm) both now surface `notify.error` on save failure.
- **Link-removal relocation** — moved from a one-click row button to the linked-record
  drawer's `…` overflow menu (immediate, no confirm). Gated to drawer context; standalone
  pages (no drawer) keep their inline one-click so they can still unlink. Shipped to PROD.
- **Prod catch-up (the HIGHEST-RISK item) — DONE** — prod was ~6 migrations behind
  (record_links, attachments, rich_comments, notifications, parentCommentId, REPLY enum);
  all additive, rehearsed on test, deployed clean in one deliberate push. Prod current.
- **Audit trail — record History (full)** — shared `emit-audit.ts` + `diff-record.ts`
  helpers; ALL 14 emitting services converted to the unified, humanised, client-scoped
  `data` shape (`{changes:[{field,label,from,to}], comment?, reference?, title?}`),
  humanised at emit time. Per-record **History tab** renders the audit stream as compact,
  content-free, one-line-per-event entries (rich field-level diffs where converted;
  degrades gracefully on legacy/old-shape events). Activity tabs restructured to
  **Comments | History** (Status/Assignments folded in). Content-free COMMENTED/REPLIED
  events. Check gained net-new lifecycle emits. Asset/Cabinet kept their separate richer
  history UI (consolidation carded). Shipped to PROD. (Original plan said ~9 services /
  emit-time-only; actual was 14 services.)
- **Audit trail — admin forensic view (#95)** — the admin `/audit` page already existed;
  this added the 3 missing **AuditEvent indexes** (migration), tightened the list/actors
  endpoint role-gating to the live admin roles (ORG_OWNER/ORG_ADMIN/SERVICE_MANAGER,
  dropped deprecated ADMIN), aligned the route gating to match, and humanised the Details
  column + added a read-time **entity-reference resolver** (batched, clientId-scoped,
  reusing record-links' resolver) so every row shows "SR-2026-0009 / <title>" — including
  STATUS_UPDATED/UPDATED events that carry no denormalised reference. Shipped to PROD.

## Designed but not built / partially shipped
- ~~**Details inline-confirm**~~ — SHIPPED 2026-06-14 (see Done above).
- ~~**Audit trail**~~ — SHIPPED 2026-06-14, both halves (see Done above).
- ~~**Service Desk rich-row redesign**~~ — LARGELY SHIPPED 2026-06-12; assignee knownAs
  via #99 (2026-06-13). The StatusPill/RecordTypeBadge extraction (#48) still pending a
  second example to extract against.