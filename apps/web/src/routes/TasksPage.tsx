import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, Chip, Dialog,
  DialogActions, DialogContent, DialogTitle, IconButton,
  Menu, MenuItem, Popover, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField,
  Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import TableRowsIcon from "@mui/icons-material/TableRows"
import ViewKanbanIcon from "@mui/icons-material/ViewKanban"
import ViewColumnIcon from "@mui/icons-material/ViewColumn"
import MoreVertIcon from "@mui/icons-material/MoreVert"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CheckIcon from "@mui/icons-material/Check"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { priorityDot, StatusPill, PriorityCell, AssigneeCell } from "../components/shared"
import { ActivityFeedItem, type FeedEvent, type ResolvedMention } from "../components/detail"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getCurrentUser } from "../lib/auth"
import { formatDate, formatDateTime } from "../lib/format"
import { useAssignableUsers, type AssignableUser } from "../lib/useAssignableUsers"

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
  assignee: { id: string; displayName: string } | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  incident: { id: string; reference: string; title: string } | null
}

type TaskAuditEvent = {
  id: string
  action: string
  actorDisplayName?: string | null
  createdAt: string
  data?: { from?: string; to?: string; fields?: string[] } | null
}
type TaskComment = {
  id: string
  body: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
  createdAt: string
  author: { id: string; displayName: string }
  // Two-level threading: a post's replies are themselves comments (same shape).
  replies?: TaskComment[]
}
type ListColumnId = "title" | "ref" | "status" | "priority" | "assignee" | "due" | "updated"
type ListColumnConfig = {
  id: ListColumnId
  label: string
  minWidth: number
  alwaysVisible?: boolean
}

// ── Constants ──────────────────────────────────────────────────────────────
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
const LIST_COLUMNS: ListColumnConfig[] = [
  { id: "title", label: "Title", minWidth: 260, alwaysVisible: true },
  { id: "ref", label: "Ref", minWidth: 120, alwaysVisible: true },
  { id: "status", label: "Status", minWidth: 140 },
  { id: "priority", label: "Priority", minWidth: 130 },
  { id: "assignee", label: "Assignee", minWidth: 160 },
  { id: "due", label: "Due", minWidth: 140 },
  { id: "updated", label: "Updated", minWidth: 150 }
]
const DEFAULT_VISIBLE_COLUMNS: ListColumnId[] = LIST_COLUMNS.map((col) => col.id)
const TASK_LIST_COLUMNS_STORAGE_KEY = "ad-tasks-list-columns"

// ── Helpers ────────────────────────────────────────────────────────────────
function isOverdue(dueAt: string | null) {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

function initials(label: string) {
  const base = label.includes("@") ? label.split("@")[0] : label
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function linkedLabel(task: Task) {
  if (task.incident) return `INC · ${task.incident.reference}`
  if (task.linkedEntityType) return task.linkedEntityType.replace(/([A-Z])/g, " $1").trim()
  return null
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ── Generic option popover ────────────────────────────────────────────────
function OptionPopover({ anchorEl, onClose, options, current, onSelect, headerLabel }: {
  anchorEl: HTMLElement | null; onClose: () => void
  options: { value: string; label: string; dot?: string }[]
  // eslint-disable-next-line no-unused-vars
  current: string; onSelect: (value: string) => void
  headerLabel?: string
}) {
  return (
    <Popover
      open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { boxShadow: "0 4px 16px rgba(15,23,42,0.12)", borderRadius: "8px", border: "1px solid #e2e8f0", minWidth: 160 } }}
    >
      <Box sx={{ py: "4px" }}>
        {headerLabel ? (
          <Typography sx={{
            px: "12px",
            py: "6px",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#94a3b8"
          }}>
            {headerLabel}
          </Typography>
        ) : null}
        {options.map(opt => (
          <Box key={opt.value} onClick={() => { onSelect(opt.value); onClose() }} sx={{
            display: "flex", alignItems: "center", gap: "8px",
            px: "12px", py: "8px", cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" }
          }}>
            {opt.dot ? <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: opt.dot, flexShrink: 0 }} /> : null}
            <Typography sx={{ fontSize: 13, color: "#0f172a", flex: 1 }}>{opt.label}</Typography>
            {opt.value === current ? <CheckIcon sx={{ fontSize: 13, color: "primary.main" }} /> : null}
          </Box>
        ))}
      </Box>
    </Popover>
  )
}

