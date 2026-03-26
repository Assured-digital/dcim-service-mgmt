# CLAUDE.md — DC Service Management Platform

## Project Overview
Enterprise data centre service management platform built for Assured Digital.
Multi-tenant SaaS: one organisation, multiple clients, role-based access.

## Stack
- **API**: NestJS + Prisma ORM + PostgreSQL (apps/api/)
- **Web**: React + Vite + MUI v5 + TanStack Query (apps/web/)
- **Auth**: JWT with role-based guards (NestJS) + RBAC helpers (frontend)
- **Docker**: Full stack via docker compose

## Running the project
```powershell
docker compose up --build
docker compose exec api npx prisma db push
docker compose exec api npx prisma db seed
```

## Key conventions

### API (NestJS)
- Every module has: `controller.ts`, `service.ts`, `dto.ts`, `module.ts`
- All endpoints are scoped by client via `resolveClientScope(user, requestedClientId, prisma)`
- Status transitions use `POST /:id/status` with `{ status, ...extras }`
- Audit events logged on every mutation via `audit-events` service
- DTOs use class-validator decorators
- Always check existing patterns in `risks/` or `issues/` before building new modules

### Frontend (React)
- All routes in `apps/web/src/routes/`
- API calls via `api` helper from `../lib/api` — never use fetch directly
- Auth/roles via `hasAnyRole` from `../lib/rbac`
- Queries use TanStack Query — always invalidate relevant queries after mutations
- `onClose()` must be called before `onSuccess()` in modals to prevent unmounted component errors

### Enterprise detail page pattern
Every detail page follows this exact structure — do not deviate:

1. **Top bar**: Back button left + reference/status pill (white bg, border, subtle shadow, flexShrink:0, whiteSpace:nowrap) + destructive action far right
2. **Info container**: `bgcolor: var(--color-background-secondary)`, `borderTopRadius:8`, contains SUBJECT/TITLE label (InfoField), divider, DESCRIPTION label (InfoField), divider at bottom
3. **Workflow strip**: Attached below info container (`borderTop:none`), STATUS label + InfoOutlined tooltip icon inline, stage pills with Tooltip on each showing description, no inline description text
4. **Two-column layout**: `alignItems:"start"` on grid, `alignSelf:"start"` on both columns, right column 260px
5. **Left card**: Tabbed content with Badge counts on tabs
6. **Right column**: Compact properties panel (inline label/value rows with Dividers) + Linked tasks panel (always visible, dashed empty state, instant refresh via onSuccess)

### InfoField component (use everywhere for labelled fields)
```tsx
function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
        color: "var(--color-text-tertiary)", mb: 0.5
      }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}
```

### Badge component (use for tab counts)
```tsx
function Badge({ count }: { count: number }) {
  return (
    <Box sx={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 18, height: 18, borderRadius: 9, px: 0.75,
      bgcolor: "#e2e8f0", ml: 0.75
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 700, color: "#475569", lineHeight: 1 }}>
        {count}
      </Typography>
    </Box>
  )
}
```

### Top bar pill pattern
```tsx
<Box sx={{
  display: "flex", alignItems: "center", gap: 1,
  px: 1.5, py: 0.75, borderRadius: 2, flexShrink: 0,
  bgcolor: "var(--color-background-primary)",
  border: "1px solid var(--color-border-secondary)",
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)"
}}>
  <Typography sx={{
    fontFamily: "monospace", fontSize: 12, fontWeight: 700,
    color: "var(--color-text-secondary)", whiteSpace: "nowrap"
  }}>
    {reference}
  </Typography>
  <Box sx={{ width: 1, height: 14, bgcolor: "var(--color-border-tertiary)" }} />
  <Chip size="small" ... />
</Box>
```

### Status flow pattern
- Status transitions always go through `POST /:id/status`
- Workflow strip shows all stages, current highlighted dark, past greyed, next steps blue/clickable
- Transitions open a confirm dialog — never transition inline without confirmation
- Destructive transitions (cancel, close) use `color="error"` on confirm button
- Required fields (resolution, closure summary) block confirmation when empty

### List pages
- Status filter tabs at top of table — status tabs in logical order, ALL tab at the end
- No count badge on ALL tab
- Default filter is first active status (not ALL)
- Log/create button top right of page header

### Navigation state
- Task → linked record: `state: { fromTask: task.id, fromTaskRef: task.reference }`
- SR → task: `state: { fromSR: sr.id, fromSRRef: sr.reference }`
- Back buttons are context-aware and use this state

## Module status flows

### Service Request
`NEW → ASSIGNED → IN_PROGRESS → WAITING_CUSTOMER → COMPLETED → CLOSED`
CANCELLED is a side-exit available from most states, shown as outlined error button in top bar.
Closure summary required for COMPLETED and CLOSED.

### Risk
`IDENTIFIED → ASSESSED → MITIGATING → ACCEPTED → CLOSED`
ASSESSED requires likelihood/impact confirmation.
ACCEPTED requires acceptance note.
MITIGATING auto-switches to mitigation plan tab.

### Issue
`OPEN → IN_PROGRESS → RESOLVED → CLOSED`
Resolution required for RESOLVED, optional for CLOSED.

### Task
`OPEN → IN_PROGRESS → BLOCKED → DONE`
BLOCKED shown in dark red in workflow strip.
DONE allows reopen back to OPEN.

## Schema key models
- **Risk**: reference, likelihood, impact, status (5-stage), source (MANUAL/SURVEY/INCIDENT/CHANGE/AUDIT), mitigationPlan, acceptanceNote
- **Issue**: reference, severity (RED/AMBER/GREEN), status (4-stage), resolution, reviewDate
- **Task**: reference (TSK-YYYY-NNNN), linkedEntityType, linkedEntityId, assigneeId
- **Site**: clientId, name, address — no status field
- **Cabinet**: siteId, name, totalU, notes — no clientId field
- **Survey**: clientId, siteId, surveyType, status (SurveyStatus enum)

## RBAC roles
ORG_OWNER > ORG_ADMIN > ADMIN > SERVICE_MANAGER > SERVICE_DESK_ANALYST > ENGINEER > CLIENT_VIEWER
`ORG_SUPER_ROLES = [ORG_OWNER, ORG_ADMIN, ADMIN]`
Most management actions require `[...ORG_SUPER_ROLES, SERVICE_MANAGER, SERVICE_DESK_ANALYST]`
Engineer can update task status. CLIENT_VIEWER is read-only.

## Pages built (do not rebuild from scratch)
- ServiceDeskPage — triage + SR list with status filter tabs
- ServiceRequestDetailPage — full enterprise pattern, customer updates, closure tab
- TasksPage — board/table toggle, status filter tabs
- TaskDetailPage — enterprise pattern, fromSR navigation
- RisksIssuesPage — combined page, Risks/Issues pill switcher
- RiskDetailPage — 5-stage workflow, RAG score, mitigation plan tab
- IssueDetailPage — 4-stage workflow, resolution tab
- SitesPage / SiteDetailPage — assets, cabinets, surveys tabs
- SurveysPage / SurveyDetailPage
- WorkPackagesPage, AssetsPage, AuditTrailPage, UsersPage, ClientsPage

## Pending work
1. Engineering checks (surveys) — proper build with execution UI, follow-on task/risk from failed items
2. Dashboard with real data
3. Roles review — engineer view
4. Customer portal foundation