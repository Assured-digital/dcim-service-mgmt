import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography
} from "@mui/material"
import {
  DataGrid, GridColDef, GridRenderCellParams,
  GridFooterContainer, GridPagination, GridPreferencePanelsValue,
  GridToolbarExport, useGridApiRef,
} from "@mui/x-data-grid"
import AddIcon from "@mui/icons-material/Add"
import SearchIcon from "@mui/icons-material/Search"
import ViewColumnIcon from "@mui/icons-material/ViewColumn"
import InboxIcon from "@mui/icons-material/Inbox"
import PersonIcon from "@mui/icons-material/Person"
import PriorityHighIcon from "@mui/icons-material/PriorityHigh"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import FilterListIcon from "@mui/icons-material/FilterList"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import { StatusPill, AssigneeCell, TypeBadge, ListNavRail, RecordTypePicker, type RailSection } from "../components/shared"
import { formatDate } from "../lib/format"
import { LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getCurrentUser } from "../lib/auth"
import {
  parseRIParams, buildUnifiedRows, deriveRag, reviewStatus,
  RISK_STATUS_LABELS, ISSUE_STATUS_LABELS,
  type Risk, type Issue, type UnifiedRow, type TypeFilter, type QuickView,
} from "../lib/risksIssuesQueue"

const STALE_TIME = 60_000

// ─── Helpers ────────────────────────────────────────────────────────────────

function ragChipSx(rag: string) {
  if (rag === "RED") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 600, fontSize: 11 }
  if (rag === "AMBER") return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 600, fontSize: 11 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 600, fontSize: 11 }
}

// ─── Shared sub-components ──────────────────────────────────────────────────

