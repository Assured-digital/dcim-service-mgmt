import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, ListItemIcon, Menu, MenuItem, Stack,
  TextField, Tooltip, Typography
} from "@mui/material"
import {
  DataGrid, GridColDef,
  GridFooterContainer, GridPagination,
  GridPreferencePanelsValue,
  GridSortModel,
  GridToolbarExport, useGridApiRef,
} from "@mui/x-data-grid"
import AddIcon from "@mui/icons-material/Add"
import PriorityHighIcon from "@mui/icons-material/PriorityHigh"
import InboxIcon from "@mui/icons-material/Inbox"
import HelpOutlineIcon from "@mui/icons-material/HelpOutline"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import SearchIcon from "@mui/icons-material/Search"
import ViewListIcon from "@mui/icons-material/ViewList"
import ViewKanbanIcon from "@mui/icons-material/ViewKanban"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import PersonIcon from "@mui/icons-material/Person"
import FilterListIcon from "@mui/icons-material/FilterList"
import AssignmentIcon from "@mui/icons-material/Assignment"
import ReportProblemIcon from "@mui/icons-material/ReportProblem"
import BuildIcon from "@mui/icons-material/Build"
import TaskAltIcon from "@mui/icons-material/TaskAlt"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined"
import ViewColumnIcon from "@mui/icons-material/ViewColumn"
import { TypeBadge, PriorityPill, StatusPill, AssigneeCell, ListNavRail, RecordTypePicker, type RailSection, type BadgeKind } from "../components/shared"
import { formatDate } from "../lib/format"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { dataGridSx } from "../components/DataGridShell"
import { semanticToken, ragToken, type ThemeMode } from "../components/shared/tokens/colors"
import { useThemeMode } from "../lib/theme"
import { getCurrentUser } from "../lib/auth"
import { useTickets, isNewStatus, type Ticket, type TicketKind } from "../lib/tickets"
import {
  KIND_TO_TYPE_PARAM, encodeSortParam, parseQueueParams, filterTickets,
  type SlaFilter,
} from "../lib/serviceDeskQueue"

const SLA_FILTER_LABELS: Record<SlaFilter, string> = {
  breached: "Breached",
  "due-soon": "Due soon",
  "on-track": "On track",
}
import { CreateIncidentModal } from "./modals/CreateIncidentModal"
import { CreateChangeModal } from "./modals/CreateChangeModal"
import { CreateTaskModal } from "./modals/CreateTaskModal"
import { CreateRiskModal, CreateIssueModal } from "./RisksIssuesPage"
import { RAG_LABELS } from "../lib/risksIssuesQueue"
import ServiceDeskBoard from "./ServiceDeskBoard"