// Assignee popover
function AssigneePopover({ anchorEl, onClose, users, currentId, onSelect, headerLabel }: {
  anchorEl: HTMLElement | null; onClose: () => void
  // eslint-disable-next-line no-unused-vars
  users: AssignableUser[]; currentId: string | null; onSelect: (assigneeId: string | null) => void
  headerLabel?: string
}) {
  return (
    <Popover
      open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { boxShadow: "0 4px 16px rgba(15,23,42,0.12)", borderRadius: "8px", border: "1px solid #e2e8f0", minWidth: 200 } }}
    >
      <Box sx={{ py: "4px" }}>
        {headerLabel ? (
          <Typography sx={{
            px: "12px",
            py: "6px",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#94a3b8"
          }}>
            {headerLabel}
          </Typography>
        ) : null}
        <Box onClick={() => { onSelect(null); onClose() }} sx={{ display: "flex", alignItems: "center", gap: "8px", px: "12px", py: "8px", cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}>
          <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: "#f1f5f9", flexShrink: 0 }} />
          <Typography sx={{ fontSize: 13, color: "#94a3b8", flex: 1 }}>Unassigned</Typography>
          {!currentId ? <CheckIcon sx={{ fontSize: 13, color: "primary.main" }} /> : null}
        </Box>
        {users.map(u => (
          <Box key={u.id} onClick={() => { onSelect(u.id); onClose() }} sx={{ display: "flex", alignItems: "center", gap: "8px", px: "12px", py: "8px", cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}>
            <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: "#e8f1ff", color: "primary.main", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {initials(u.displayName)}
            </Box>
            <Typography sx={{ fontSize: 13, color: "#0f172a", flex: 1 }}>{u.displayName}</Typography>
            {u.id === currentId ? <CheckIcon sx={{ fontSize: 13, color: "primary.main" }} /> : null}
          </Box>
        ))}
      </Box>
    </Popover>
  )
}

// Due date popover
function DueDatePopover({ anchorEl, onClose, current, onSelect, headerLabel }: {
  anchorEl: HTMLElement | null; onClose: () => void
  // eslint-disable-next-line no-unused-vars
  current: string | null; onSelect: (dueDate: string | null) => void
  headerLabel?: string
}) {
  const [val, setVal] = React.useState(current ? current.slice(0, 10) : "")
  return (
    <Popover
      open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { boxShadow: "0 4px 16px rgba(15,23,42,0.12)", borderRadius: "8px", border: "1px solid #e2e8f0", p: "12px", minWidth: 200 } }}
    >
      <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94a3b8", mb: "8px" }}>
        {headerLabel ?? "Due date"}
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
function InlineCreateRow({ users, onCreate, onCancel, visibleColumns }: {
  // eslint-disable-next-line no-unused-vars
  users: AssignableUser[]; onCreate: (newTask: Partial<Task>) => void; onCancel: () => void
  visibleColumns: ListColumnId[]
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
  const visibleSet = React.useMemo(() => new Set(visibleColumns), [visibleColumns])

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
        {visibleSet.has("title") ? (
          <TableCell sx={{ pl: "16px" }}>
            <TextField
              autoFocus size="small" placeholder="What needs to be done?" value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onCancel() }}
              sx={{ width: "100%", "& .MuiInputBase-root": { fontSize: 13, bgcolor: "#fff" } }}
            />
          </TableCell>
        ) : null}
        {/* Reference placeholder */}
        {visibleSet.has("ref") ? <TableCell /> : null}
        {/* Status */}
        {visibleSet.has("status") ? (
          <TableCell onClick={e => e.stopPropagation()}>
            <Box component="span"
              onClick={e => setStatusAnchor(e.currentTarget)}
              sx={{ display: "inline-flex", cursor: "pointer" }}>
              <StatusPill value={status} label={STATUS_LABELS[status]}
                trailing={<KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6 }} />} />
            </Box>
          </TableCell>
        ) : null}
        {/* Priority */}
        {visibleSet.has("priority") ? (
          <TableCell onClick={e => e.stopPropagation()}>
            <Box component="span"
              onClick={e => setPriorityAnchor(e.currentTarget)}
              sx={{ display: "inline-flex", cursor: "pointer" }}>
              <PriorityCell priority={priority} label={capitalize(priority)}
                trailing={<KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6, color: "#94a3b8" }} />} />
            </Box>
          </TableCell>
        ) : null}
        {/* Assignee */}
        {visibleSet.has("assignee") ? (
          <TableCell onClick={e => e.stopPropagation()}>
            <Box
              onClick={e => setAssigneeAnchor(e.currentTarget)}
              sx={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", px: "6px", py: "3px", borderRadius: "6px", "&:hover": { bgcolor: "#f1f5f9" } }}
            >
              <Box sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: assignee ? "#e8f1ff" : "#f1f5f9", color: "primary.main", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {assignee ? initials(assignee.displayName) : ""}
              </Box>
              <Typography sx={{ fontSize: 12, color: assignee ? "#0f172a" : "#94a3b8" }}>
                {assignee ? assignee.displayName : "Assign"}
              </Typography>
            </Box>
          </TableCell>
        ) : null}
        {/* Due */}
        {visibleSet.has("due") ? (
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
        ) : null}
        {/* Updated placeholder */}
        {visibleSet.has("updated") ? <TableCell /> : null}
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
        headerLabel="Status"
        options={ALL_STATUSES.map(s => ({ value: s, label: STATUS_LABELS[s], dot: COLUMNS.find(c => c.status === s)?.chipText }))}
      />
      <OptionPopover
        anchorEl={priorityAnchor} onClose={() => setPriorityAnchor(null)}
        current={priority} onSelect={setPriority}
        headerLabel="Priority"
        options={ALL_PRIORITIES.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1), dot: priorityDot(p) }))}
      />
      <AssigneePopover
        anchorEl={assigneeAnchor} onClose={() => setAssigneeAnchor(null)}
        users={users} currentId={assigneeId} onSelect={setAssigneeId} headerLabel="Assignee"
      />
      <DueDatePopover
        anchorEl={dueAnchor} onClose={() => setDueAnchor(null)}
        current={dueAt} onSelect={setDueAt} headerLabel="Due date"
      />
    </>
  )
}