// Grid footer — Export on the left, pagination on the right (mirrors the
// Service Desk queue footer). Columns lives in the top bar via apiRef.
function RIFooter() {
  const fileName = `risks-issues-${new Date().toISOString().split("T")[0]}`
  return (
    <GridFooterContainer sx={{ px: 1, justifyContent: "space-between" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <GridToolbarExport csvOptions={{ fileName, utf8WithBom: true }} printOptions={{ disableToolbarButton: true }} slotProps={{ button: { sx: { fontSize: 12 } } }} />
      </Box>
      <GridPagination />
    </GridFooterContainer>
  )
}

// ─── Unified queue view ─────────────────────────────────────────────────────

function RisksIssuesQueueView() {
  const navigate = useNavigate()
  const currentUser = React.useMemo(() => getCurrentUser(), [])
  const myId = currentUser?.userId
  const apiRef = useGridApiRef()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  // Saved view (?view=), type (?type=) and search (?q=) all derive from the URL
  // (single source of truth) — shared with the depth-1 working-queue rail via
  // lib/risksIssuesQueue, so the rail rebuilds the SAME set and the filters
  // survive a drill-out.
  const [searchParams, setSearchParams] = useSearchParams()
  const params = React.useMemo(() => parseRIParams(searchParams), [searchParams])
  const { quickView, typeFilter, qParam } = params

  // Snappy controlled-input mirror of ?q= — the URL is written debounced below.
  const [searchText, setSearchText] = React.useState(qParam)

  const [riskLogOpen, setRiskLogOpen] = React.useState(false)
  const [issueLogOpen, setIssueLogOpen] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  const { data: risksRaw = [], isLoading: risksLoading } = useQuery({ queryKey: ["risks"], queryFn: async () => (await api.get<Risk[]>("/risks")).data, staleTime: STALE_TIME })
  const { data: issuesRaw = [], isLoading: issuesLoading } = useQuery({ queryKey: ["issues"], queryFn: async () => (await api.get<Issue[]>("/issues")).data, staleTime: STALE_TIME })

  // VIEWS-section counts are entity-specific. When the type filter is "all",
  // default to risk-style counts (mirrors the prior behaviour).
  const sidebarEntity: "risks" | "issues" = typeFilter === "issues" ? "issues" : "risks"
  const openRisks = React.useMemo(() => risksRaw.filter(r => r.status !== "CLOSED"), [risksRaw])
  const openIssues = React.useMemo(() => issuesRaw.filter(i => i.status !== "CLOSED"), [issuesRaw])

  const quickCounts = React.useMemo(() => sidebarEntity === "risks" ? {
    all: risksRaw.length,
    assigned: risksRaw.filter(r => !!myId && r.assignee?.id === myId).length,
    urgent: openRisks.filter(r => deriveRag(r.likelihood, r.impact) === "RED").length,
    review_due: openRisks.filter(r => reviewStatus(r.reviewDate, r.status) === "overdue").length,
  } : {
    all: issuesRaw.length,
    assigned: issuesRaw.filter(i => !!myId && i.assignee?.id === myId).length,
    urgent: openIssues.filter(i => i.severity === "RED").length,
    review_due: openIssues.filter(i => reviewStatus(i.reviewDate, i.status) === "overdue").length,
  }, [sidebarEntity, risksRaw, issuesRaw, openRisks, openIssues, myId])

  // The displayed set — same selector the depth-1 rail uses (quickView + type +
  // search), sorted by updatedAt descending.
  const visibleRows = React.useMemo(
    () => buildUnifiedRows(risksRaw, issuesRaw, params, myId),
    [risksRaw, issuesRaw, params, myId],
  )

  // Debounced write of the search box into ?q= (replace, so keystrokes don't
  // flood history). No-op when already in sync, so it can't loop with the
  // back/forward sync effect below.
  React.useEffect(() => {
    if (searchText === qParam) return
    const id = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (searchText) next.set("q", searchText)
      else next.delete("q")
      setSearchParams(next, { replace: true })
    }, 300)
    return () => clearTimeout(id)
  }, [searchText, qParam, searchParams, setSearchParams])

  // Keep the input in sync when the URL changes externally (back/forward).
  React.useEffect(() => { setSearchText(qParam) }, [qParam])

  function handleQuickViewChange(id: QuickView) {
    const next = new URLSearchParams(searchParams)
    if (id === "all") next.delete("view")
    else next.set("view", id)
    setSearchParams(next)   // push
  }

  function handleTypeFilterChange(nextType: TypeFilter) {
    const next = new URLSearchParams(searchParams)
    if (nextType === "all") next.delete("type")
    else next.set("type", nextType)
    setSearchParams(next)   // push
  }

  function handleRowClick(row: UnifiedRow) {
    // Preserve the filter query string so the depth-1 working-queue rail can
    // rebuild the same set from the URL. Push (not replace) — browser-back
    // returns to this grid, not through each record viewed.
    navigate({ pathname: row.detailPath, search: searchParams.toString() })
  }

  const unifiedColumns: GridColDef<UnifiedRow>[] = React.useMemo(() => [
    {
      field: "kind", headerName: "Type", width: 70, sortable: false,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => <TypeBadge kind={p.value as "RSK" | "ISS"} />,
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
        const row = p.row as UnifiedRow
        const labels = row.kind === "RSK" ? RISK_STATUS_LABELS : ISSUE_STATUS_LABELS
        // Risk MITIGATING is an in-progress state (blue) — override the resolveIntent
        // MITIGAT->success collision that would wrongly green it. Incident MITIGATED
        // is terminal-good and stays green (untouched, different surface).
        const intent = row.kind === "RSK" && row.status === "MITIGATING" ? "active" as const : undefined
        return <StatusPill value={row.status} intent={intent} label={labels[row.status] ?? row.status} />
      },
    },
    {
      field: "severityKey", headerName: "Severity / Impact", width: 150, sortable: false,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => (
        <Chip size="small" sx={ragChipSx(p.value as string)} label={(p.row as UnifiedRow).severityLabel} />
      ),
    },
    {
      field: "assignee", headerName: "Assignee", width: 160,
      valueGetter: (_v, row) => row.assignee?.displayName ?? "Unassigned",
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => <AssigneeCell user={(p.row as UnifiedRow).assignee} />,
    },
    {
      field: "updatedAt", headerName: "Updated", width: 110,
      valueGetter: v => v ? new Date(v as string) : null,
      renderCell: (p: GridRenderCellParams<UnifiedRow>) => (
        <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>
          {formatDate((p.row as UnifiedRow).updatedAt) || "—"}
        </Typography>
      ),
    },
  ], [])

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

  // Rail sections — Views (saved filters) and Type, each independently selected
  // (mirrors the Service Desk rail's Tickets + Type sections).
  const viewsSection: RailSection = {
    label: "Views",
    activeId: quickView,
    onPick: id => handleQuickViewChange(id as QuickView),
    items: [
      { id: "all", label: "All", count: quickCounts.all, icon: <InboxIcon sx={{ fontSize: 18 }} /> },
      { id: "assigned", label: "Assigned to me", count: quickCounts.assigned, icon: <PersonIcon sx={{ fontSize: 18 }} /> },
      { id: "urgent", label: "Urgent", count: quickCounts.urgent, icon: <PriorityHighIcon sx={{ fontSize: 18 }} /> },
      { id: "review_due", label: "Review overdue", count: quickCounts.review_due, icon: <CheckCircleOutlineIcon sx={{ fontSize: 18 }} /> },
    ],
  }
  const typeSection: RailSection = {
    label: "Type",
    activeId: typeFilter,
    onPick: id => handleTypeFilterChange(id as TypeFilter),
    items: [
      { id: "all", label: "All", icon: <FilterListIcon sx={{ fontSize: 18 }} /> },
      { id: "risks", label: "Risks", icon: <WarningAmberIcon sx={{ fontSize: 18 }} /> },
      { id: "issues", label: "Issues", icon: <ErrorOutlineIcon sx={{ fontSize: 18 }} /> },
    ],
  }

  return (
    <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Drill-down (record/association) is owned by the DrillDownNavigator; this
          body is always the depth-0 list, so the rail + chrome always show. */}
      <ListNavRail title="Risks & Issues" sections={[viewsSection, typeSection]} />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, bgcolor: "#f8fafc" }}>
        {/* Header — Search on the left, Columns + New record on the right. */}
        <Box sx={{ px: 2, py: 1.25, bgcolor: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", flexShrink: 0 }}>
          <TextField
            size="small"
            placeholder="Search risks & issues…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            sx={{ flex: 1, maxWidth: 420 }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ fontSize: 16, color: "#94a3b8", mr: 1 }} />,
              sx: { fontSize: 12.5, bgcolor: "#f8fafc", height: 34 },
            }}
          />
          <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: "auto" }}>
            <Button
              size="small"
              startIcon={<ViewColumnIcon sx={{ fontSize: 16 }} />}
              onClick={() => apiRef.current?.showPreferences(GridPreferencePanelsValue.columns)}
              sx={{
                fontSize: 12, fontWeight: 500, textTransform: "none",
                color: "primary.main", px: 0.75, py: 0.25, minWidth: 0,
                "& .MuiButton-startIcon": { mr: 0.5 },
              }}
            >
              Columns
            </Button>
            {canManage ? (
              <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={() => setPickerOpen(true)} sx={{ fontSize: 12 }}>
                New record
              </Button>
            ) : null}
          </Stack>
        </Box>

        {/* Body — grid + footer (export/pagination), Service Desk style. The
            intermediate overflow:auto container bounds the scroll to the grid
            area (the rail stays fixed); full-bleed chrome (from the navigator)
            keeps it off the page. */}
        <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {isLoading ? (
            <Box sx={{ p: 3 }}><LoadingState /></Box>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#fff" }}>
              <DataGrid
                apiRef={apiRef}
                rows={visibleRows}
                columns={unifiedColumns}
                density="compact"
                rowHeight={64}
                initialState={{
                  pagination: { paginationModel: { pageSize: 25 } },
                  sorting: { sortModel: [{ field: "updatedAt", sort: "desc" }] },
                }}
                pageSizeOptions={[25, 50, 100]}
                disableRowSelectionOnClick
                onRowClick={p => handleRowClick(p.row as UnifiedRow)}
                slots={{ footer: RIFooter }}
                sx={gridSx}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <RecordTypePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={kind => { if (kind === "RSK") setRiskLogOpen(true); if (kind === "ISS") setIssueLogOpen(true) }}
        title="New record"
        options={[
          { kind: "RSK", title: "Risk",  subtitle: "Potential future problem to track and mitigate" },
          { kind: "ISS", title: "Issue", subtitle: "An active problem requiring resolution" },
        ]}
      />
      <CreateRiskModal open={riskLogOpen} onClose={() => setRiskLogOpen(false)} />
      <CreateIssueModal open={issueLogOpen} onClose={() => setIssueLogOpen(false)} />
    </Box>
  )
}

// The depth-0 list body, consumed by RisksIssuesNavigator as the list panel.
export function RisksIssuesQueueBody() {
  return <RisksIssuesQueueView />
}

export default function RisksIssuesPage() {
  return <RisksIssuesQueueView />
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
