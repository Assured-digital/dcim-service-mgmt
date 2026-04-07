import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Dialog,
  DialogActions, DialogContent, DialogTitle, IconButton,
  Menu, MenuItem, Popover, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import TableRowsIcon from "@mui/icons-material/TableRows"
import ViewKanbanIcon from "@mui/icons-material/ViewKanban"
import MoreVertIcon from "@mui/icons-material/MoreVert"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CheckIcon from "@mui/icons-material/Check"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { chipSx } from "../components/shared"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getCurrentUser } from "../lib/auth"

// ── Types ──────────────────────────────────────────────────────────────────
type Task = {
  id: string
  reference: string
  title: string
  description: string | null
  status: string
  priority: string
  dueAt: string | null
  createdAt: string
  updatedAt: string
  assigneeId: string | null
  assignee: { id: string; email: string } | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  incident: { id: string; reference: string; title: string } | null
}

type User = { id: string; email: string }

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_FLOW: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "BLOCKED", "DONE"],
  IN_PROGRESS: ["OPEN", "BLOCKED", "DONE"],
  BLOCKED: ["OPEN", "IN_PROGRESS", "DONE"],
  DONE: ["OPEN"]
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In Progress", BLOCKED: "Blocked", DONE: "Done"
}

const ALL_STATUSES = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"]
const ALL_PRIORITIES = ["critical", "high", "medium", "low"]

const COLUMNS = [
  { status: "OPEN", label: "Open", chipBg: "#E2E8F0", chipText: "#475569", accent: null },
  { status: "IN_PROGRESS", label: "In Progress", chipBg: "#DBEAFE", chipText: "#1D4ED8", accent: null },
  { status: "BLOCKED", label: "Blocked", chipBg: "#FEE2E2", chipText: "#DC2626", accent: "#F59E0B" },
  { status: "DONE", label: "Done", chipBg: "#DCFCE7", chipText: "#16A34A", accent: "#22C55E" }
]

