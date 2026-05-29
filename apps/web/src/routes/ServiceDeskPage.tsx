import React from "react"
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Dialog, DialogActions,
  DialogContent, DialogTitle, ListItemIcon, Menu, MenuItem, Stack,
  TextField, Tooltip, Typography
} from "@mui/material"
import {
  DataGrid, GridColDef,
  GridFooterContainer, GridPagination,
  GridPreferencePanelsValue,
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
import ViewColumnIcon from "@mui/icons-material/ViewColumn"
import { TypeBadge, PriorityDot, Avatar as TicketAvatar } from "../components/shared"
import { resolveIntent, semanticTokens } from "../components/shared/tokens/colors"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { dataGridSx } from "../components/DataGridShell"
import { getCurrentUser } from "../lib/auth"
import { useTickets, isNewStatus, type Ticket, type TicketKind } from "../lib/tickets"
import { CreateIncidentModal } from "./modals/CreateIncidentModal"
import { CreateChangeModal } from "./modals/CreateChangeModal"
import ServiceDeskBoard from "./ServiceDeskBoard"
import { useBreadcrumb } from "./Shell"

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
  const [subject, setSubject] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")

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
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#f0f9ff", border: "1px solid #bae6fd" }}>
              <Typography variant="caption" color="#0369a1">Linked to: <strong>{linkedEntityLabel}</strong></Typography>
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

// ── Type picker (unified queue's "+ New ticket") ──────────────────────────
function NewTicketTypePicker({
  open, onClose, onPick
}: {
  open: boolean
  onClose: () => void
  onPick: (kind: TicketKind) => void
}) {
  const options: Array<{ kind: TicketKind; title: string; subtitle: string }> = [
    { kind: "SR",  title: "Service request", subtitle: "Standard work, access, shipments, reports" },
    { kind: "INC", title: "Incident",        subtitle: "Unplanned outage or service degradation" },
    { kind: "CHG", title: "Change",          subtitle: "Planned change with scheduled window" },
  ]
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New ticket</DialogTitle>
      <DialogContent>
        <Stack gap={1.25} sx={{ pt: 0.5, pb: 1 }}>
          {options.map(o => (
            <Box
              key={o.kind}
              onClick={() => { onClose(); onPick(o.kind) }}
              sx={{
                display: "flex", alignItems: "center", gap: 1.5,
                p: 1.5, borderRadius: 1.5, cursor: "pointer",
                border: "1px solid #e2e8f0",
                "&:hover": { bgcolor: "#f8fafc", borderColor: "#cbd5e1" }
              }}
            >
              <TypeBadge kind={o.kind} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{o.title}</Typography>
                <Typography sx={{ fontSize: 12, color: "#64748b" }}>{o.subtitle}</Typography>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  )
}

// ── Unified queue: shared types ───────────────────────────────────────────
type QueueView = "table" | "board"

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
          color: "#1d4ed8", px: 0.75, py: 0.25, minWidth: 0,
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

// ── Unified queue: status pill ────────────────────────────────────────────
function StatusCell({ ticket }: { ticket: Ticket }) {
  const value = ticket.overdue ? "OVERDUE" : ticket.status
  const label = ticket.overdue ? "overdue" : ticket.status.toLowerCase().replaceAll("_", " ")
  const dotColor = semanticTokens[resolveIntent(value)].text
  return (
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Box
        component="span"
        sx={{
          width: 8, height: 8, borderRadius: "50%",
          bgcolor: dotColor, flexShrink: 0,
        }}
      />
      <Typography sx={{ fontSize: 12.5, color: "#0f172a" }}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </Typography>
    </Stack>
  )
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
          fontSize: 13, fontWeight: 500, color: "#0f172a",
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

function buildUnifiedColumns(assigneeOptions: string[]): GridColDef<Ticket>[] {
  return [
    {
      field: "kind", headerName: "Type", width: 70,
      renderCell: (p) => <TypeBadge kind={p.value as TicketKind} />,
    },
    {
      field: "reference", headerName: "Ref", width: 110,
      renderCell: (p) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#475569" }}>
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
      renderCell: (p) => (
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <PriorityDot priority={p.value as string} />
          <Typography sx={{ fontSize: 12.5 }}>
            {(p.value as string).charAt(0).toUpperCase() + (p.value as string).slice(1)}
          </Typography>
        </Stack>
      ),
    },
    {
      field: "assignee", headerName: "Assignee", width: 170,
      type: "singleSelect",
      valueOptions: assigneeOptions,
      valueGetter: (_v, row) => row.assignee?.email.split("@")[0] ?? "Unassigned",
      renderCell: (p) => {
        const t = p.row as Ticket
        if (!t.assignee) {
          return <Typography sx={{ fontSize: 12.5, fontStyle: "italic", color: "#94a3b8" }}>Unassigned</Typography>
        }
        return (
          <Tooltip title={t.assignee.email} arrow placement="top">
            <Stack direction="row" alignItems="center" spacing={0.75}>
              <TicketAvatar name={t.assignee.email} size="sm" variant="engineer" />
              <Typography sx={{ fontSize: 12.5 }}>{p.value as string}</Typography>
            </Stack>
          </Tooltip>
        )
      },
    },
    {
      field: "updatedAt", headerName: "Updated", width: 110,
      valueGetter: (v) => v ? new Date(v as string) : null,
      renderCell: (p) => {
        const t = p.row as Ticket
        const dateStr = p.value ? (p.value as Date).toLocaleDateString("en-GB") : "—"
        return (
          <Typography sx={{
            fontSize: 12,
            color: t.overdue ? "#b91c1c" : "#94a3b8",
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
        const dateStr = p.value
          ? (p.value as Date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "—"
        return (
          <Typography sx={{
            fontSize: 12,
            color: t.overdue ? "#b91c1c" : "#475569",
            fontWeight: t.overdue ? 600 : 400,
          }}>
            {dateStr}
          </Typography>
        )
      },
    },
  ]
}

// ── Saved-views rail ──────────────────────────────────────────────────────
interface SavedView {
  id: string
  label: string
  count?: number
  icon: React.ReactNode
}

function NavRail({
  active, onPick, counts, typeFilter, onTypeFilterChange,
}: {
  active: string
  onPick: (id: string) => void
  counts: Record<string, number>
  typeFilter: TicketKind | "all"
  onTypeFilterChange: (next: TicketKind | "all") => void
}) {
  const tickets: SavedView[] = [
    { id: "open", label: "All open", count: counts.open, icon: <InboxIcon sx={{ fontSize: 18 }} /> },
    { id: "mine", label: "My tickets", count: counts.mine, icon: <PersonIcon sx={{ fontSize: 18 }} /> },
    { id: "unassigned", label: "Unassigned", count: counts.unassigned, icon: <HelpOutlineIcon sx={{ fontSize: 18 }} /> },
    { id: "closed", label: "Resolved 30d", count: counts.closed, icon: <CheckCircleOutlineIcon sx={{ fontSize: 18 }} /> },
    { id: "overdue", label: "Overdue", count: counts.overdue, icon: <PriorityHighIcon sx={{ fontSize: 18 }} /> },
  ]
  const types: Array<{ id: TicketKind | "all"; label: string; icon: React.ReactNode }> = [
    { id: "all", label: "All", icon: <FilterListIcon sx={{ fontSize: 18 }} /> },
    { id: "SR", label: "Service requests", icon: <AssignmentIcon sx={{ fontSize: 18 }} /> },
    { id: "INC", label: "Incidents", icon: <ReportProblemIcon sx={{ fontSize: 18 }} /> },
    { id: "CHG", label: "Change", icon: <BuildIcon sx={{ fontSize: 18 }} /> },
  ]

  function renderItem(v: SavedView) {
    const isActive = v.id === active
    return (
      <Box
        key={v.id}
        onClick={() => onPick(v.id)}
        sx={{
          display: "flex", alignItems: "center", gap: 1.25,
          px: 1.25, py: 0.875, borderRadius: 1, cursor: "pointer",
          bgcolor: isActive ? "#e8f1ff" : "transparent",
          color: isActive ? "#1d4ed8" : "#475569",
          fontWeight: isActive ? 600 : 400,
          "&:hover": { bgcolor: isActive ? "#e8f1ff" : "#f8fafc", color: isActive ? "#1d4ed8" : "#0f172a" },
          "& .MuiSvgIcon-root": { color: isActive ? "#1d4ed8" : "#94a3b8" }
        }}
      >
        {v.icon}
        <Typography sx={{ fontSize: 13, flex: 1 }}>{v.label}</Typography>
        {typeof v.count === "number" ? (
          <Typography sx={{
            fontSize: 11, fontWeight: isActive ? 700 : 500,
            color: isActive ? "#1d4ed8" : "#94a3b8",
            bgcolor: isActive ? "#fff" : "transparent",
            borderRadius: 999, px: isActive ? 0.875 : 0,
          }}>
            {v.count}
          </Typography>
        ) : null}
      </Box>
    )
  }

  function renderTypeItem(t: typeof types[number]) {
    const isActive = typeFilter === t.id
    return (
      <Box
        key={t.id}
        onClick={() => onTypeFilterChange(t.id)}
        sx={{
          display: "flex", alignItems: "center", gap: 1.25,
          px: 1.25, py: 0.875, borderRadius: 1, cursor: "pointer",
          bgcolor: isActive ? "#e8f1ff" : "transparent",
          color: isActive ? "#1d4ed8" : "#475569",
          fontWeight: isActive ? 600 : 400,
          "&:hover": { bgcolor: isActive ? "#e8f1ff" : "#f8fafc", color: isActive ? "#1d4ed8" : "#0f172a" },
          "& .MuiSvgIcon-root": { color: isActive ? "#1d4ed8" : "#94a3b8" }
        }}
      >
        {t.icon}
        <Typography sx={{ fontSize: 13, flex: 1 }}>{t.label}</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{
      width: 220, flexShrink: 0,
      borderRight: "1px solid #e2e8f0", bgcolor: "#fff",
      p: 1, display: "flex", flexDirection: "column", gap: 0.25
    }}>
      <Box sx={{
        px: 1.25, pt: 0.5, pb: 1.25,
        borderBottom: "1px solid #f1f5f9",
        mb: 0.5,
      }}>
        <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
          Service Desk
        </Typography>
      </Box>
      <Typography sx={sectionLabelSx}>Tickets</Typography>
      {tickets.map(renderItem)}
      <Typography sx={sectionLabelSx}>Type</Typography>
      {types.map(renderTypeItem)}
    </Box>
  )
}

const sectionLabelSx = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase", color: "#64748b",
  px: 1.25, pt: 1.5, pb: 0.5,
}

// ── Unified queue view ────────────────────────────────────────────────────

function UnifiedServiceDeskView() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setPageFullBleed } = useBreadcrumb()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawView = searchParams.get("view")
  const viewParam: QueueView = rawView === "board" ? "board" : "table"
  const isDetailRoute = /^\/service-desk\/(sr|inc|chg)\//.test(location.pathname)

  React.useEffect(() => {
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [setPageFullBleed])

  const [savedView, setSavedView] = React.useState<string>("open")
  const [typeFilter, setTypeFilter] = React.useState<TicketKind | "all">("all")
  const [searchInput, setSearchInput] = React.useState("")
  const currentUser = React.useMemo(() => getCurrentUser(), [])
  const apiRef = useGridApiRef()
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [srOpen, setSrOpen] = React.useState(false)
  const [incOpen, setIncOpen] = React.useState(false)
  const [chgOpen, setChgOpen] = React.useState(false)
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

  const assigneeOptions = React.useMemo(() => {
    const set = new Set<string>()
    let hasUnassigned = false
    for (const t of tickets) {
      if (t.assignee) set.add(t.assignee.email.split("@")[0])
      else hasUnassigned = true
    }
    const sorted = Array.from(set).sort((a, b) => a.localeCompare(b))
    return hasUnassigned ? ["Unassigned", ...sorted] : sorted
  }, [tickets])

  const unifiedColumns = React.useMemo(() => buildUnifiedColumns(assigneeOptions), [assigneeOptions])

  // Filter tickets by saved view, type filter, and search input.
  const filtered = React.useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    return tickets.filter(t => {
      if (typeFilter !== "all" && t.kind !== typeFilter) return false
      const done = t.chipIntent === "done"

      if (savedView === "open" && done) return false
      if (savedView === "new" && (!isNewStatus(t) || done)) return false
      if (savedView === "mine" && (!currentUser || t.assignee?.id !== currentUser.userId || done)) return false
      if (savedView === "overdue" && !t.overdue) return false
      if (savedView === "unassigned" && (t.assignee || done)) return false
      if (savedView === "awaiting" && (t.chipIntent !== "wait" || done)) return false
      if (savedView === "closed" && !done) return false

      if (q) {
        const haystack = `${t.subject} ${t.reference} ${t.assignee?.email ?? ""}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }

      return true
    })
  }, [tickets, savedView, typeFilter, searchInput, currentUser])

  function handleNavPick(id: string) {
    // Leave any open detail route so the right pane can show queue/dashboard.
    if (isDetailRoute) navigate("/service-desk")
    setSavedView(id)
  }

  function handlePickType(kind: TicketKind) {
    if (kind === "SR")  setSrOpen(true)
    if (kind === "INC") setIncOpen(true)
    if (kind === "CHG") setChgOpen(true)
  }

  function handleRowClick(t: Ticket) {
    navigate(t.detailPath)
  }

  function handleViewToggle(next: QueueView) {
    const params = new URLSearchParams(searchParams)
    if (next === "table") params.delete("view")
    else params.set("view", next)
    setSearchParams(params, { replace: true })
  }

  const showQueueChrome = !isDetailRoute

  return (
    <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* The NavRail is hidden when a ticket detail is open so the detail
          page can use the full content width. The detail header renders its
          own Return button to get back to the queue. */}
      {!isDetailRoute ? (
        <NavRail
          active={savedView}
          onPick={handleNavPick}
          counts={counts}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
        />
      ) : null}

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: "#f8fafc" }}>
        {/* Header — Search on the left, View + New ticket on the right. */}
        {showQueueChrome ? (
          <Box sx={{
            px: 2, py: 1.25, bgcolor: "#fff",
            borderBottom: "1px solid #e2e8f0",
            display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", flexShrink: 0
          }}>
            <TextField
              size="small"
              placeholder="Search tickets…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
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
                disabled={viewParam !== "table"}
                sx={{
                  fontSize: 12, fontWeight: 500, textTransform: "none",
                  color: "#1d4ed8", px: 0.75, py: 0.25, minWidth: 0,
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
        ) : null}

        {/* Body */}
        <Box sx={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {isDetailRoute ? <Outlet /> : null}

          {showQueueChrome && isLoading ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}
          {showQueueChrome && error ? <Box sx={{ p: 3 }}><ErrorState title="Failed to load tickets" /></Box> : null}

          {showQueueChrome && !isLoading && !error && viewParam === "board" ? (
            <ServiceDeskBoard tickets={filtered} />
          ) : null}

          {showQueueChrome && !isLoading && !error && viewParam === "table" && filtered.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <EmptyState
                title="No tickets match this filter"
                detail="Try a different view or clear the type filter."
              />
            </Box>
          ) : null}

          {showQueueChrome && !isLoading && !error && viewParam === "table" && filtered.length > 0 ? (
            <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#fff" }}>
              <DataGrid
                apiRef={apiRef}
                rows={filtered}
                columns={unifiedColumns}
                density="compact"
                rowHeight={64}
                initialState={{
                  pagination: { paginationModel: { pageSize: 50 } },
                  sorting: { sortModel: [{ field: "updatedAt", sort: "desc" }] },
                }}
                pageSizeOptions={[25, 50, 100]}
                disableRowSelectionOnClick
                onRowClick={params => handleRowClick(params.row as Ticket)}
                slots={{ toolbar: null, footer: UnifiedFooter }}
                getRowClassName={params => (params.row as Ticket).overdue ? "overdue-row" : ""}
                sx={{
                  ...dataGridSx(true),
                  // Vertically centre cell contents — without this, Typography
                  // children sit at the top of the row by default in compact density.
                  "& .MuiDataGrid-cell": {
                    borderColor: "#f1f5f9",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  },
                  "& .overdue-row .MuiDataGrid-cell:first-of-type": {
                    boxShadow: "inset 3px 0 0 #ef4444",
                  },
                }}
              />
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* Modals */}
      <NewTicketTypePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={handlePickType} />
      <CreateServiceRequestModal open={srOpen} onClose={() => setSrOpen(false)} />
      <CreateIncidentModal open={incOpen} onClose={() => setIncOpen(false)} />
      <CreateChangeModal open={chgOpen} onClose={() => setChgOpen(false)} />
    </Box>
  )
}

export default function ServiceDeskPage() {
  return <UnifiedServiceDeskView />
}