// ── Create Service Request Modal (exported) ───────────────────────────────
export function CreateServiceRequestModal({
  open, onClose, linkedEntityType, linkedEntityId, linkedEntityLabel, onSuccess, navigateAfterCreate = true
}: {
  open: boolean
  onClose: () => void
  linkedEntityType?: string
  linkedEntityId?: string
  linkedEntityLabel?: string
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useNotification()
  const { mode } = useThemeMode()
  const [subject, setSubject] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")
  // Linked-entity info banner — light branch = the prior literals exactly.
  const banner = mode === "dark"
    ? { bg: "#0c2a3a", border: "#164e63", text: "#7dd3fc" }
    : { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1" }

  async function handleSubmit() {
    if (!subject.trim() || description.trim().length < 5) return
    try {
      const res = await api.post<{ id: string }>("/service-requests", {
        subject: subject.trim(),
        description: description.trim(),
        priority,
        linkedEntityType: linkedEntityType || undefined,
        linkedEntityId: linkedEntityId || undefined
      })
      setSubject(""); setDescription(""); setPriority("medium")
      onClose()
      qc.invalidateQueries({ queryKey: ["tickets"] })
      await onSuccess?.()
      if (navigateAfterCreate) navigate(`/service-desk/sr/${res.data.id}`)
      notify.success("Service request created")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to create request")
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Raise service request</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {linkedEntityLabel ? (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: banner.bg, border: `1px solid ${banner.border}` }}>
              <Typography variant="caption" color={banner.text}>Linked to: <strong>{linkedEntityLabel}</strong></Typography>
            </Box>
          ) : null}
          <TextField
            label="Subject" value={subject} onChange={e => setSubject(e.target.value)}
            fullWidth required placeholder="Brief description of the request"
          />
          <TextField
            label="Description" value={description}
            onChange={e => setDescription(e.target.value)}
            multiline minRows={4} fullWidth required
            placeholder="Provide as much detail as possible..."
          />
          <TextField select label="Priority" value={priority}
            onChange={e => setPriority(e.target.value)} fullWidth>
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!subject.trim() || description.trim().length < 5}
        >
          Submit request
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Unified queue: shared types ───────────────────────────────────────────
type QueueView = "table" | "board"

// ── Unified queue: URL filter/sort/search params ──────────────────────────
// The queue's filter, type, search and sort state live in the URL query string
// (mirroring the existing ?view= param) so the depth-0 table and a future
// depth-1 rail derive the same list from one source, and the state survives
// refresh / deep-link. Defaults are omitted from the URL to keep it clean.
// ── Unified queue: View selector ──────────────────────────────────────────
const VIEW_OPTIONS: Array<{ value: QueueView; label: string; icon: React.ReactNode }> = [
  { value: "table", label: "Table", icon: <ViewListIcon sx={{ fontSize: 16 }} /> },
  { value: "board", label: "Board", icon: <ViewKanbanIcon sx={{ fontSize: 16 }} /> },
]

function ViewSelector({
  viewParam, onViewChange,
}: {
  viewParam: QueueView
  onViewChange: (next: QueueView) => void
}) {
  const [anchor, setAnchor] = React.useState<null | HTMLElement>(null)
  const current = VIEW_OPTIONS.find(o => o.value === viewParam) ?? VIEW_OPTIONS[0]
  return (
    <>
      <Button
        size="small"
        startIcon={current.icon}
        endIcon={<ArrowDropDownIcon sx={{ fontSize: 18 }} />}
        onClick={e => setAnchor(e.currentTarget)}
        sx={{
          fontSize: 12, fontWeight: 500, textTransform: "none",
          color: "primary.main", px: 0.75, py: 0.25, minWidth: 0,
          "& .MuiButton-startIcon": { mr: 0.5 },
          "& .MuiButton-endIcon": { ml: 0.25 },
        }}
      >
        View ({current.label})
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {VIEW_OPTIONS.map(o => (
          <MenuItem
            key={o.value}
            selected={o.value === viewParam}
            onClick={() => { onViewChange(o.value); setAnchor(null) }}
            sx={{ fontSize: 13, minHeight: 32 }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>{o.icon}</ListItemIcon>
            {o.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

// ── Unified queue: footer (Export on the left, pagination on the right) ──
// Columns selector lives in the top bar via apiRef.showPreferences("columns").
function UnifiedFooter() {
  const fileName = `service-desk-tickets-${new Date().toISOString().split("T")[0]}`
  return (
    <GridFooterContainer sx={{ px: 1, justifyContent: "space-between" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <GridToolbarExport
          csvOptions={{ fileName, utf8WithBom: true }}
          printOptions={{ disableToolbarButton: true }}
          slotProps={{ button: { sx: { fontSize: 12 } } }}
        />
      </Box>
      <GridPagination />
    </GridFooterContainer>
  )
}

// ── Unified queue: status pill (read-only) ────────────────────────────────
// The shared StatusPill (6px pastel) — same component as the Tasks row, the
// detail pill and the priority pill — so the queue reads status-pill +
// priority-pill consistently (resolving the old dot/pill mix). Read-only: no
// edit chevron (the intentional Tasks-only inline-edit asymmetry; DataGrid
// pages don't edit). Overdue keeps the red "Overdue" treatment (same
// single-source danger token the dot used). Label stays per-domain/humanised.
function StatusCell({ ticket }: { ticket: Ticket }) {
  const value = ticket.overdue ? "OVERDUE" : ticket.status
  const humanised = ticket.status.toLowerCase().replaceAll("_", " ")
  const label = ticket.overdue
    ? "Overdue"
    : humanised.charAt(0).toUpperCase() + humanised.slice(1)
  return <StatusPill value={value} label={label} />
}

// ── Subject cell that only shows a tooltip when its text is truncated ─────
function TruncatedSubject({ text }: { text: string }) {
  const ref = React.useRef<HTMLSpanElement | null>(null)
  const [overflowing, setOverflowing] = React.useState(false)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  return (
    <Tooltip
      title={overflowing ? text : ""}
      arrow placement="top-start" enterDelay={400}
    >
      <Typography
        ref={ref}
        sx={{
          fontSize: 13, fontWeight: 500, color: "text.primary",
          display: "block", width: "100%",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {text}
      </Typography>
    </Tooltip>
  )
}

// ── Unified queue: columns ────────────────────────────────────────────────

function buildUnifiedColumns(assigneeOptions: string[], mode: ThemeMode): GridColDef<Ticket>[] {
  const overdueColor = semanticToken("danger", mode).solid
  return [
    {
      field: "kind", headerName: "Type", width: 70,
      renderCell: (p) => <TypeBadge kind={p.value as TicketKind} />,
    },
    {
      field: "reference", headerName: "Ref", width: 110,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
          {p.value as string}
        </Typography>
      ),
    },
    {
      field: "subject", headerName: "Subject", flex: 1, minWidth: 360,
      renderCell: (p) => <TruncatedSubject text={p.value as string} />,
    },
    {
      field: "chipIntent", headerName: "Status", width: 150,
      valueGetter: (_v, row) => row.overdue ? "overdue" : row.status,
      renderCell: (p) => <StatusCell ticket={p.row as Ticket} />,
    },
    {
      field: "priority", headerName: "Priority", width: 110,
      renderCell: (p) => {
        const t = p.row as Ticket
        // Risks & Issues carry a RAG severity, not a ticket priority — render it as
        // a RAG pill (High/Medium/Low) in the same column (Create Surface merge).
        // Guard ragToken against any severity outside RED/AMBER/GREEN (it would
        // otherwise return undefined and throw on tok.bg).
        if (t.ragSeverity) {
          const known = t.ragSeverity === "RED" || t.ragSeverity === "AMBER" || t.ragSeverity === "GREEN"
          const tok = known ? ragToken(t.ragSeverity as "RED" | "AMBER" | "GREEN", mode) : null
          return (
            <Box component="span" sx={{
              display: "inline-flex", alignItems: "center", height: 20, px: "8px",
              borderRadius: "4px", bgcolor: tok?.bg ?? "transparent", color: tok?.text ?? "text.secondary",
              fontSize: 11, fontWeight: 600,
            }}>
              {RAG_LABELS[t.ragSeverity] ?? t.ragSeverity}
            </Box>
          )
        }
        const v = p.value as string
        return v ? <PriorityPill priority={v} label={v.charAt(0).toUpperCase() + v.slice(1)} /> : null
      },
    },
    {
      field: "assignee", headerName: "Assignee", width: 170,
      type: "singleSelect",
      valueOptions: assigneeOptions,
      valueGetter: (_v, row) => row.assignee?.displayName ?? "Unassigned",
      renderCell: (p) => <AssigneeCell user={(p.row as Ticket).assignee} mode={mode} />,
    },
    {
      field: "updatedAt", headerName: "Updated", width: 110,
      valueGetter: (v) => v ? new Date(v as string) : null,
      renderCell: (p) => {
        const t = p.row as Ticket
        const dateStr = formatDate(t.updatedAt) || "—"
        return (
          <Typography sx={{
            fontSize: 12,
            color: t.overdue ? overdueColor : "text.tertiary",
            fontWeight: t.overdue ? 600 : 400
          }}>
            {dateStr}
          </Typography>
        )
      },
    },
    {
      field: "dueAt", headerName: "Due", width: 120,
      valueGetter: (v) => v ? new Date(v as string) : null,
      renderCell: (p) => {
        const t = p.row as Ticket
        const dateStr = formatDate(t.dueAt) || "—"
        return (
          <Typography sx={{
            fontSize: 12,
            color: t.overdue ? overdueColor : "text.secondary",
            fontWeight: t.overdue ? 600 : 400,
          }}>
            {dateStr}
          </Typography>
        )
      },
    },
  ]
}

// ── Unified queue view ────────────────────────────────────────────────────

function UnifiedServiceDeskView() {
  const navigate = useNavigate()
  const { mode } = useThemeMode()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawView = searchParams.get("view")
  const viewParam: QueueView = rawView === "board" ? "board" : "table"

  // Filter/type/search/sort all derive from the URL (single source of truth) —
  // shared with the depth-1 working-queue rail via lib/serviceDeskQueue.
  const queueParams = React.useMemo(() => parseQueueParams(searchParams), [searchParams])
  const { savedView, typeFilter, qParam, sortModel, slaFilter } = queueParams

  // Snappy controlled-input mirror of ?q= — the URL is written debounced below.
  const [searchText, setSearchText] = React.useState(qParam)
  const currentUser = React.useMemo(() => getCurrentUser(), [])
  const apiRef = useGridApiRef()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [srOpen, setSrOpen] = React.useState(false)
  const [incOpen, setIncOpen] = React.useState(false)
  const [chgOpen, setChgOpen] = React.useState(false)
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [riskOpen, setRiskOpen] = React.useState(false)
  const [issueOpen, setIssueOpen] = React.useState(false)
  const canRaise = hasAnyRole([
    ...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST,
    ROLES.ENGINEER, ROLES.CLIENT_VIEWER
  ])

  const { data: tickets, isLoading, error } = useTickets()

  const counts = React.useMemo(() => {
    const c = { open: 0, overdue: 0, unassigned: 0, waiting: 0, closed: 0, mine: 0, awaiting: 0, new: 0 }
    for (const t of tickets) {
      const done = t.chipIntent === "done"
      if (!done) c.open++
      if (t.overdue) c.overdue++
      if (!t.assignee && !done) c.unassigned++
      if (t.chipIntent === "wait") c.waiting++
      if (done) c.closed++
      if (currentUser && t.assignee?.id === currentUser.userId && !done) c.mine++
      if (isNewStatus(t) && !done) c.new++
    }
    return c
  }, [tickets, currentUser])

  // Per-TYPE badge counts reflect the active TICKETS view ONLY — never the type
  // filter — so selecting a type doesn't zero the others. Filter with the type
  // forced to "all" (same view / SLA / search), then tally by kind. "all" row =
  // total of the active view. Same useTickets() feed, no extra fetch.
  const typeCounts = React.useMemo(() => {
    const viewOnly = filterTickets(tickets, { ...queueParams, typeFilter: "all" }, currentUser)
    const c: Record<TicketKind | "all", number> = { all: viewOnly.length, SR: 0, INC: 0, CHG: 0, TASK: 0, RSK: 0, ISS: 0 }
    for (const t of viewOnly) c[t.kind]++
    return c
  }, [tickets, queueParams, currentUser])

  const assigneeOptions = React.useMemo(() => {
    const set = new Set<string>()
    let hasUnassigned = false
    for (const t of tickets) {
      if (t.assignee) set.add(t.assignee.displayName)
      else hasUnassigned = true
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b))
    return hasUnassigned ? ["Unassigned", ...sorted] : sorted
  }, [tickets])

  const unifiedColumns = React.useMemo(() => buildUnifiedColumns(assigneeOptions, mode), [assigneeOptions, mode])

  // Filter via the shared selector (same logic the depth-1 rail uses). The
  // DataGrid still owns sorting via sortModel, so no sortTickets() here.
  const filtered = React.useMemo(
    () => filterTickets(tickets, queueParams, currentUser),
    [tickets, queueParams, currentUser],
  )

  // Debounced write of the search box into ?q= (replace, so keystrokes don't
  // flood history). No-op when already in sync, so it can't loop with the
  // back/forward sync effect below.
  React.useEffect(() => {
    if (searchText === qParam) return
    const id = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      if (searchText) params.set("q", searchText)
      else params.delete("q")
      setSearchParams(params, { replace: true })
    }, 300)
    return () => clearTimeout(id)
  }, [searchText, qParam, searchParams, setSearchParams])

  // Keep the input in sync when the URL changes externally (back/forward).
  React.useEffect(() => {
    setSearchText(qParam)
  }, [qParam])

  function handleNavPick(id: string) {
    const params = new URLSearchParams(searchParams)
    if (id === "open") params.delete("status")
    else params.set("status", id)
    setSearchParams(params)   // push — back/forward steps through segments
  }

  function handleTypeFilterChange(next: TicketKind | "all") {
    const params = new URLSearchParams(searchParams)
    if (next === "all") params.delete("type")
    else params.set("type", KIND_TO_TYPE_PARAM[next])
    setSearchParams(params)   // push
  }

  function handleClearSla() {
    const params = new URLSearchParams(searchParams)
    params.delete("sla")
    setSearchParams(params)   // push
  }

  function handleSortChange(model: GridSortModel) {
    const encoded = encodeSortParam(model)
    const params = new URLSearchParams(searchParams)
    if (encoded === null) params.delete("sort")
    else params.set("sort", encoded)
    setSearchParams(params)   // push
  }

  function handlePickType(kind: BadgeKind) {
    if (kind === "SR")  setSrOpen(true)
    if (kind === "INC") setIncOpen(true)
    if (kind === "CHG") setChgOpen(true)
    if (kind === "TASK") setTaskOpen(true)
    if (kind === "RSK") setRiskOpen(true)
    if (kind === "ISS") setIssueOpen(true)
  }

  function handleRowClick(t: Ticket) {
    // Preserve the filter query string so the depth-1 working-queue rail can
    // rebuild the same filtered/sorted set from the URL. Push (not replace) —
    // browser-back returns to this table, not through each ticket viewed.
    navigate({ pathname: t.detailPath, search: searchParams.toString() })
  }

  function handleViewToggle(next: QueueView) {
    const params = new URLSearchParams(searchParams)
    if (next === "table") params.delete("view")
    else params.set("view", next)
    setSearchParams(params, { replace: true })
  }

  // Two independent single-select sections: saved-view (Tickets) and kind (Type).
  const ticketsSection: RailSection = {
    label: "Tickets",
    activeId: savedView,
    onPick: handleNavPick,
    items: [
      { id: "open", label: "All open", count: counts.open, icon: <InboxIcon sx={{ fontSize: 18 }} /> },
      { id: "mine", label: "My tickets", count: counts.mine, icon: <PersonIcon sx={{ fontSize: 18 }} /> },
      { id: "unassigned", label: "Unassigned", count: counts.unassigned, icon: <HelpOutlineIcon sx={{ fontSize: 18 }} /> },
      { id: "closed", label: "Resolved 30d", count: counts.closed, icon: <CheckCircleOutlineIcon sx={{ fontSize: 18 }} /> },
      { id: "overdue", label: "Overdue", count: counts.overdue, icon: <PriorityHighIcon sx={{ fontSize: 18 }} /> },
    ],
  }
  const typeSection: RailSection = {
    label: "Type",
    activeId: typeFilter,
    onPick: (id) => handleTypeFilterChange(id as TicketKind | "all"),
    items: [
      { id: "all", label: "All", count: typeCounts.all, icon: <FilterListIcon sx={{ fontSize: 18 }} /> },
      { id: "SR", label: "Service requests", count: typeCounts.SR, icon: <AssignmentIcon sx={{ fontSize: 18 }} /> },
      { id: "INC", label: "Incidents", count: typeCounts.INC, icon: <ReportProblemIcon sx={{ fontSize: 18 }} /> },
      { id: "CHG", label: "Change", count: typeCounts.CHG, icon: <BuildIcon sx={{ fontSize: 18 }} /> },
      { id: "TASK", label: "Tasks", count: typeCounts.TASK, icon: <TaskAltIcon sx={{ fontSize: 18 }} /> },
      { id: "RSK", label: "Risks", count: typeCounts.RSK, icon: <WarningAmberIcon sx={{ fontSize: 18 }} /> },
      { id: "ISS", label: "Issues", count: typeCounts.ISS, icon: <FlagOutlinedIcon sx={{ fontSize: 18 }} /> },
    ],
  }

  return (
    <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Drill-down (record/association) is owned by the DrillDownNavigator; this
          body is always the depth-0 queue, so the rail + chrome always show. */}
      <ListNavRail title="Service Desk" sections={[ticketsSection, typeSection]} mode={mode} />

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: "var(--color-background-secondary)" }}>
        {/* Header — Search on the left, View + New ticket on the right. */}
        <Box sx={{
          px: 2, py: 1.25, bgcolor: "background.paper",
          borderBottom: "1px solid", borderColor: "divider",
          display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", flexShrink: 0
        }}>
            <TextField
              size="small"
              placeholder="Search tickets…"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              sx={{ flex: 1, maxWidth: 420 }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ fontSize: 16, color: "text.tertiary", mr: 1 }} />,
                sx: { fontSize: 12.5, bgcolor: "var(--color-background-secondary)", height: 34 },
              }}
            />

            {slaFilter ? (
              <Chip
                size="small"
                label={`SLA: ${SLA_FILTER_LABELS[slaFilter]}`}
                onDelete={handleClearSla}
                sx={{ fontSize: 12, fontWeight: 500 }}
              />
            ) : null}

            <Stack direction="row" alignItems="center" spacing={1} sx={{ ml: "auto" }}>
              <Button
                size="small"
                startIcon={<ViewColumnIcon sx={{ fontSize: 16 }} />}
                onClick={() => apiRef.current?.showPreferences(GridPreferencePanelsValue.columns)}
                disabled={viewParam !== "table"}
                sx={{
                  fontSize: 12, fontWeight: 500, textTransform: "none",
                  color: "primary.main", px: 0.75, py: 0.25, minWidth: 0,
                  "& .MuiButton-startIcon": { mr: 0.5 },
                }}
              >
                Columns
              </Button>

              <ViewSelector viewParam={viewParam} onViewChange={handleViewToggle} />

              {canRaise ? (
                <Button
                  size="small" variant="contained"
                  startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                  onClick={() => setPickerOpen(true)}
                  sx={{ fontSize: 12 }}
                >
                  New ticket
                </Button>
              ) : null}
            </Stack>
          </Box>

        {/* Body */}
        <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {isLoading ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}
          {error ? <Box sx={{ p: 3 }}><ErrorState title="Failed to load tickets" /></Box> : null}

          {!isLoading && !error && viewParam === "board" ? (
            // Board (kanban) columns are keyed on ticket workflow statuses; Risks &
            // Issues use their own status models, so they show in the table view only.
            <ServiceDeskBoard tickets={filtered.filter(t => t.kind !== "RSK" && t.kind !== "ISS")} />
          ) : null}

          {!isLoading && !error && viewParam === "table" && filtered.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <EmptyState
                title="No tickets match this filter"
                detail="Try a different view or clear the type filter."
              />
            </Box>
          ) : null}

          {!isLoading && !error && viewParam === "table" && filtered.length > 0 ? (
            <Box sx={{ flex: 1, minHeight: 0, bgcolor: "background.paper" }}>
              <DataGrid
                apiRef={apiRef}
                rows={filtered}
                columns={unifiedColumns}
                density="compact"
                rowHeight={64}
                sortModel={sortModel}
                onSortModelChange={handleSortChange}
                initialState={{
                  pagination: { paginationModel: { pageSize: 50 } },
                }}
                pageSizeOptions={[25, 50, 100]}
                disableRowSelectionOnClick
                onRowClick={params => handleRowClick(params.row as Ticket)}
                slots={{ toolbar: null, footer: UnifiedFooter }}
                getRowClassName={params => (params.row as Ticket).overdue ? "overdue-row" : ""}
                sx={{
                  ...dataGridSx(true, mode),
                  // Vertically centre cell contents — without this, Typography
                  // children sit at the top of the row by default in compact density.
                  "& .MuiDataGrid-cell": {
                    borderColor: "var(--color-border-tertiary)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  },
                  "& .overdue-row .MuiDataGrid-cell:first-of-type": {
                    boxShadow: `inset 3px 0 0 ${ragToken("RED", mode).dot}`,
                  },
                }}
              />
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Modals */}
      <RecordTypePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={handlePickType}
        title="New ticket"
        options={[
          { kind: "SR",  title: "Service request", subtitle: "Standard work, access, shipments, reports" },
          { kind: "INC", title: "Incident",        subtitle: "Unplanned outage or service degradation" },
          { kind: "CHG", title: "Change",          subtitle: "Planned change with scheduled window" },
          { kind: "TASK", title: "Task",           subtitle: "Standalone action — no parent required" },
          { kind: "RSK", title: "Risk",            subtitle: "Potential future problem to track and mitigate" },
          { kind: "ISS", title: "Issue",           subtitle: "An active problem requiring resolution" },
        ]}
      />
      <CreateServiceRequestModal open={srOpen} onClose={() => setSrOpen(false)} />
      <CreateIncidentModal open={incOpen} onClose={() => setIncOpen(false)} />
      <CreateChangeModal open={chgOpen} onClose={() => setChgOpen(false)} />
      <CreateTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} />
      <CreateRiskModal open={riskOpen} onClose={() => setRiskOpen(false)} />
      <CreateIssueModal open={issueOpen} onClose={() => setIssueOpen(false)} />
    </Box>
  )
}

// The depth-0 queue body, consumed by ServiceDeskNavigator as the list panel.
export function ServiceDeskQueueBody() {
  return <UnifiedServiceDeskView />
}

export default function ServiceDeskPage() {
  return <UnifiedServiceDeskView />
}
