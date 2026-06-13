import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography
} from "@mui/material"
import {
  DataGrid, GridColDef, GridRenderCellParams,
  GridToolbarContainer,
  GridToolbarColumnsButton, GridToolbarExport
} from "@mui/x-data-grid"
import AddIcon from "@mui/icons-material/Add"
import { chipSx } from "../components/shared"
import { LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

// ─── Types ──────────────────────────────────────────────────────────────────

type Risk = {
  id: string; reference: string; title: string; description: string
  likelihood: string; impact: string; status: string
  mitigationPlan: string | null; source: string | null
  reviewDate: string | null; closedAt: string | null
  createdAt: string; updatedAt: string
}

type Issue = {
  id: string; reference: string; title: string; description: string
  severity: string; status: string; resolution: string | null
  reviewDate: string | null; closedAt: string | null
  createdAt: string; updatedAt: string
}

type EntityType = "risks" | "issues"
type TypeFilter = "all" | "risks" | "issues"

type UnifiedRow = {
  kind: "RSK" | "ISS"
  id: string
  reference: string
  title: string
  status: string
  severityKey: string
  severityLabel: string
  updatedAt: string
}

const TYPE_BADGE_TOKENS: Record<"RSK" | "ISS", { bg: string; text: string }> = {
  RSK: { bg: "#fef3c7", text: "#b45309" },
  ISS: { bg: "#fce7f3", text: "#be185d" },
}

function RiskIssueTypeBadge({ kind }: { kind: "RSK" | "ISS" }) {
  const token = TYPE_BADGE_TOKENS[kind]
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 30,
        height: 20,
        px: "7px",
        borderRadius: "4px",
        bgcolor: token.bg,
        color: token.text,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        lineHeight: 1,
      }}
    >
      {kind}
    </Box>
  )
}

// ─── Constants ──────────────────────────────────────────────────────────────

const HEADER_HEIGHT = 49
const STALE_TIME = 60_000

const RISK_STATUSES = ["IDENTIFIED", "UNDER_REVIEW", "MITIGATING", "ACCEPTED", "CLOSED"]
const RISK_STATUS_LABELS: Record<string, string> = { IDENTIFIED: "Identified", UNDER_REVIEW: "Under review", MITIGATING: "Mitigating", ACCEPTED: "Accepted", CLOSED: "Closed" }

const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
const ISSUE_STATUS_LABELS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" }

const RAG_LABELS: Record<string, string> = { RED: "High", AMBER: "Medium", GREEN: "Low" }

type QuickView = "all" | "assigned" | "urgent" | "review_due"
const QUICK_VIEWS: { key: QuickView; label: string }[] = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned to me" },
  { key: "urgent", label: "Urgent" },
  { key: "review_due", label: "Review overdue" },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function deriveRag(likelihood: string, impact: string): "RED" | "AMBER" | "GREEN" {
  const score = (v: string) => v === "HIGH" ? 3 : v === "MEDIUM" ? 2 : 1
  const s = score(likelihood) * score(impact)
  return s >= 6 ? "RED" : s >= 3 ? "AMBER" : "GREEN"
}

function ragChipSx(rag: string) {
  if (rag === "RED") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 600, fontSize: 11 }
  if (rag === "AMBER") return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 600, fontSize: 11 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 600, fontSize: 11 }
}

function reviewStatus(reviewDate: string | null, status: string): "overdue" | "due_soon" | "ok" | "none" | "closed" {
  if (status === "CLOSED") return "closed"
  if (!reviewDate) return "none"
  const d = new Date(reviewDate)
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400000)
  if (d < now) return "overdue"
  if (d < in7) return "due_soon"
  return "ok"
}

function daysBetween(from: string): number { return Math.round((Date.now() - new Date(from).getTime()) / 86400000) }

// ─── Filter state ───────────────────────────────────────────────────────────

type RiskFilterState = { statuses: Set<string>; rags: Set<string>; reviewFilter: Set<string> }
type IssueFilterState = { statuses: Set<string>; severities: Set<string>; reviewFilter: Set<string> }