// ── Helpers ────────────────────────────────────────────────────────────────
function isOverdue(dueAt: string | null) {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

function priorityDot(priority: string) {
  const m: Record<string, string> = { critical: "#dc2626", high: "#f97316", medium: "#f59e0b", low: "#22c55e" }
  return m[priority?.toLowerCase()] ?? "#94a3b8"
}

function priorityChipSx(priority: string) {
  const m: Record<string, { bgcolor: string; color: string }> = {
    critical: { bgcolor: "#fee2e2", color: "#b91c1c" },
    high: { bgcolor: "#ffedd5", color: "#c2410c" },
    medium: { bgcolor: "#fef3c7", color: "#b45309" },
    low: { bgcolor: "#f0fdf4", color: "#15803d" }
  }
  return { ...(m[priority?.toLowerCase()] ?? { bgcolor: "#f1f5f9", color: "#475569" }), fontWeight: 600, fontSize: 11 }
}

function statusChipSx(status: string) {
  const col = COLUMNS.find(c => c.status === status)
  if (col) return { bgcolor: col.chipBg, color: col.chipText, fontWeight: 600, fontSize: 11 }
  return chipSx(status)
}

function initials(email: string) {
  return email.split("@")[0].slice(0, 2).toUpperCase()
}

function linkedLabel(task: Task) {
  if (task.incident) return `INC · ${task.incident.reference}`
  if (task.linkedEntityType) return task.linkedEntityType.replace(/([A-Z])/g, " $1").trim()
  return null
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function formatDate(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function formatDateTime(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${date}, ${time}`
}

// ── Generic option popover ────────────────────────────────────────────────
function OptionPopover({ anchorEl, onClose, options, current, onSelect }: {
  anchorEl: HTMLElement | null; onClose: () => void
  options: { value: string; label: string; dot?: string }[]
  current: string; onSelect: (v: string) => void
}) {
  return (
    <Popover
      open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { boxShadow: "0 4px 16px rgba(15,23,42,0.12)", borderRadius: "8px", border: "1px solid #e2e8f0", minWidth: 160 } }}
    >
      <Box sx={{ py: "4px" }}>
        {options.map(opt => (
          <Box key={opt.value} onClick={() => { onSelect(opt.value); onClose() }} sx={{
            display: "flex", alignItems: "center", gap: "8px",
            px: "12px", py: "8px", cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" }
          }}>
            {opt.dot ? <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: opt.dot, flexShrink: 0 }} /> : null}
            <Typography sx={{ fontSize: 13, color: "#0f172a", flex: 1 }}>{opt.label}</Typography>
            {opt.value === current ? <CheckIcon sx={{ fontSize: 13, color: "#1d4ed8" }} /> : null}
          </Box>
        ))}
      </Box>
    </Popover>
  )
}

// Assignee popover
function AssigneePopover({ anchorEl, onClose, users, currentId, onSelect }: {
  anchorEl: HTMLElement | null; onClose: () => void
  users: User[]; currentId: string | null; onSelect: (id: string | null) => void
}) {
  return (
    <Popover
      open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { boxShadow: "0 4px 16px rgba(15,23,42,0.12)", borderRadius: "8px", border: "1px solid #e2e8f0", minWidth: 200 } }}
    >
      <Box sx={{ py: "4px" }}>
        <Box onClick={() => { onSelect(null); onClose() }} sx={{ display: "flex", alignItems: "center", gap: "8px", px: "12px", py: "8px", cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}>
          <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: "#f1f5f9", flexShrink: 0 }} />
          <Typography sx={{ fontSize: 13, color: "#94a3b8", flex: 1 }}>Unassigned</Typography>
          {!currentId ? <CheckIcon sx={{ fontSize: 13, color: "#1d4ed8" }} /> : null}
        </Box>
        {users.map(u => (
          <Box key={u.id} onClick={() => { onSelect(u.id); onClose() }} sx={{ display: "flex", alignItems: "center", gap: "8px", px: "12px", py: "8px", cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}>
            <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: "#e8f1ff", color: "#1d4ed8", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {initials(u.email)}
            </Box>
            <Typography sx={{ fontSize: 13, color: "#0f172a", flex: 1 }}>{u.email.split("@")[0]}</Typography>
            {u.id === currentId ? <CheckIcon sx={{ fontSize: 13, color: "#1d4ed8" }} /> : null}
          </Box>
        ))}
      </Box>
    </Popover>
  )
}

// Due date popover
function DueDatePopover({ anchorEl, onClose, current, onSelect }: {
  anchorEl: HTMLElement | null; onClose: () => void
  current: string | null; onSelect: (v: string | null) => void
}) {
  const [val, setVal] = React.useState(current ? current.slice(0, 10) : "")
  return (
    <Popover
      open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { boxShadow: "0 4px 16px rgba(15,23,42,0.12)", borderRadius: "8px", border: "1px solid #e2e8f0", p: "12px", minWidth: 200 } }}
    >
      <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", mb: "8px" }}>
        Due date
      </Typography>
      <TextField
        type="date" size="small" fullWidth
        value={val}
        InputLabelProps={{ shrink: true }}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { onSelect(val || null); onClose() } }}
      />
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: "10px" }}>
        <Button size="small" variant="text" sx={{ fontSize: 12, color: "#64748b" }}
          onClick={() => { onSelect(null); onClose() }}>
          Clear
        </Button>
        <Button size="small" variant="contained" sx={{ fontSize: 12 }}
          onClick={() => { onSelect(val || null); onClose() }}>
          Set
        </Button>
      </Stack>
    </Popover>
  )
}

// ── Inline create row ─────────────────────────────────────────────────────
function InlineCreateRow({ users, onCreate, onCancel }: {
  users: User[]; onCreate: (task: Partial<Task>) => void; onCancel: () => void
}) {
  const [title, setTitle] = React.useState("")
  const [status, setStatus] = React.useState("OPEN")
  const [priority, setPriority] = React.useState("medium")
  const [assigneeId, setAssigneeId] = React.useState<string | null>(null)
  const [dueAt, setDueAt] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const [statusAnchor, setStatusAnchor] = React.useState<HTMLElement | null>(null)
  const [priorityAnchor, setPriorityAnchor] = React.useState<HTMLElement | null>(null)
  const [assigneeAnchor, setAssigneeAnchor] = React.useState<HTMLElement | null>(null)
  const [dueAnchor, setDueAnchor] = React.useState<HTMLElement | null>(null)

  const assignee = users.find(u => u.id === assigneeId)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    await onCreate({ title, status, priority, assigneeId: assigneeId ?? undefined as any, dueAt })
    setSaving(false)
  }

  return (
    <>
      <TableRow sx={{ bgcolor: "#f8fafc", "& td": { py: "6px" } }}>
        {/* Title */}
        <TableCell sx={{ pl: "16px" }}>
          <TextField
            autoFocus size="small" placeholder="What needs to be done?" value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancel() }}
            sx={{ width: "100%", "& .MuiInputBase-root": { fontSize: 13, bgcolor: "#fff" } }}
          />
        </TableCell>
        {/* Reference placeholder */}
        <TableCell />
        {/* Status */}
        <TableCell onClick={e => e.stopPropagation()}>
          <Chip size="small"
            sx={{ ...statusChipSx(status), cursor: "pointer" }}
            label={
                              <Stack direction="row" alignItems="center" spacing={0.25}>
                                <span>{STATUS_LABELS[status]}</span>
                                <KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6 }} />
                              </Stack>
                            }
            onClick={e => setStatusAnchor(e.currentTarget)}
          />
        </TableCell>
        {/* Priority */}
        <TableCell onClick={e => e.stopPropagation()}>
          <Chip size="small"
            sx={{ ...priorityChipSx(priority), cursor: "pointer" }}
            label={
              <Stack direction="row" alignItems="center" spacing={0.25}>
                <span>{capitalize(priority)}</span>
                <KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6 }} />
              </Stack>
            }
            onClick={e => setPriorityAnchor(e.currentTarget)}
          />
        </TableCell>
        {/* Assignee */}
        <TableCell onClick={e => e.stopPropagation()}>
          <Box
            onClick={e => setAssigneeAnchor(e.currentTarget)}
            sx={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", px: "6px", py: "3px", borderRadius: "6px", "&:hover": { bgcolor: "#f1f5f9" } }}
          >
            <Box sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: assignee ? "#e8f1ff" : "#f1f5f9", color: "#1d4ed8", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {assignee ? initials(assignee.email) : ""}
            </Box>
            <Typography sx={{ fontSize: 12, color: assignee ? "#0f172a" : "#94a3b8" }}>
              {assignee ? assignee.email.split("@")[0] : "Assign"}
            </Typography>
          </Box>
        </TableCell>
        {/* Linked */}
        <TableCell />
        {/* Due */}
        <TableCell onClick={e => e.stopPropagation()}>
          <Box
            onClick={e => setDueAnchor(e.currentTarget)}
            sx={{ display: "inline-flex", alignItems: "center", gap: "4px", cursor: "pointer", px: "6px", py: "3px", borderRadius: "6px", "&:hover": { bgcolor: "#f1f5f9" } }}
          >
            <Typography sx={{ fontSize: 12, color: dueAt ? (isOverdue(dueAt) ? "#b91c1c" : "#0f172a") : "#94a3b8" }}>
              {dueAt ? formatDate(dueAt) : "Set due"}
            </Typography>
          </Box>
        </TableCell>
        {/* Updated placeholder */}
        <TableCell />
        {/* Actions */}
        <TableCell>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" variant="contained" sx={{ fontSize: 11, py: "3px", px: "10px", minWidth: 0 }}
              onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "..." : "Save"}
            </Button>
            <Button size="small" variant="text" sx={{ fontSize: 11, py: "3px", px: "8px", minWidth: 0, color: "#64748b" }}
              onClick={onCancel}>
              Cancel
            </Button>
          </Stack>
        </TableCell>
      </TableRow>

      {/* Popovers */}
      <OptionPopover
        anchorEl={statusAnchor} onClose={() => setStatusAnchor(null)}
        current={status} onSelect={setStatus}
        options={ALL_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s], dot: COLUMNS.find(c => c.status === s)?.chipText }))}
      />
      <OptionPopover
        anchorEl={priorityAnchor} onClose={() => setPriorityAnchor(null)}
        current={priority} onSelect={setPriority}
        options={ALL_PRIORITIES.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1), dot: priorityDot(p) }))}
      />
      <AssigneePopover
        anchorEl={assigneeAnchor} onClose={() => setAssigneeAnchor(null)}
        users={users} currentId={assigneeId} onSelect={setAssigneeId}
      />
      <DueDatePopover
        anchorEl={dueAnchor} onClose={() => setDueAnchor(null)}
        current={dueAt} onSelect={setDueAt}
      />
    </>
  )
}

// ── Task card (board view) ─────────────────────────────────────────────────
function TaskCard({ task, navigate }: { task: Task; navigate: (path: string) => void }) {
  const overdue = isOverdue(task.dueAt)
  const col = COLUMNS.find(c => c.status === task.status)
  const linked = linkedLabel(task)
  return (
    <Card onClick={() => navigate(`/tasks/${task.id}`)} sx={{
      mb: 1.5, cursor: "pointer", borderRadius: "8px",
      border: "1px solid #e2e8f0",
      borderLeft: col?.accent ? `3px solid ${col.accent}` : "1px solid #e2e8f0",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
      "&:hover": { boxShadow: "0 2px 8px rgba(15,23,42,0.10)", borderColor: col?.accent ?? "#cbd5e1" },
      transition: "all 0.15s"
    }}>
      <Box sx={{ px: "14px", pt: "12px", pb: "12px" }}>
        <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ mb: "4px" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: priorityDot(task.priority), flexShrink: 0, mt: "5px" }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a", lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {task.title}
          </Typography>
        </Stack>
        <Typography sx={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", mb: "10px", pl: "16px" }}>
          {task.reference}
        </Typography>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          {task.assignee ? (
            <Tooltip title={task.assignee.email}>
              <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: "#e8f1ff", color: "#1d4ed8", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {initials(task.assignee.email)}
              </Box>
            </Tooltip>
          ) : <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: "#f1f5f9" }} />}
          {task.dueAt ? (
            <Typography sx={{ fontSize: 11, color: overdue ? "#b91c1c" : "#64748b", fontWeight: overdue ? 700 : 400 }}>
              {formatDate(task.dueAt)}
            </Typography>
          ) : null}
        </Stack>
        {linked ? <Box sx={{ mt: "8px" }}><Chip size="small" label={linked} sx={{ height: 18, fontSize: 10, bgcolor: "#f1f5f9", color: "#475569" }} /></Box> : null}
      </Box>
    </Card>
  )
}

// ── Export modal (kept for use from other pages) ───────────────────────────
export function CreateTaskModal({ open, onClose, linkedEntityType, linkedEntityId, linkedEntityLabel }: {
  open: boolean; onClose: () => void
  linkedEntityType?: string; linkedEntityId?: string; linkedEntityLabel?: string
}) {
  const qc = useQueryClient()
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")
  const [dueAt, setDueAt] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
    enabled: open
  })

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true); setError("")
    try {
      await api.post("/tasks", {
        title, description: description || undefined,
        priority, dueAt: dueAt || undefined,
        assigneeId: assigneeId || undefined,
        linkedEntityType: linkedEntityType || undefined,
        linkedEntityId: linkedEntityId || undefined
      })
      onClose()
      setTitle(""); setDescription(""); setPriority("medium"); setDueAt(""); setAssigneeId("")
      qc.invalidateQueries({ queryKey: ["tasks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to create task")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create task</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {linkedEntityLabel ? (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#f0f9ff", border: "1px solid #bae6fd" }}>
              <Typography variant="caption" color="#0369a1">Linked to: <strong>{linkedEntityLabel}</strong></Typography>
            </Box>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} fullWidth required />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} multiline rows={3} fullWidth />
          <Stack direction="row" spacing={1.5}>
            <TextField select label="Priority" value={priority} onChange={e => setPriority(e.target.value)} fullWidth>
              {ALL_PRIORITIES.map(p => <MenuItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</MenuItem>)}
            </TextField>
            <TextField label="Due date" type="date" InputLabelProps={{ shrink: true }} value={dueAt} onChange={e => setDueAt(e.target.value)} fullWidth />
          </Stack>
          <TextField select label="Assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} fullWidth>
            <MenuItem value="">Unassigned</MenuItem>
            {(users ?? []).map(u => <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>)}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim()}>
          {saving ? "Creating..." : "Create task"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function TasksPage() {
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  const navigate = useNavigate()
  const qc = useQueryClient()
  const currentUser = getCurrentUser()

  const [viewMode, setViewMode] = React.useState<"list" | "board">(() => {
    try { return (localStorage.getItem("ad-tasks-view") as "list" | "board") ?? "list" } catch { return "list" }
  })

  // Active filter chips — Jira style multi-select
  const [filterStatuses, setFilterStatuses] = React.useState<string[]>([])
  const [filterPriorities, setFilterPriorities] = React.useState<string[]>([])
  const [filterAssignee, setFilterAssignee] = React.useState<string | null>(null)
  const [filterMine, setFilterMine] = React.useState(false)
  const [filterOverdue, setFilterOverdue] = React.useState(false)

  // Inline create
  const [creatingInline, setCreatingInline] = React.useState(false)

  // Hover popovers
  const [statusAnchor, setStatusAnchor] = React.useState<{ el: HTMLElement; task: Task } | null>(null)
  const [priorityAnchor, setPriorityAnchor] = React.useState<{ el: HTMLElement; task: Task } | null>(null)
  const [assigneeAnchor, setAssigneeAnchor] = React.useState<{ el: HTMLElement; task: Task } | null>(null)
  const [dueAnchor, setDueAnchor] = React.useState<{ el: HTMLElement; task: Task } | null>(null)
  const [menuAnchor, setMenuAnchor] = React.useState<{ el: HTMLElement; task: Task } | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data
  })
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const tasks = data ?? []
  const hasAnyFilter = filterStatuses.length > 0 || filterPriorities.length > 0 || filterAssignee || filterMine || filterOverdue

  function clearFilters() {
    setFilterStatuses([]); setFilterPriorities([]); setFilterAssignee(null)
    setFilterMine(false); setFilterOverdue(false)
  }

  function handleViewChange(v: "list" | "board") {
    setViewMode(v)
    try { localStorage.setItem("ad-tasks-view", v) } catch {}
  }

  function toggleStatus(s: string) {
    setFilterStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }
  function togglePriority(p: string) {
    setFilterPriorities(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function patchTask(taskId: string, patch: Record<string, any>) {
    await api.put(`/tasks/${taskId}`, patch)
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  async function updateStatus(taskId: string, status: string) {
    await api.post(`/tasks/${taskId}/status`, { status })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  async function createInline(partial: Partial<Task>) {
    await api.post("/tasks", {
      title: partial.title,
      status: partial.status,
      priority: partial.priority,
      assigneeId: partial.assigneeId || undefined,
      dueAt: partial.dueAt || undefined
    })
    qc.invalidateQueries({ queryKey: ["tasks"] })
    setCreatingInline(false)
  }

  const filtered = React.useMemo(() => {
    let result = tasks
    if (filterStatuses.length > 0) result = result.filter(t => filterStatuses.includes(t.status))
    if (filterPriorities.length > 0) result = result.filter(t => filterPriorities.includes(t.priority?.toLowerCase()))
    if (filterMine && currentUser?.userId) result = result.filter(t => t.assigneeId === currentUser.userId)
    if (filterAssignee) result = result.filter(t => t.assigneeId === filterAssignee)
    if (filterOverdue) result = result.filter(t => isOverdue(t.dueAt) && t.status !== "DONE")
    return result
  }, [tasks, filterStatuses, filterPriorities, filterMine, filterAssignee, filterOverdue, currentUser])

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState title="Failed to load tasks" />

  return (
    <Box>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <Box sx={{ mb: "16px" }}>
        <Stack direction="row" alignItems="flex-start" flexWrap="wrap" sx={{ gap: "12px" }}>

          {/* Status group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", mb: "6px" }}>
              Status
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              {COLUMNS.map(col => (
                <Chip
                  key={col.status}
                  label={col.label}
                  size="small"
                  onClick={() => toggleStatus(col.status)}
                  sx={{
                    fontSize: 12, fontWeight: 500, cursor: "pointer", height: 26,
                    bgcolor: filterStatuses.includes(col.status) ? col.chipBg : "#f1f5f9",
                    color: filterStatuses.includes(col.status) ? col.chipText : "#64748b",
                    border: filterStatuses.includes(col.status) ? `1px solid ${col.chipText}50` : "1px solid #e2e8f0",
                    "&:hover": { bgcolor: col.chipBg, color: col.chipText, borderColor: `${col.chipText}50` }
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* Divider */}
          <Box sx={{ width: "1px", bgcolor: "#e2e8f0", alignSelf: "stretch", mt: "18px" }} />

          {/* Priority group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", mb: "6px" }}>
              Priority
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              {ALL_PRIORITIES.map(p => (
                <Chip
                  key={p}
                  size="small"
                  onClick={() => togglePriority(p)}
                  label={
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: filterPriorities.includes(p) ? priorityDot(p) : "#94a3b8", flexShrink: 0 }} />
                      <span>{capitalize(p)}</span>
                    </Stack>
                  }
                  sx={{
                    fontSize: 12, fontWeight: 500, cursor: "pointer", height: 26,
                    bgcolor: filterPriorities.includes(p) ? "#fef9f0" : "#f1f5f9",
                    color: filterPriorities.includes(p) ? "#b45309" : "#64748b",
                    border: filterPriorities.includes(p) ? "1px solid #fcd34d" : "1px solid #e2e8f0",
                    "&:hover": { bgcolor: "#fef9f0", color: "#b45309", borderColor: "#fcd34d" }
                  }}
                />
              ))}
            </Stack>
          </Box>

          {/* Divider */}
          <Box sx={{ width: "1px", bgcolor: "#e2e8f0", alignSelf: "stretch", mt: "18px" }} />

          {/* Quick filters group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", mb: "6px" }}>
              Quick filter
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              <Chip label="Mine" size="small" onClick={() => setFilterMine(m => !m)}
                sx={{
                  fontSize: 12, fontWeight: 500, cursor: "pointer", height: 26,
                  bgcolor: filterMine ? "#e8f1ff" : "#f1f5f9",
                  color: filterMine ? "#1d4ed8" : "#64748b",
                  border: filterMine ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                  "&:hover": { bgcolor: "#e8f1ff", color: "#1d4ed8", borderColor: "#93c5fd" }
                }}
              />
              <Chip label="Overdue" size="small" onClick={() => setFilterOverdue(o => !o)}
                sx={{
                  fontSize: 12, fontWeight: 500, cursor: "pointer", height: 26,
                  bgcolor: filterOverdue ? "#fef2f2" : "#f1f5f9",
                  color: filterOverdue ? "#b91c1c" : "#64748b",
                  border: filterOverdue ? "1px solid #fca5a5" : "1px solid #e2e8f0",
                  "&:hover": { bgcolor: "#fef2f2", color: "#b91c1c", borderColor: "#fca5a5" }
                }}
              />
            </Stack>
          </Box>

          {/* Divider */}
          <Box sx={{ width: "1px", bgcolor: "#e2e8f0", alignSelf: "stretch", mt: "18px" }} />

          {/* Assignee group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", mb: "6px" }}>
              Assignee
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              {users.slice(0, 6).map(u => {
                const active = filterAssignee === u.id
                return (
                  <Tooltip key={u.id} title={u.email}>
                    <Box
                      onClick={() => setFilterAssignee(active ? null : u.id)}
                      sx={{
                        width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
                        bgcolor: active ? "#1d4ed8" : "#e8f1ff",
                        color: active ? "#fff" : "#1d4ed8",
                        fontSize: 10, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: active ? "2px solid #1d4ed8" : "2px solid transparent",
                        "&:hover": { borderColor: "#1d4ed8" },
                        transition: "all 0.12s"
                      }}
                    >
                      {initials(u.email)}
                    </Box>
                  </Tooltip>
                )
              })}
            </Stack>
          </Box>

          {/* Clear */}
          {hasAnyFilter ? (
            <Box sx={{ alignSelf: "flex-end", pb: "2px" }}>
              <Button size="small" variant="text" onClick={clearFilters}
                sx={{ fontSize: 12, color: "#64748b", py: "4px", minWidth: 0, "&:hover": { color: "#0f172a" } }}>
                Clear all
              </Button>
            </Box>
          ) : null}

          {/* Spacer pushes View to the right */}
          <Box sx={{ flex: 1 }} />

          {/* View group — right aligned */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", mb: "6px" }}>
              View
            </Typography>
            <ToggleButtonGroup value={viewMode} exclusive size="small" onChange={(_, v) => v && handleViewChange(v)}
              sx={{ height: 26 }}>
              <ToggleButton value="list" sx={{ px: "10px", py: 0, fontSize: 11, fontWeight: 500, gap: "4px" }}>
                <TableRowsIcon sx={{ fontSize: 14 }} />
                List
              </ToggleButton>
              <ToggleButton value="board" sx={{ px: "10px", py: 0, fontSize: 11, fontWeight: 500, gap: "4px" }}>
                <ViewKanbanIcon sx={{ fontSize: 14 }} />
                Board
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Stack>
      </Box>

      {/* No tasks at all */}
      {tasks.length === 0 && !creatingInline ? (
        <EmptyState title="No tasks yet" detail="Tasks are created from triage, service requests, risks, issues and sites." />
      ) : null}

      {/* ── BOARD VIEW ─────────────────────────────────────────────────── */}
      {viewMode === "board" && (tasks.length > 0 || creatingInline) ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2, alignItems: "start" }}>
          {COLUMNS.map(col => {
            const colTasks = filtered.filter(t => t.status === col.status)
            return (
              <Box key={col.status}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                  <Box sx={{ px: 1.25, py: "3px", borderRadius: 10, bgcolor: col.chipBg }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: col.chipText, lineHeight: 1.6 }}>{col.label}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>{colTasks.length}</Typography>
                </Stack>
                {colTasks.length === 0 ? (
                  <Box sx={{ minHeight: 80, border: "2px dashed #e2e8f0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography variant="caption" color="text.secondary">No {col.label.toLowerCase()}</Typography>
                  </Box>
                ) : colTasks.map(task => <TaskCard key={task.id} task={task} navigate={navigate} />)}
              </Box>
            )
          })}
        </Box>
      ) : null}

      {/* ── LIST VIEW ──────────────────────────────────────────────────── */}
      {viewMode === "list" && (tasks.length > 0 || creatingInline) ? (
        <Card variant="outlined">
          {filtered.length === 0 && !creatingInline ? (
            <Box sx={{ py: 6, textAlign: "center" }}>
              <Typography color="text.secondary" sx={{ mb: 1 }}>No tasks match your filters</Typography>
              {hasAnyFilter ? <Button variant="text" size="small" onClick={clearFilters}>Clear filters</Button> : null}
            </Box>
          ) : null}

          {(filtered.length > 0 || creatingInline) ? (
            <TableContainer>
              <Table sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow sx={{ "& th": { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc" } }}>
                    <TableCell sx={{ pl: "16px" }}>Title</TableCell>
                    <TableCell>Ref</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Linked to</TableCell>
                    <TableCell>Due</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(task => {
                    const overdue = isOverdue(task.dueAt)
                    const linked = linkedLabel(task)
                    return (
                      <TableRow
                        key={task.id} hover
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        sx={{
                          cursor: "pointer",
                          borderLeft: overdue && task.status !== "DONE" ? "3px solid #ef4444" : "3px solid transparent",
                          "&:hover .row-actions": { opacity: 1 },
                          "&:hover .editable-cell": { bgcolor: "#f8fafc", borderRadius: "4px" }
                        }}
                      >
                        {/* Title */}
                        <TableCell sx={{ pl: "14px", maxWidth: 280 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: priorityDot(task.priority) }} />
                            <Typography variant="body2" fontWeight={600} sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {task.title}
                            </Typography>
                          </Stack>
                        </TableCell>

                        {/* Reference */}
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                          {task.reference}
                        </TableCell>

                        {/* Status — click to change */}
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Chip size="small"
                            sx={{ ...statusChipSx(task.status), cursor: canManage ? "pointer" : "default" }}
                            label={
                              <Stack direction="row" alignItems="center" spacing={0.25}>
                                <span>{STATUS_LABELS[task.status] ?? task.status}</span>
                                {canManage ? <KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6 }} /> : null}
                              </Stack>
                            }
                            onClick={canManage ? e => { e.stopPropagation(); setStatusAnchor({ el: e.currentTarget, task }) } : undefined}
                          />
                        </TableCell>

                        {/* Priority — click to change */}
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Chip size="small"
                            sx={{ ...priorityChipSx(task.priority), cursor: canManage ? "pointer" : "default" }}
                            label={
                              <Stack direction="row" alignItems="center" spacing={0.25}>
                                <span>{capitalize(task.priority)}</span>
                                {canManage ? <KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6 }} /> : null}
                              </Stack>
                            }
                            onClick={canManage ? e => { e.stopPropagation(); setPriorityAnchor({ el: e.currentTarget, task }) } : undefined}
                          />
                        </TableCell>

                        {/* Assignee — click to change */}
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Box
                            className="editable-cell"
                            onClick={canManage ? e => { e.stopPropagation(); setAssigneeAnchor({ el: e.currentTarget, task }) } : undefined}
                            sx={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: canManage ? "pointer" : "default", px: "4px", py: "2px" }}
                          >
                            {task.assignee ? (
                              <>
                                <Box sx={{ width: 20, height: 20, borderRadius: "50%", bgcolor: "#e8f1ff", color: "#1d4ed8", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  {initials(task.assignee.email)}
                                </Box>
                                <Typography sx={{ fontSize: 12, color: "#475569" }}>
                                  {task.assignee.email.split("@")[0]}
                                </Typography>
                              </>
                            ) : (
                              <Typography sx={{ fontSize: 12, color: "#cbd5e1" }}>—</Typography>
                            )}
                          </Box>
                        </TableCell>

                        {/* Linked */}
                        <TableCell>
                          {linked ? <Chip size="small" label={linked} sx={{ height: 20, fontSize: 10, bgcolor: "#f1f5f9", color: "#475569" }} /> : <Typography sx={{ color: "#e2e8f0" }}>—</Typography>}
                        </TableCell>

                        {/* Due — click to change */}
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Box
                            className="editable-cell"
                            onClick={canManage ? e => { e.stopPropagation(); setDueAnchor({ el: e.currentTarget, task }) } : undefined}
                            sx={{ display: "inline-flex", alignItems: "center", cursor: canManage ? "pointer" : "default", px: "4px", py: "2px" }}
                          >
                            <Typography sx={{ fontSize: 12, color: overdue && task.status !== "DONE" ? "#b91c1c" : (task.dueAt ? "#475569" : "#cbd5e1"), fontWeight: overdue && task.status !== "DONE" ? 700 : 400 }}>
                              {task.dueAt ? formatDateTime(task.dueAt) : "—"}
                            </Typography>
                          </Box>
                        </TableCell>

                        {/* Updated */}
                        <TableCell sx={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                          {formatDateTime(task.updatedAt)}
                        </TableCell>

                        {/* Row hover actions */}
                        <TableCell className="row-actions" onClick={e => e.stopPropagation()}
                          sx={{ opacity: 0, transition: "opacity 0.1s", whiteSpace: "nowrap", p: "4px 8px" }}>
                          <Stack direction="row">
                            <IconButton size="small" onClick={() => navigate(`/tasks/${task.id}`)}>
                              <ChevronRightIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                            <IconButton size="small" onClick={e => setMenuAnchor({ el: e.currentTarget, task })}>
                              <MoreVertIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <tfoot>
                  {/* Inline create row — sits just below last task */}
                  {creatingInline ? (
                    <InlineCreateRow users={users} onCreate={createInline} onCancel={() => setCreatingInline(false)} />
                  ) : null}

                  {/* Footer row: count left, Add task right */}
                  <TableRow sx={{ bgcolor: "#f8fafc", "& td": { borderBottom: "none", py: "8px" } }}>
                    <TableCell colSpan={4} sx={{ pl: "16px" }}>
                      <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>
                        {filtered.length} task{filtered.length !== 1 ? "s" : ""}
                        {hasAnyFilter ? ` (filtered from ${tasks.length})` : ""}
                      </Typography>
                    </TableCell>
                    <TableCell colSpan={5} sx={{ textAlign: "right", pr: "12px" }}>
                      {canManage && !creatingInline ? (
                        <Button
                          size="small" variant="text"
                          startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                          onClick={() => setCreatingInline(true)}
                          sx={{ fontSize: 12, color: "#64748b", py: "2px", "&:hover": { color: "#0f172a", bgcolor: "transparent" } }}
                        >
                          Add task
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </TableContainer>
          ) : null}
        </Card>
      ) : null}

      {/* ── Popovers ───────────────────────────────────────────────────── */}

      {/* Status */}
      {statusAnchor ? (
        <OptionPopover
          anchorEl={statusAnchor.el}
          onClose={() => setStatusAnchor(null)}
          current={statusAnchor.task.status}
          onSelect={s => updateStatus(statusAnchor.task.id, s)}
          options={ALL_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s], dot: COLUMNS.find(c => c.status === s)?.chipText }))}
        />
      ) : null}

      {/* Priority */}
      {priorityAnchor ? (
        <OptionPopover
          anchorEl={priorityAnchor.el}
          onClose={() => setPriorityAnchor(null)}
          current={priorityAnchor.task.priority?.toLowerCase()}
          onSelect={p => patchTask(priorityAnchor.task.id, { priority: p })}
          options={ALL_PRIORITIES.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1), dot: priorityDot(p) }))}
        />
      ) : null}

      {/* Assignee */}
      {assigneeAnchor ? (
        <AssigneePopover
          anchorEl={assigneeAnchor.el}
          onClose={() => setAssigneeAnchor(null)}
          users={users}
          currentId={assigneeAnchor.task.assigneeId}
          onSelect={id => patchTask(assigneeAnchor.task.id, { assigneeId: id })}
        />
      ) : null}

      {/* Due date */}
      {dueAnchor ? (
        <DueDatePopover
          anchorEl={dueAnchor.el}
          onClose={() => setDueAnchor(null)}
          current={dueAnchor.task.dueAt}
          onSelect={d => patchTask(dueAnchor.task.id, { dueAt: d })}
        />
      ) : null}

      {/* Row ... menu */}
      <Menu
        open={Boolean(menuAnchor)} anchorEl={menuAnchor?.el}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { boxShadow: "0 4px 16px rgba(15,23,42,0.12)", borderRadius: "8px", border: "1px solid #e2e8f0" } }}
      >
        <MenuItem dense onClick={() => { menuAnchor && navigate(`/tasks/${menuAnchor.task.id}`); setMenuAnchor(null) }}>Open task</MenuItem>
        <MenuItem dense onClick={() => { if (menuAnchor) navigator.clipboard.writeText(menuAnchor.task.reference); setMenuAnchor(null) }}>Copy reference</MenuItem>
      </Menu>
    </Box>
  )
}