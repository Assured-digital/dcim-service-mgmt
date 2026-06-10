# Cleanup & Docs Backlog

Deferred items from the repo-tidy session (2026-06-10). The repo is "clean enough to build":
nothing actively misleads, no generated artifacts in git, dead frontend pages removed.
This file tracks the known remainder so it isn't carried in anyone's head.

## A. Design source of truth (do BEFORE the UI-improvement period)
These are design *decisions*, not cleanup — they define what "consistent" means and unblock
sustained UI work. RECORD_DETAIL_SPEC currently describes a pattern the code has drifted from;
each item below needs a deliberate call (spec is authoritative, OR code changed intentionally),
captured in the spec as the new truth.

- **Right-panel width:** spec says 264px, code is 290px (`RecordDetailShell.tsx`). Pick one, make both agree.
- **Section headers:** spec describes collapsible (chevron/rotation); code's `CentreSectionView` is a
  static header with an icon slot. Decide: collapsible (code is buggy) or static (spec is aspirational, trim it).
- **Check detail page:** spec lists Check among the `RecordDetailShell` pages; code has `CheckDetailPage`
  fully custom (renders `WorkflowStrip`, no shell/popover). Decide: Check should conform (code task) OR
  Check is intentionally custom (recurring inspections ≠ tickets — document why in the spec).
- **Detail field-row layout:** spec §7.2 says no fixed label width, values right-align, space-between;
  code's `DetailFieldRow` uses fixed `width: 80` label, left-aligned value. Reconcile.
- **Status-change flow:** spec documents direct `onStatusChange(to)`; code adds an undocumented
  `TransitionDialog` + `config/transitions/` layer. Document the real flow.
- **Spec gaps (Tier 3):** `TransitionDialog.tsx`, `WorkflowStrip.tsx`, `PropertiesPanelShell`/`PropertyRow`,
  the `config/transitions/` directory (8 files — the actual status-lifecycle source), `RecordMetadata` prop,
  the `index.ts` barrel — none documented.
- **Whether to grow RECORD_DETAIL_SPEC into a broader design-system doc** (tokens, StatusPill, shared atoms)
  that all pages pull from. This is the foundation the UI period stands on.

## B. Doc fixes (low-stakes, not yet done)
- **README.md** — MVP-era, broadly stale: references non-existent Survey/SurveyItem entities, single-client
  `clientId` scoping (dropped), old role list (no ORG_OWNER/ORG_ADMIN, CLIENT_VIEWER mislabelled "future"),
  seed admin mislabelled "Admin" (is ORG_OWNER). Product surface massively understated. Biggest writing job,
  lowest urgency.
- **CLAUDE.md** — accurate; one gap: OpenAPI/Swagger infra not listed under "Docs in repo"
  (`apps/api/src/swagger.ts`, `openapi:generate`, `docs/openapi.json`, served at `/api`). One-line add.
- **OpenAPI infra undocumented everywhere relevant** — README, DEPLOYMENT-PLAN, release-readiness. CLAUDE.md
  "Docs in repo" is the highest-leverage spot to note it.

## C. Stale code comments
- `clients.controller.ts:32` — comment says scope "derived from their JWT clientId", but the JWT no longer
  carries clientId; `getMine` resolves from the `UserClientAssignment` join table. Fix the comment.

## D. Hygiene passes not yet run (optional — none actively harmful)
- **API-side dead code:** the dead-code sweep this session covered only `apps/web`. `apps/api`
  (orphaned services/controllers/DTOs) and `packages/shared` were never inventoried.
- **Unused dependencies:** no `depcheck`/unused-dep pass run on either app.
- **`.claude/` plan files:** Claude Code writes plan files to `C:\Users\jz\.claude\plans\` (auto-named,
  accumulating). Confirm `.claude/` is gitignored so they never get tracked; periodically clear.

## Done this session (for reference)
- Branch confusion resolved; OpenAPI work kept, ERD experiment dropped (−3,500 lockfile lines).
- Dead frontend pages removed (IssuesPage, RisksIssuesIssuesListPage, ServiceDeskInbox).
- Legacy asset rollback pages + `asset-management-legacy/*` routes removed (add-room bug long fixed).
- Generated artifacts removed from git + gitignored: graphify-out/, ERD output, `*.tsbuildinfo`.
- Operational/security docs reconciled: rbac-role-matrix-audit, regression-sweep-checklist, triage-smoke-test;
  obsolete PRISMA_SEED_NOTE removed.
- Three org-hierarchy phase docs consolidated into `docs/organization-hierarchy-history.md` (provenance preserved).

## Designed but not built (ready to pick up)
- **Service Desk rich-row redesign** — drop `@mui/x-data-grid`, Linear-style rows, type-icon lead,
  assignee `knownAs` display name (needs the 3 list services to select `knownAs`/`firstName`/`lastName`).
  Deferred component extraction (StatusPill, RecordTypeBadge, row scaffold) until Risks/Issues gives a
  second real example. Spec'd in the 2026-06-10 design chat.