const INITIAL_RISK_FILTERS: RiskFilterState = { statuses: new Set(), rags: new Set(), reviewFilter: new Set() }
const INITIAL_ISSUE_FILTERS: IssueFilterState = { statuses: new Set(), severities: new Set(), reviewFilter: new Set() }

function applyRiskFilters(risks: Risk[], f: RiskFilterState, qv: QuickView): Risk[] {
  let out = risks
  if (qv === "urgent") out = out.filter(r => deriveRag(r.likelihood, r.impact) === "RED")
  else if (qv === "review_due") out = out.filter(r => reviewStatus(r.reviewDate, r.status) === "overdue")
  else if (qv === "assigned") out = out.filter(r => r.status === "UNDER_REVIEW" || r.status === "MITIGATING")
  if (f.statuses.size > 0) out = out.filter(r => f.statuses.has(r.status))
  if (f.rags.size > 0) out = out.filter(r => f.rags.has(deriveRag(r.likelihood, r.impact)))
  if (f.reviewFilter.size > 0) out = out.filter(r => f.reviewFilter.has(reviewStatus(r.reviewDate, r.status)))
  return out
}

function applyIssueFilters(issues: Issue[], f: IssueFilterState, qv: QuickView): Issue[] {
  let out = issues
  if (qv === "urgent") out = out.filter(i => i.severity === "RED")
  else if (qv === "review_due") out = out.filter(i => reviewStatus(i.reviewDate, i.status) === "overdue")
  else if (qv === "assigned") out = out.filter(i => i.status === "OPEN" || i.status === "IN_PROGRESS")
  if (f.statuses.size > 0) out = out.filter(i => f.statuses.has(i.status))
  if (f.severities.size > 0) out = out.filter(i => f.severities.has(i.severity))
  if (f.reviewFilter.size > 0) out = out.filter(i => f.reviewFilter.has(reviewStatus(i.reviewDate, i.status)))
  return out
}

function countActiveFilters(f: RiskFilterState | IssueFilterState): number {
  return Object.values(f).reduce((sum, set) => sum + (set instanceof Set ? set.size : 0), 0)
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function GridInnerToolbar() {
  return (
    <GridToolbarContainer sx={{ px: 1, py: 0.5, gap: 1, borderBottom: "1px solid #e2e8f0" }}>
      <GridToolbarColumnsButton slotProps={{ button: { sx: { fontSize: 12 } } }} />
      <GridToolbarExport csvOptions={{ utf8WithBom: true }} printOptions={{ disableToolbarButton: true }} slotProps={{ button: { sx: { fontSize: 12 } } }} />
    </GridToolbarContainer>
  )
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", p: "12px 14px" }}>
      <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, mb: "4px" }}>{label}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 500, color: color ?? "#0f172a" }}>{value}</Typography>
    </Box>
  )
}