// ── Task card (board view) ─────────────────────────────────────────────────
function TaskCardBody({ task, isDragging, onClick }: {
  task: Task
  isDragging?: boolean
  onClick?: () => void
}) {
  const overdue = isOverdue(task.dueAt)
  const col = COLUMNS.find(c => c.status === task.status)
  const linked = linkedLabel(task)
  return (
    <Card onClick={onClick} sx={{
      mb: 1.5, cursor: "pointer", borderRadius: "8px",
      border: "1px solid #e2e8f0",
      borderLeft: col?.accent ? `3px solid ${col.accent}` : "1px solid #e2e8f0",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
      "&:hover": { boxShadow: "0 2px 8px rgba(15,23,42,0.10)", borderColor: col?.accent ?? "#cbd5e1" },
      transition: "all 0.15s",
      opacity: isDragging ? 0.4 : 1
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
            <Tooltip title={task.assignee.displayName}>
              <Box sx={{ width: 24, height: 24, borderRadius: "50%", bgcolor: "#e8f1ff", color: "primary.main", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {initials(task.assignee.displayName)}
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

function DraggableTaskCard({ task, onOpen }: {
  task: Task
  // eslint-disable-next-line no-unused-vars
  onOpen: (taskId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status, taskId: task.id }
  })

  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 20 : "auto" }}
      {...listeners}
      {...attributes}
    >
      <TaskCardBody
        task={task}
        isDragging={isDragging}
        onClick={() => { if (!isDragging) onOpen(task.id) }}
      />
    </Box>
  )
}

function DroppableBoardColumn({ status, children }: {
  status: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${status}`, data: { status } })
  return (
    <Box
      ref={setNodeRef}
      sx={{
        minHeight: 84,
        borderRadius: "8px",
        bgcolor: isOver ? "#eff6ff" : "transparent",
        transition: "background-color 0.12s"
      }}
    >
      {children}
    </Box>
  )
}

// ── Export modal (kept for use from other pages) ───────────────────────────
export function CreateTaskModal({ open, onClose, linkedEntityType, linkedEntityId, linkedEntityLabel, onSuccess }: {
  open: boolean; onClose: () => void
  linkedEntityType?: string; linkedEntityId?: string; linkedEntityLabel?: string
  onSuccess?: () => Promise<void> | void
}) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")
  const [dueAt, setDueAt] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Assignee picker source — operational-callable & client-scoped, replacing the
  // admin-only GET /users that 403'd for operational roles. value = id, label = displayName.
  const { data: users } = useAssignableUsers()

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true)
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
      await onSuccess?.()
      notify.success("Task created")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to create task")
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
            {(users ?? []).map(u => <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>)}
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

export function TaskQuickDetailModal({
  open,
  taskId,
  users,
  canManage,
  onClose,
  onOpenFull,
  onPatchTask,
  onUpdateStatus
}: {
  open: boolean
  taskId: string | null
  users: AssignableUser[]
  canManage: boolean
  onClose: () => void
  // eslint-disable-next-line no-unused-vars
  onOpenFull: (taskId: string) => void
  // eslint-disable-next-line no-unused-vars
  onPatchTask: (taskId: string, patch: Record<string, any>) => Promise<void>
  // eslint-disable-next-line no-unused-vars
  onUpdateStatus: (taskId: string, status: string) => Promise<void>
}) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [activeTab, setActiveTab] = React.useState<"details" | "work-notes" | "history">("details")
  const [saving, setSaving] = React.useState(false)
  const [newNote, setNewNote] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [priority, setPriority] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [dueAt, setDueAt] = React.useState("")

  const { data: task } = useQuery({
    queryKey: ["task-detail", taskId],
    queryFn: async () => (await api.get<Task>(`/tasks/${taskId}`)).data,
    enabled: open && !!taskId
  })
  const { data: auditEvents = [] } = useQuery({
    queryKey: ["audit-task", taskId],
    queryFn: async () => (await api.get<TaskAuditEvent[]>(`/audit-events/entity/Task/${taskId}`)).data,
    enabled: open && !!taskId,
    refetchOnMount: "always"
  })
  const { data: workNotes = [] } = useQuery({
    queryKey: ["work-notes-task", taskId],
    queryFn: async () => (await api.get<TaskComment[]>(`/comments/Task/${taskId}/work-notes`)).data,
    enabled: open && !!taskId
  })

  React.useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description ?? "")
    setStatus(task.status)
    setPriority(task.priority)
    setAssigneeId(task.assigneeId ?? "")
    setDueAt(task.dueAt ? task.dueAt.slice(0, 10) : "")
  }, [task])

  async function handleSave() {
    if (!task || !canManage) return
    setSaving(true)
    try {
      if (status !== task.status) {
        await onUpdateStatus(task.id, status)
      }
      await onPatchTask(task.id, {
        title,
        description: description || undefined,
        priority,
        assigneeId: assigneeId || null,
        dueAt: dueAt || null
      })
      await qc.invalidateQueries({ queryKey: ["task-detail", task.id] })
      await qc.invalidateQueries({ queryKey: ["audit-task", task.id] })
      await qc.invalidateQueries({ queryKey: ["tasks"] })
      notify.success("Task updated")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to save task changes")
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote() {
    if (!taskId || !newNote.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", { entityType: "Task", entityId: taskId, body: newNote.trim() })
      setNewNote("")
      await qc.invalidateQueries({ queryKey: ["work-notes-task", taskId] })
      notify.success("Note added")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to add note")
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
          pt: { xs: 1.5, md: 3 }
        }
      }}
      PaperProps={{
        sx: {
          maxHeight: { xs: "88vh", md: "80vh" },
          display: "flex",
          flexDirection: "column"
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>
              {task?.reference ?? "Task"}
            </Typography>
            {task ? <StatusPill value={task.status} label={STATUS_LABELS[task.status] ?? task.status} /> : null}
            {task ? <PriorityCell priority={task.priority} label={capitalize(task.priority)} /> : null}
          </Stack>
          {taskId ? (
            <Button size="small" onClick={() => onOpenFull(taskId)}>
              Open full task
            </Button>
          ) : null}
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1, pb: 1.5 }}>
        <Box>
          <Tabs value={activeTab} onChange={(_event: React.SyntheticEvent, v: string) => setActiveTab(v as "details" | "work-notes" | "history")} sx={{ minHeight: 38 }}>
            <Tab value="details" label="Details" sx={{ minHeight: 38 }} />
            <Tab value="work-notes" label={`Work notes (${workNotes.length})`} sx={{ minHeight: 38 }} />
            <Tab value="history" label={`History (${auditEvents.length})`} sx={{ minHeight: 38 }} />
          </Tabs>
        </Box>

        <Box sx={{ maxHeight: { xs: "48vh", md: "44vh" }, overflowY: "auto", pr: 0.5, pt: 0.5 }}>
          {activeTab === "details" ? (
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
              <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={3} fullWidth />
              <Stack direction="row" spacing={1.5}>
                <TextField
                  select
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  fullWidth
                  disabled={!canManage}
                >
                  {ALL_STATUSES.map((s) => <MenuItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</MenuItem>)}
                </TextField>
                <TextField
                  select
                  label="Priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  fullWidth
                  disabled={!canManage}
                >
                  {ALL_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{capitalize(p)}</MenuItem>)}
                </TextField>
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  select
                  label="Assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  fullWidth
                  disabled={!canManage}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>)}
                </TextField>
                <TextField
                  type="date"
                  label="Due date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  disabled={!canManage}
                />
              </Stack>
              {task?.linkedEntityType ? (
                <Typography variant="caption" color="text.secondary">
                  Linked to: {linkedLabel(task)}
                </Typography>
              ) : null}
            </Stack>
          ) : null}

          {activeTab === "work-notes" ? (
            <Stack spacing={1.5}>
              {canManage ? (
                <Stack spacing={1}>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Add work note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
                  <Stack direction="row" justifyContent="flex-end">
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleAddNote}
                      disabled={savingNote || !newNote.trim()}
                    >
                      Add note
                    </Button>
                  </Stack>
                </Stack>
              ) : null}
              {(workNotes ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No work notes yet.</Typography>
              ) : (
                // Render via the shared ActivityFeedItem so the drawer's notes get the
                // same rich body + reply threads (Reply affordance opens the rich
                // composer inline; replies collapse beyond 3) as the detail pages. The
                // drawer keeps its own plain top-level add-note box above.
                (workNotes ?? [])
                  .map<FeedEvent>((note) => ({
                    id: `note-${note.id}`,
                    type: "comment",
                    actor: note.author.displayName,
                    text: null,
                    note: note.body,
                    bodyJson: note.bodyJson,
                    mentions: note.mentions,
                    time: formatDateTime(note.createdAt) ?? "",
                    createdAt: note.createdAt,
                    commentId: note.id,
                    entityId: taskId ?? undefined,
                    replies: (note.replies ?? []).map((r) => ({
                      id: r.id,
                      actor: r.author.displayName,
                      note: r.body,
                      bodyJson: r.bodyJson,
                      mentions: r.mentions,
                      time: formatDateTime(r.createdAt) ?? "",
                    })),
                  }))
                  .reverse()
                  .map((event, idx, arr) => (
                    <ActivityFeedItem key={event.id} event={event} isLast={idx === arr.length - 1} />
                  ))
              )}
            </Stack>
          ) : null}

          {activeTab === "history" ? (
            <Stack spacing={1}>
              {(auditEvents ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No history yet.</Typography>
              ) : (
                (auditEvents ?? []).map(event => (
                  <Box key={event.id} sx={{ border: "1px solid #e2e8f0", borderRadius: 1.5, p: 1.25 }}>
                    <Typography variant="caption" sx={{ color: "#64748b" }}>
                      {event.action.toLowerCase().replaceAll("_", " ")} · {event.actorDisplayName ?? "system"} · {new Date(event.createdAt).toLocaleString("en-GB")}
                    </Typography>
                    {event.data ? (
                      <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "#475569" }}>
                        {JSON.stringify(event.data)}
                      </Typography>
                    ) : null}
                  </Box>
                ))
              )}
            </Stack>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions sx={{ pt: 1, pb: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
        {canManage ? (
          <Button variant="contained" onClick={handleSave} disabled={saving || !task}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function TasksPage() {
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const currentUser = getCurrentUser()

  const [viewMode, setViewMode] = React.useState<"list" | "board">(() => {
    try { return (localStorage.getItem("ad-tasks-view") as "list" | "board") ?? "list" } catch { return "list" }
  })
  const [visibleColumns, setVisibleColumns] = React.useState<ListColumnId[]>(() => {
    try {
      const raw = localStorage.getItem(TASK_LIST_COLUMNS_STORAGE_KEY)
      if (!raw) return DEFAULT_VISIBLE_COLUMNS
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS
      const allowed = new Set<ListColumnId>(LIST_COLUMNS.map((c) => c.id))
      const cleaned = parsed.filter((id): id is ListColumnId => typeof id === "string" && allowed.has(id as ListColumnId))
      const always = LIST_COLUMNS.filter((c) => c.alwaysVisible).map((c) => c.id)
      const merged = Array.from(new Set<ListColumnId>([...always, ...cleaned]))
      return merged.length > 0 ? merged : DEFAULT_VISIBLE_COLUMNS
    } catch {
      return DEFAULT_VISIBLE_COLUMNS
    }
  })
  const [columnsAnchor, setColumnsAnchor] = React.useState<HTMLElement | null>(null)

  // Active filter chips — multi-select
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
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)
  const [activeDragTaskId, setActiveDragTaskId] = React.useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data
  })
  // Assignee picker source (popovers, inline-create row, filter avatars,
  // quick-detail modal) — operational-callable & client-scoped, replacing the
  // admin-only GET /users that 403'd for operational roles.
  const { data: users = [] } = useAssignableUsers()

  const tasks = React.useMemo(() => data ?? [], [data])
  const tasksById = React.useMemo(() => {
    const m = new Map<string, Task>()
    tasks.forEach((t) => m.set(t.id, t))
    return m
  }, [tasks])
  const hasAnyFilter = filterStatuses.length > 0 || filterPriorities.length > 0 || filterAssignee || filterMine || filterOverdue
  const visibleSet = React.useMemo(() => new Set(visibleColumns), [visibleColumns])
  const visibleColumnDefs = React.useMemo(
    () => LIST_COLUMNS.filter((column) => visibleSet.has(column.id)),
    [visibleSet]
  )
  const tableMinWidth = React.useMemo(
    () => visibleColumnDefs.reduce((sum, col) => sum + col.minWidth, 0) + 70,
    [visibleColumnDefs]
  )
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function clearFilters() {
    setFilterStatuses([]); setFilterPriorities([]); setFilterAssignee(null)
    setFilterMine(false); setFilterOverdue(false)
  }

  function handleViewChange(v: "list" | "board") {
    setViewMode(v)
    try { localStorage.setItem("ad-tasks-view", v) } catch { return }
  }

  function toggleListColumn(columnId: ListColumnId) {
    const column = LIST_COLUMNS.find((c) => c.id === columnId)
    if (!column || column.alwaysVisible) return
    setVisibleColumns((prev) => {
      const next = prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
      try { localStorage.setItem(TASK_LIST_COLUMNS_STORAGE_KEY, JSON.stringify(next)) } catch { return next }
      return next
    })
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

  async function updateStatus(taskId: string, status: string, invalidate = true) {
    await api.post(`/tasks/${taskId}/status`, { status })
    if (invalidate) qc.invalidateQueries({ queryKey: ["tasks"] })
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

  function handleDragStart(event: DragStartEvent) {
    setActiveDragTaskId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const sourceId = String(event.active.id)
    setActiveDragTaskId(null)
    if (!canManage || !event.over) return

    const sourceTask = tasksById.get(sourceId)
    if (!sourceTask) return

    const overData = event.over.data.current as { status?: string } | undefined
    const targetStatusFromLane = overData?.status
    const overId = String(event.over.id)
    const targetStatusFromTask = tasksById.get(overId)?.status
    const targetStatus = targetStatusFromLane ?? targetStatusFromTask
    if (!targetStatus || targetStatus === sourceTask.status) return

    const snapshot = tasks
    qc.setQueryData<Task[]>(["tasks"], (prev = []) =>
      prev.map((t) => t.id === sourceTask.id ? { ...t, status: targetStatus } : t)
    )
    try {
      await updateStatus(sourceTask.id, targetStatus, false)
      qc.invalidateQueries({ queryKey: ["tasks"] })
      notify.success(`Task moved to ${STATUS_LABELS[targetStatus] ?? targetStatus}`)
    } catch (e: any) {
      qc.setQueryData(["tasks"], snapshot)
      notify.error(e?.message ?? "Failed to update task status")
    }
  }

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState title="Failed to load tasks" />

  return (
    <Box>

      {/* ── Filters ──────────────────────────────────────────────────── */}
      <Box sx={{ mb: "16px" }}>
        <Stack direction="row" alignItems="flex-start" flexWrap="wrap" sx={{ gap: "12px" }}>

          {/* Status group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", mb: "6px" }}>
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
          <Box sx={{ width: "1px", bgcolor: "var(--color-border-primary)", alignSelf: "stretch", mt: "18px" }} />

          {/* Priority group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", mb: "6px" }}>
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
          <Box sx={{ width: "1px", bgcolor: "var(--color-border-primary)", alignSelf: "stretch", mt: "18px" }} />

          {/* Quick filters group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", mb: "6px" }}>
              Quick filter
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              <Chip label="Mine" size="small" onClick={() => setFilterMine(m => !m)}
                sx={{
                  fontSize: 12, fontWeight: 500, cursor: "pointer", height: 26,
                  bgcolor: filterMine ? "#e8f1ff" : "#f1f5f9",
                  color: filterMine ? "primary.main" : "#64748b",
                  border: filterMine ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                  "&:hover": { bgcolor: "#e8f1ff", color: "primary.main", borderColor: "#93c5fd" }
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
          <Box sx={{ width: "1px", bgcolor: "var(--color-border-primary)", alignSelf: "stretch", mt: "18px" }} />

          {/* Assignee group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", mb: "6px" }}>
              Assignee
            </Typography>
            <Stack direction="row" spacing={0.75} flexWrap="wrap">
              {users.slice(0, 6).map(u => {
                const active = filterAssignee === u.id
                return (
                  <Tooltip key={u.id} title={u.displayName}>
                    <Box
                      onClick={() => setFilterAssignee(active ? null : u.id)}
                      sx={{
                        width: 28, height: 28, borderRadius: "50%", cursor: "pointer",
                        bgcolor: active ? "primary.main" : "#e8f1ff",
                        color: active ? "#fff" : "primary.main",
                        fontSize: 10, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "2px solid", borderColor: active ? "primary.main" : "transparent",
                        "&:hover": { borderColor: "primary.main" },
                        transition: "all 0.12s"
                      }}
                    >
                      {initials(u.displayName)}
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

          {/* Columns group */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", mb: "6px" }}>
              Columns
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ViewColumnIcon sx={{ fontSize: 13 }} />}
              onClick={(e) => setColumnsAnchor(e.currentTarget)}
              sx={{
                height: 26,
                fontSize: 11,
                fontWeight: 500,
                color: "#475569",
                borderColor: "#e2e8f0",
                px: "10px",
                minWidth: 0,
                "&:hover": { borderColor: "#cbd5e1", bgcolor: "#f8fafc" }
              }}
            >
              Manage
            </Button>
          </Box>

          {/* Divider */}
          <Box sx={{ width: "1px", bgcolor: "var(--color-border-primary)", alignSelf: "stretch", mt: "18px" }} />

          {/* View group — right aligned */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", mb: "6px" }}>
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
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                  <DroppableBoardColumn status={col.status}>
                    {colTasks.length === 0 ? (
                      <Box sx={{ minHeight: 80, border: "2px dashed #e2e8f0", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Typography variant="caption" color="text.secondary">No {col.label.toLowerCase()}</Typography>
                      </Box>
                    ) : colTasks.map(task => (
                      <DraggableTaskCard key={task.id} task={task} onOpen={setQuickTaskId} />
                    ))}
                  </DroppableBoardColumn>
                </Box>
              )
            })}
          </Box>
          <DragOverlay>
            {activeDragTaskId && tasksById.get(activeDragTaskId) ? (
              <Box sx={{ width: 280 }}>
                <TaskCardBody task={tasksById.get(activeDragTaskId)!} />
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
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
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table sx={{ minWidth: tableMinWidth, tableLayout: "auto" }}>
                <TableHead>
                  <TableRow sx={{ "& th": { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc", whiteSpace: "nowrap" } }}>
                    {visibleSet.has("title") ? <TableCell sx={{ pl: "16px", minWidth: LIST_COLUMNS.find(c => c.id === "title")?.minWidth }}>Title</TableCell> : null}
                    {visibleSet.has("ref") ? <TableCell sx={{ minWidth: LIST_COLUMNS.find(c => c.id === "ref")?.minWidth }}>Ref</TableCell> : null}
                    {visibleSet.has("status") ? <TableCell sx={{ minWidth: LIST_COLUMNS.find(c => c.id === "status")?.minWidth }}>Status</TableCell> : null}
                    {visibleSet.has("priority") ? <TableCell sx={{ minWidth: LIST_COLUMNS.find(c => c.id === "priority")?.minWidth }}>Priority</TableCell> : null}
                    {visibleSet.has("assignee") ? <TableCell sx={{ minWidth: LIST_COLUMNS.find(c => c.id === "assignee")?.minWidth }}>Assignee</TableCell> : null}
                    {visibleSet.has("due") ? <TableCell sx={{ minWidth: LIST_COLUMNS.find(c => c.id === "due")?.minWidth }}>Due</TableCell> : null}
                    {visibleSet.has("updated") ? <TableCell sx={{ minWidth: LIST_COLUMNS.find(c => c.id === "updated")?.minWidth }}>Updated</TableCell> : null}
                    <TableCell sx={{ minWidth: 70 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(task => {
                    const overdue = isOverdue(task.dueAt)
                    return (
                      <TableRow
                        key={task.id} hover
                        onClick={() => setQuickTaskId(task.id)}
                        sx={{
                          cursor: "pointer",
                          borderLeft: overdue && task.status !== "DONE" ? "3px solid #ef4444" : "3px solid transparent",
                          "&:hover .row-actions": { opacity: 1 },
                          "&:hover .editable-cell": { bgcolor: "#f8fafc", borderRadius: "4px" }
                        }}
                      >
                        {/* Title */}
                        {visibleSet.has("title") ? (
                          <TableCell sx={{ pl: "14px", maxWidth: 280 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: priorityDot(task.priority) }} />
                              <Typography variant="body2" fontWeight={600} sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {task.title}
                              </Typography>
                            </Stack>
                          </TableCell>
                        ) : null}

                        {/* Reference */}
                        {visibleSet.has("ref") ? (
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                            {task.reference}
                          </TableCell>
                        ) : null}

                        {/* Status — click to change */}
                        {visibleSet.has("status") ? (
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Box component="span"
                              onClick={canManage ? e => { e.stopPropagation(); setStatusAnchor({ el: e.currentTarget, task }) } : undefined}
                              sx={{ display: "inline-flex", cursor: canManage ? "pointer" : "default" }}>
                              <StatusPill value={task.status} label={STATUS_LABELS[task.status] ?? task.status}
                                trailing={canManage ? <KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6 }} /> : null} />
                            </Box>
                          </TableCell>
                        ) : null}

                        {/* Priority — click to change */}
                        {visibleSet.has("priority") ? (
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Box component="span"
                              onClick={canManage ? e => { e.stopPropagation(); setPriorityAnchor({ el: e.currentTarget, task }) } : undefined}
                              sx={{ display: "inline-flex", cursor: canManage ? "pointer" : "default" }}>
                              <PriorityCell priority={task.priority} label={capitalize(task.priority)}
                                trailing={canManage ? <KeyboardArrowDownIcon sx={{ fontSize: 11, opacity: 0.6, color: "#94a3b8" }} /> : null} />
                            </Box>
                          </TableCell>
                        ) : null}

                        {/* Assignee — click to change */}
                        {visibleSet.has("assignee") ? (
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Box
                              className="editable-cell"
                              onClick={canManage ? e => { e.stopPropagation(); setAssigneeAnchor({ el: e.currentTarget, task }) } : undefined}
                              sx={{ display: "inline-flex", alignItems: "center", cursor: canManage ? "pointer" : "default", px: "4px", py: "2px" }}
                            >
                              <AssigneeCell user={task.assignee} emptyLabel="—" />
                            </Box>
                          </TableCell>
                        ) : null}

                        {/* Due — click to change */}
                        {visibleSet.has("due") ? (
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
                        ) : null}

                        {/* Updated */}
                        {visibleSet.has("updated") ? (
                          <TableCell sx={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>
                            {formatDateTime(task.updatedAt)}
                          </TableCell>
                        ) : null}

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
                    <InlineCreateRow
                      users={users}
                      onCreate={createInline}
                      onCancel={() => setCreatingInline(false)}
                      visibleColumns={visibleColumnDefs.map((col) => col.id)}
                    />
                  ) : null}

                  {/* Footer row: count left, Add task right */}
                  <TableRow sx={{ bgcolor: "#f8fafc", "& td": { borderBottom: "none", py: "8px" } }}>
                    <TableCell colSpan={Math.max(1, visibleColumnDefs.length)} sx={{ pl: "16px" }}>
                      <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>
                        {filtered.length} task{filtered.length !== 1 ? "s" : ""}
                        {hasAnyFilter ? ` (filtered from ${tasks.length})` : ""}
                      </Typography>
                    </TableCell>
                    <TableCell colSpan={1} sx={{ textAlign: "right", pr: "12px" }}>
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
      <Popover
        open={Boolean(columnsAnchor)}
        anchorEl={columnsAnchor}
        onClose={() => setColumnsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{
          sx: {
            boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            minWidth: 220
          }
        }}
      >
        <Box sx={{ py: "6px" }}>
          <Typography sx={{
            px: "12px",
            py: "6px",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "#94a3b8"
          }}>
            Visible columns
          </Typography>
          {LIST_COLUMNS.map((column) => {
            const selected = visibleSet.has(column.id)
            return (
              <Box
                key={column.id}
                onClick={() => toggleListColumn(column.id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  px: "12px",
                  py: "8px",
                  cursor: column.alwaysVisible ? "default" : "pointer",
                  opacity: column.alwaysVisible ? 0.65 : 1,
                  "&:hover": column.alwaysVisible ? {} : { bgcolor: "#f8fafc" }
                }}
              >
                <Box sx={{ width: 14, display: "flex", justifyContent: "center", flexShrink: 0 }}>
                  {selected ? <CheckIcon sx={{ fontSize: 13, color: "primary.main" }} /> : null}
                </Box>
                <Typography sx={{ fontSize: 12.5, color: "#0f172a", flex: 1 }}>
                  {column.label}
                </Typography>
                {column.alwaysVisible ? (
                  <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Core
                  </Typography>
                ) : null}
              </Box>
            )
          })}
        </Box>
      </Popover>

      {/* Status */}
      {statusAnchor ? (
        <OptionPopover
          anchorEl={statusAnchor.el}
          onClose={() => setStatusAnchor(null)}
          current={statusAnchor.task.status}
          onSelect={s => updateStatus(statusAnchor.task.id, s)}
          headerLabel="Status"
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
          headerLabel="Priority"
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
          headerLabel="Assignee"
          onSelect={id => patchTask(assigneeAnchor.task.id, { assigneeId: id })}
        />
      ) : null}

      {/* Due date */}
      {dueAnchor ? (
        <DueDatePopover
          anchorEl={dueAnchor.el}
          onClose={() => setDueAnchor(null)}
          current={dueAnchor.task.dueAt}
          headerLabel="Due date"
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

      <TaskQuickDetailModal
        open={Boolean(quickTaskId)}
        taskId={quickTaskId}
        users={users}
        canManage={canManage}
        onClose={() => setQuickTaskId(null)}
        onOpenFull={(id) => { setQuickTaskId(null); navigate(`/tasks/${id}`) }}
        onPatchTask={patchTask}
        onUpdateStatus={(id, status) => updateStatus(id, status)}
      />
    </Box>
  )
}