function FilterSection({ label, items, selected, onToggle }: {
  label: string; items: { key: string; label: string; count: number; chipSx?: Record<string, any> }[]; selected: Set<string>; onToggle: (key: string) => void
}) {
  return (
    <Box sx={{ mb: "6px" }}>
      <Typography sx={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", px: "12px", mb: "2px" }}>{label}</Typography>
      {items.map(item => {
        const isActive = selected.has(item.key)
        return (
          <Stack key={item.key} direction="row" alignItems="center" onClick={() => onToggle(item.key)}
            sx={{ px: "12px", py: "1px", cursor: "pointer", "&:hover": { bgcolor: "rgba(0,0,0,0.02)" } }}>
            <Checkbox checked={isActive} size="small" sx={{ p: 0, mr: "8px", "& .MuiSvgIcon-root": { fontSize: 14 } }} />
            {item.chipSx ? <Chip size="small" label={item.label} sx={{ ...item.chipSx, height: 18 }} /> : <Typography sx={{ flex: 1, fontSize: 12, color: isActive ? "primary.main" : "#475569", fontWeight: isActive ? 500 : 400 }}>{item.label}</Typography>}
            <Typography sx={{ fontSize: 10, color: "#94a3b8", ml: "auto" }}>{item.count}</Typography>
          </Stack>
        )
      })}
    </Box>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function RisksIssuesPage() {
  const navigate = useNavigate()
  const { setRecordLabel } = useBreadcrumb()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [searchParams, setSearchParams] = useSearchParams()
  const rawType = searchParams.get("type")
  const typeFilter: TypeFilter =
    rawType === "risks" ? "risks" : rawType === "issues" ? "issues" : "all"

  function setTypeFilter(next: TypeFilter) {
    const params = new URLSearchParams(searchParams)
    if (next === "all") params.delete("type")
    else params.set("type", next)
    setSearchParams(params, { replace: true })
  }

  const [quickView, setQuickView] = React.useState<QuickView>("all")
  const [riskFilters, setRiskFilters] = React.useState<RiskFilterState>(INITIAL_RISK_FILTERS)
  const [issueFilters, setIssueFilters] = React.useState<IssueFilterState>(INITIAL_ISSUE_FILTERS)

  const [riskLogOpen, setRiskLogOpen] = React.useState(false)
  const [issueLogOpen, setIssueLogOpen] = React.useState(false)

  // Sidebar detail filters are entity-specific. When the top-level type filter
  // is "all", default to showing risk-style detail filters.
  const sidebarEntity: EntityType = typeFilter === "issues" ? "issues" : "risks"

  const { data: risksRaw = [], isLoading: risksLoading } = useQuery({ queryKey: ["risks"], queryFn: async () => (await api.get<Risk[]>("/risks")).data, staleTime: STALE_TIME })
  const { data: issuesRaw = [], isLoading: issuesLoading } = useQuery({ queryKey: ["issues"], queryFn: async () => (await api.get<Issue[]>("/issues")).data, staleTime: STALE_TIME })

  const openRisks = React.useMemo(() => risksRaw.filter(r => r.status !== "CLOSED"), [risksRaw])
  const openIssues = React.useMemo(() => issuesRaw.filter(i => i.status !== "CLOSED"), [issuesRaw])
  const filteredRisks = React.useMemo(() => applyRiskFilters(risksRaw, riskFilters, quickView), [risksRaw, riskFilters, quickView])
  const filteredIssues = React.useMemo(() => applyIssueFilters(issuesRaw, issueFilters, quickView), [issuesRaw, issueFilters, quickView])

  const riskKpis = React.useMemo(() => {
    const high = openRisks.filter(r => deriveRag(r.likelihood, r.impact) === "RED").length
    const overdue = openRisks.filter(r => reviewStatus(r.reviewDate, r.status) === "overdue").length
    const ages = openRisks.map(r => daysBetween(r.createdAt))
    return { open: openRisks.length, high, overdue, avgAge: ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0 }
  }, [openRisks])

  const issueKpis = React.useMemo(() => {
    const high = openIssues.filter(i => i.severity === "RED").length
    const overdue = openIssues.filter(i => reviewStatus(i.reviewDate, i.status) === "overdue").length
    const ages = openIssues.map(i => daysBetween(i.createdAt))
    return { open: openIssues.length, high, overdue, avgAge: ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0 }
  }, [openIssues])

  const riskStatusCounts = React.useMemo(() => { const c: Record<string, number> = {}; for (const s of RISK_STATUSES) c[s] = risksRaw.filter(r => r.status === s).length; return c }, [risksRaw])
  const riskRagCounts = React.useMemo(() => { const c: Record<string, number> = { RED: 0, AMBER: 0, GREEN: 0 }; for (const r of openRisks) c[deriveRag(r.likelihood, r.impact)]++; return c }, [openRisks])
  const riskReviewCounts = React.useMemo(() => { const c: Record<string, number> = { overdue: 0, due_soon: 0, none: 0 }; for (const r of openRisks) { const s = reviewStatus(r.reviewDate, r.status); if (s in c) c[s]++ }; return c }, [openRisks])
  const issueStatusCounts = React.useMemo(() => { const c: Record<string, number> = {}; for (const s of ISSUE_STATUSES) c[s] = issuesRaw.filter(i => i.status === s).length; return c }, [issuesRaw])
  const issueSeverityCounts = React.useMemo(() => { const c: Record<string, number> = { RED: 0, AMBER: 0, GREEN: 0 }; for (const i of openIssues) c[i.severity] = (c[i.severity] ?? 0) + 1; return c }, [openIssues])
  const issueReviewCounts = React.useMemo(() => { const c: Record<string, number> = { overdue: 0, due_soon: 0, none: 0 }; for (const i of openIssues) { const s = reviewStatus(i.reviewDate, i.status); if (s in c) c[s]++ }; return c }, [openIssues])

  const quickCounts = React.useMemo(() => sidebarEntity === "risks" ? {
    all: risksRaw.length,
    assigned: risksRaw.filter(r => r.status === "UNDER_REVIEW" || r.status === "MITIGATING").length,
    urgent: openRisks.filter(r => deriveRag(r.likelihood, r.impact) === "RED").length,
    review_due: openRisks.filter(r => reviewStatus(r.reviewDate, r.status) === "overdue").length,
  } : {
    all: issuesRaw.length,
    assigned: issuesRaw.filter(i => i.status === "OPEN" || i.status === "IN_PROGRESS").length,
    urgent: openIssues.filter(i => i.severity === "RED").length,
    review_due: openIssues.filter(i => reviewStatus(i.reviewDate, i.status) === "overdue").length,
  }, [sidebarEntity, risksRaw, issuesRaw, openRisks, openIssues])

  React.useEffect(() => {
    setRecordLabel(typeFilter === "issues" ? "Issues" : typeFilter === "risks" ? "Risks" : "Risks & issues")
  }, [typeFilter, setRecordLabel])

  function toggleRiskFilter(kind: keyof RiskFilterState, value: string) { setRiskFilters(prev => { const set = new Set(prev[kind]); if (set.has(value)) set.delete(value); else set.add(value); return { ...prev, [kind]: set } }) }
  function toggleIssueFilter(kind: keyof IssueFilterState, value: string) { setIssueFilters(prev => { const set = new Set(prev[kind]); if (set.has(value)) set.delete(value); else set.add(value); return { ...prev, [kind]: set } }) }

  // Build the unified row set: merge filtered risks + issues into a single
  // shape the grid can render, then sort by updatedAt descending.
  const unifiedRows: UnifiedRow[] = React.useMemo(() => {
    const rows: UnifiedRow[] = []
    if (typeFilter !== "issues") {
      for (const r of filteredRisks) {
        const rag = deriveRag(r.likelihood, r.impact)
        rows.push({
          kind: "RSK",
          id: `RSK-${r.id}`,
          reference: r.reference,
          title: r.title,
          status: r.status,
          severityKey: rag,
          severityLabel: RAG_LABELS[rag] ?? rag,
          updatedAt: r.updatedAt,
        })
      }
    }
    if (typeFilter !== "risks") {
      for (const i of filteredIssues) {
        rows.push({
          kind: "ISS",
          id: `ISS-${i.id}`,
          reference: i.reference,
          title: i.title,
          status: i.status,
          severityKey: i.severity,
          severityLabel: RAG_LABELS[i.severity] ?? i.severity,
          updatedAt: i.updatedAt,
        })
      }
    }
    rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return rows
  }, [typeFilter, filteredRisks, filteredIssues])

  const unifiedColumns: GridColDef<UnifiedRow>[] = React.useMemo(() => [
    {
      field: "kind", headerName: "Type", width: 70, sortable: false,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => <RiskIssueTypeBadge kind={p.value as "RSK" | "ISS"} />,
    },
    {
      field: "reference", headerName: "Ref", width: 110,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "#475569", fontWeight: 700 }}>{p.value as string}</Typography>
      ),
    },
    {
      field: "title", headerName: "Title", flex: 1, minWidth: 240,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => (
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>{p.value as string}</Typography>
      ),
    },
    {
      field: "status", headerName: "Status", width: 130,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => {
        const labels = (p.row as UnifiedRow).kind === "RSK" ? RISK_STATUS_LABELS : ISSUE_STATUS_LABELS
        return <Chip size="small" sx={chipSx(p.value as string)} label={labels[p.value as string] ?? p.value} />
      },
    },
    {
      field: "severityKey", headerName: "Severity / Impact", width: 150, sortable: false,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => (
        <Chip size="small" sx={ragChipSx(p.value as string)} label={(p.row as UnifiedRow).severityLabel} />
      ),
    },
    {
      field: "assignee", headerName: "Assignee", width: 140, sortable: false,
      valueGetter: () => "",
      renderCell: () => (
        <Typography sx={{ fontSize: 12, fontStyle: "italic", color: "#94a3b8" }}>Unassigned</Typography>
      ),
    },
    {
      field: "updatedAt", headerName: "Updated", width: 110,
      valueGetter: v => v ? new Date(v as string) : null,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => (
        <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>
          {p.value ? (p.value as Date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
        </Typography>
      ),
    },
  ], [])

  const totalRaw = typeFilter === "risks" ? risksRaw.length
    : typeFilter === "issues" ? issuesRaw.length
    : risksRaw.length + issuesRaw.length
  const totalLabel = typeFilter === "risks" ? "risks"
    : typeFilter === "issues" ? "issues"
    : "items"

  const kpis = sidebarEntity === "risks" ? riskKpis : issueKpis
  const filterCount = sidebarEntity === "risks" ? countActiveFilters(riskFilters) : countActiveFilters(issueFilters)

  const isLoading = risksLoading || issuesLoading

  const gridSx = React.useMemo(() => ({
    border: "none", height: "100%",
    "& .MuiDataGrid-cell": {
      borderColor: "#f1f5f9",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
    },
    "& .MuiDataGrid-columnHeaders": { bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0", fontSize: 12 },
    "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 500 },
    "& .MuiDataGrid-footerContainer": { borderTop: "1px solid #e2e8f0" },
    "& .MuiDataGrid-row:hover": { bgcolor: "#f8fafc" },
  }), [])

  function handleRowClick(row: UnifiedRow) {
    const realId = row.id.replace(/^(RSK|ISS)-/, "")
    if (row.kind === "RSK") navigate(`/risks-issues/risks/${realId}`)
    else navigate(`/risks-issues/issues/${realId}`)
  }

  const TYPE_OPTIONS: Array<{ id: TypeFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "risks", label: "Risks" },
    { id: "issues", label: "Issues" },
  ]

  return (
    <Box sx={{ mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" }, height: "calc(100vh - 56px)", display: "flex", overflow: "hidden", bgcolor: "var(--color-background-tertiary)" }}>

      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <Box sx={{ width: 240, minWidth: 240, bgcolor: "var(--color-background-primary)", borderRight: "1px solid var(--color-border-primary)", overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <Box sx={{ height: HEADER_HEIGHT, borderBottom: "1px solid var(--color-border-primary)", flexShrink: 0, display: "flex", alignItems: "center", px: "16px" }}>
          <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            Risks &amp; issues
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, py: "4px" }}>
          <Typography sx={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", px: "12px", mb: "2px" }}>Quick views</Typography>
          {QUICK_VIEWS.map(v => {
            const isActive = quickView === v.key
            return (
              <Stack key={v.key} direction="row" alignItems="center" onClick={() => setQuickView(v.key)}
                sx={{ px: "12px", py: "3px", cursor: "pointer", borderLeft: "2px solid", borderLeftColor: isActive ? "primary.main" : "transparent", bgcolor: isActive ? "rgba(29,78,216,0.07)" : "transparent", "&:hover": { bgcolor: isActive ? "rgba(29,78,216,0.07)" : "rgba(0,0,0,0.03)" } }}>
                <Typography sx={{ flex: 1, fontSize: 12, color: isActive ? "primary.main" : "#475569", fontWeight: isActive ? 600 : 400 }}>{v.label}</Typography>
                <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{quickCounts[v.key] ?? 0}</Typography>
              </Stack>
            )
          })}

          <Box sx={{ height: 1, bgcolor: "#f1f5f9", mx: "12px", my: "6px" }} />

          {typeFilter === "issues" ? (
            <>
              <FilterSection label="Status" items={ISSUE_STATUSES.map(s => ({ key: s, label: ISSUE_STATUS_LABELS[s], count: issueStatusCounts[s] ?? 0 }))} selected={issueFilters.statuses} onToggle={v => toggleIssueFilter("statuses", v)} />
              <FilterSection label="Severity" items={[
                { key: "RED", label: "High", count: issueSeverityCounts.RED, chipSx: ragChipSx("RED") },
                { key: "AMBER", label: "Medium", count: issueSeverityCounts.AMBER, chipSx: ragChipSx("AMBER") },
                { key: "GREEN", label: "Low", count: issueSeverityCounts.GREEN, chipSx: ragChipSx("GREEN") },
              ]} selected={issueFilters.severities} onToggle={v => toggleIssueFilter("severities", v)} />
              <FilterSection label="Review status" items={[
                { key: "overdue", label: "Overdue", count: issueReviewCounts.overdue },
                { key: "due_soon", label: "Due this week", count: issueReviewCounts.due_soon },
                { key: "none", label: "No date set", count: issueReviewCounts.none },
              ]} selected={issueFilters.reviewFilter} onToggle={v => toggleIssueFilter("reviewFilter", v)} />
            </>
          ) : typeFilter === "risks" ? (
            <>
              <FilterSection label="Status" items={RISK_STATUSES.map(s => ({ key: s, label: RISK_STATUS_LABELS[s], count: riskStatusCounts[s] ?? 0 }))} selected={riskFilters.statuses} onToggle={v => toggleRiskFilter("statuses", v)} />
              <FilterSection label="RAG rating" items={[
                { key: "RED", label: "High", count: riskRagCounts.RED, chipSx: ragChipSx("RED") },
                { key: "AMBER", label: "Medium", count: riskRagCounts.AMBER, chipSx: ragChipSx("AMBER") },
                { key: "GREEN", label: "Low", count: riskRagCounts.GREEN, chipSx: ragChipSx("GREEN") },
              ]} selected={riskFilters.rags} onToggle={v => toggleRiskFilter("rags", v)} />
              <FilterSection label="Review status" items={[
                { key: "overdue", label: "Overdue", count: riskReviewCounts.overdue },
                { key: "due_soon", label: "Due this week", count: riskReviewCounts.due_soon },
                { key: "none", label: "No date set", count: riskReviewCounts.none },
              ]} selected={riskFilters.reviewFilter} onToggle={v => toggleRiskFilter("reviewFilter", v)} />
            </>
          ) : (
            <Box sx={{ px: "12px", pt: "4px" }}>
              <Typography sx={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
                Pick Risks or Issues to filter further.
              </Typography>
            </Box>
          )}

          {filterCount > 0 && typeFilter !== "all" ? (
            <Box sx={{ px: "12px", pt: "4px" }}>
              <Typography onClick={() => sidebarEntity === "risks" ? setRiskFilters(INITIAL_RISK_FILTERS) : setIssueFilters(INITIAL_ISSUE_FILTERS)}
                sx={{ fontSize: 11, color: "#2563eb", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>
                Clear all filters ({filterCount})
              </Typography>
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* ── Right panel ────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Top bar — TYPE filter chips on the left, Log button on the right. */}
        <Box sx={{ height: HEADER_HEIGHT, bgcolor: "var(--color-background-primary)", borderBottom: "1px solid var(--color-border-primary)", px: "24px", display: "flex", alignItems: "center", flexShrink: 0, gap: 1.5 }}>
          <Stack direction="row" spacing={0.75} sx={{ flex: 1 }}>
            {TYPE_OPTIONS.map(t => {
              const isActive = typeFilter === t.id
              return (
                <Box
                  key={t.id}
                  onClick={() => setTypeFilter(t.id)}
                  sx={{
                    px: 1.25, py: 0.5, borderRadius: 999, cursor: "pointer",
                    fontSize: 12, fontWeight: isActive ? 600 : 500,
                    bgcolor: isActive ? "#e8f1ff" : "transparent",
                    color: isActive ? "primary.main" : "#475569",
                    border: isActive ? "1px solid #bfdbfe" : "1px solid #e2e8f0",
                    "&:hover": { bgcolor: isActive ? "#e8f1ff" : "#f8fafc" },
                  }}
                >
                  {t.label}
                </Box>
              )
            })}
          </Stack>
          {canManage ? (
            <Stack direction="row" spacing={1}>
              {typeFilter !== "issues" ? (
                <Button size="small" variant={typeFilter === "risks" ? "contained" : "outlined"} startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={() => setRiskLogOpen(true)} sx={{ fontSize: 12 }}>Log risk</Button>
              ) : null}
              {typeFilter !== "risks" ? (
                <Button size="small" variant={typeFilter === "issues" ? "contained" : "outlined"} startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={() => setIssueLogOpen(true)} sx={{ fontSize: 12 }}>Log issue</Button>
              ) : null}
            </Stack>
          ) : null}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, p: "16px 20px", display: "flex", flexDirection: "column" }}>
          {typeFilter !== "all" ? (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: "10px", mb: "16px", flexShrink: 0 }}>
              <KpiCard label={`Open ${sidebarEntity}`} value={kpis.open} />
              <KpiCard label="High severity" value={kpis.high} color={kpis.high > 0 ? "#b91c1c" : undefined} />
              <KpiCard label="Review overdue" value={kpis.overdue} color={kpis.overdue > 0 ? "#b45309" : undefined} />
              <KpiCard label="Avg age (days)" value={kpis.avgAge} />
            </Box>
          ) : null}

          <Box sx={{ flex: 1, minHeight: 400 }}>
            <Box sx={{ height: "100%", minWidth: 0, bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <Box sx={{ px: "14px", py: "6px", borderBottom: "1px solid #e2e8f0", fontSize: 11.5, color: "#64748b", display: "flex", alignItems: "center", flexShrink: 0 }}>
                <Box component="span" sx={{ color: "#0f172a", fontWeight: 500 }}>{unifiedRows.length}</Box>
                {" of "}
                <Box component="span" sx={{ color: "#0f172a", fontWeight: 500, mx: "3px" }}>{totalRaw}</Box>
                {totalLabel}{typeFilter !== "all" && filterCount > 0 ? ` · ${filterCount} filter${filterCount !== 1 ? "s" : ""} active` : ""}
              </Box>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {isLoading ? <LoadingState /> : (
                  <DataGrid
                    rows={unifiedRows}
                    columns={unifiedColumns}
                    density="compact"
                    rowHeight={64}
                    initialState={{
                      pagination: { paginationModel: { pageSize: 25 } },
                      sorting: { sortModel: [{ field: "updatedAt", sort: "desc" }] },
                    }}
                    pageSizeOptions={[25, 50, 100]}
                    disableRowSelectionOnClick
                    onRowClick={params => handleRowClick(params.row as UnifiedRow)}
                    slots={{ toolbar: GridInnerToolbar }}
                    sx={gridSx}
                  />
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <CreateRiskModal open={riskLogOpen} onClose={() => setRiskLogOpen(false)} />
      <CreateIssueModal open={issueLogOpen} onClose={() => setIssueLogOpen(false)} />
    </Box>
  )
}

// ─── Exported create modals (reusable from other detail pages) ─────────────

type CreateRecordModalProps = {
  open: boolean
  onClose: () => void
  linkedEntityType?: string
  linkedEntityId?: string
  linkedEntityLabel?: string
  onSuccess?: () => Promise<void> | void
}

function LinkedBanner({ label }: { label?: string }) {
  if (!label) return null
  return (
    <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#f0f9ff", border: "1px solid #bae6fd" }}>
      <Typography variant="caption" color="#0369a1">Linked to: <strong>{label}</strong></Typography>
    </Box>
  )
}

export function CreateRiskModal({ open, onClose, linkedEntityType, linkedEntityId, linkedEntityLabel, onSuccess }: CreateRecordModalProps) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [likelihood, setLikelihood] = React.useState("MEDIUM")
  const [impact, setImpact] = React.useState("MEDIUM")
  const [saving, setSaving] = React.useState(false)

  function reset() { setTitle(""); setDescription(""); setLikelihood("MEDIUM"); setImpact("MEDIUM") }

  async function handleSave() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/risks", {
        title, description, likelihood, impact, source: "MANUAL",
        linkedEntityType: linkedEntityType || undefined,
        linkedEntityId: linkedEntityId || undefined
      })
      onClose(); reset()
      qc.invalidateQueries({ queryKey: ["risks"] })
      await onSuccess?.()
      notify.success("Risk logged")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to log risk")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Log risk</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <LinkedBanner label={linkedEntityLabel} />
          <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} required fullWidth autoFocus />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} required fullWidth multiline rows={3} />
          <Stack direction="row" spacing={2}>
            <TextField select label="Likelihood" value={likelihood} onChange={e => setLikelihood(e.target.value)} fullWidth><MenuItem value="LOW">Low</MenuItem><MenuItem value="MEDIUM">Medium</MenuItem><MenuItem value="HIGH">High</MenuItem></TextField>
            <TextField select label="Impact" value={impact} onChange={e => setImpact(e.target.value)} fullWidth><MenuItem value="LOW">Low</MenuItem><MenuItem value="MEDIUM">Medium</MenuItem><MenuItem value="HIGH">High</MenuItem></TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !title.trim() || !description.trim()}>{saving ? "Saving..." : "Log risk"}</Button>
      </DialogActions>
    </Dialog>
  )
}

export function CreateIssueModal({ open, onClose, linkedEntityType, linkedEntityId, linkedEntityLabel, onSuccess }: CreateRecordModalProps) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [severity, setSeverity] = React.useState("AMBER")
  const [reviewDate, setReviewDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  function reset() { setTitle(""); setDescription(""); setSeverity("AMBER"); setReviewDate("") }

  async function handleSave() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/issues", {
        title, description, severity,
        reviewDate: reviewDate || undefined,
        linkedEntityType: linkedEntityType || undefined,
        linkedEntityId: linkedEntityId || undefined
      })
      onClose(); reset()
      qc.invalidateQueries({ queryKey: ["issues"] })
      await onSuccess?.()
      notify.success("Issue logged")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to log issue")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Log issue</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <LinkedBanner label={linkedEntityLabel} />
          <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} required fullWidth autoFocus />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} required fullWidth multiline rows={3} />
          <Stack direction="row" spacing={2}>
            <TextField select label="Severity" value={severity} onChange={e => setSeverity(e.target.value)} fullWidth><MenuItem value="GREEN">Green — low</MenuItem><MenuItem value="AMBER">Amber — medium</MenuItem><MenuItem value="RED">Red — high</MenuItem></TextField>
            <TextField label="Review date" type="date" InputLabelProps={{ shrink: true }} value={reviewDate} onChange={e => setReviewDate(e.target.value)} fullWidth />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !title.trim() || !description.trim()}>{saving ? "Saving..." : "Log issue"}</Button>
      </DialogActions>
    </Dialog>
  )
}