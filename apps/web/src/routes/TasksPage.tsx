import React from "react"
import { useNavigate } from "react-router-dom"
import { api, type ApiError } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Tab, Tabs,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, ToggleButton, ToggleButtonGroup
} from "@mui/material"
import ViewKanbanIcon from "@mui/icons-material/ViewKanban"
import TableRowsIcon from "@mui/icons-material/TableRows"
import AddIcon from "@mui/icons-material/Add"
import CalendarTodayIcon from "@mui/icons-material/CalendarToday"
import LinkIcon from "@mui/icons-material/Link"
import { priorityChipSx, statusChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useQuery, useQueryClient } from "@tanstack/react-query"

type Task = {
  id: string
  reference: string
  title: string
  description: string | null
  status: string
  priority: string
  dueAt: string | null
  assigneeId: string | null
  assignee: { id: string; email: string } | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  incident: { id: string; reference: string; title: string } | null
  createdAt: string
  updatedAt: string
}

type User = { id: string; email: string }

const COLUMNS = [
  { status: "OPEN", label: "Open", color: "#e2e8f0", textColor: "#475569" },
  { status: "IN_PROGRESS", label: "In progress", color: "#dbeafe", textColor: "#1d4ed8" },
  { status: "BLOCKED", label: "Blocked", color: "#fee2e2", textColor: "#dc2626" },
  { status: "DONE", label: "Done", color: "#dcfce7", textColor: "#16a34a" },
]

function priorityDot(priority: string) {
  const colors: Record<string, string> = {
    low: "#94a3b8",
    medium: "#f59e0b",
    high: "#ef4444",
    critical: "#7c3aed"
  }
  return colors[priority.toLowerCase()] ?? "#94a3b8"
}

function getInitials(email: string) {
  return email.split("@")[0].slice(0, 2).toUpperCase()
}

function isOverdue(dueAt: string | null) {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

function entityLabel(type: string | null) {
  if (!type) return null
  const labels: Record<string, string> = {
    ServiceRequest: "SR",
    Risk: "Risk",
    Issue: "Issue",
    Site: "Site",
    Survey: "Survey",
    Incident: "Incident"
  }
  return labels[type] ?? type
}

function entityPath(type: string | null, id: string | null) {
  if (!type || !id) return null
  const paths: Record<string, string> = {
    ServiceRequest: `/service-requests/${id}`,
    Risk: `/risks/${id}`,
    Issue: `/issues/${id}`,
    Site: `/sites/${id}`,
    Survey: `/surveys/${id}`,
    Incident: `/incidents/${id}`
  }
  return paths[type] ?? null
}

function TaskCard({ task }: { task: Task }) {
  const navigate = useNavigate()
  const overdue = isOverdue(task.dueAt)
  const path = entityPath(task.linkedEntityType, task.linkedEntityId)

  return (
    <Card
      onClick={() => navigate(`/tasks/${task.id}`)}
      sx={{
        mb: 1, cursor: "pointer",
        border: "1px solid",
        borderColor: task.status === "BLOCKED" ? "#fecaca" : "#e2e8f0",
        "&:hover": { boxShadow: "0 2px 8px rgba(15,23,42,0.08)" },
        transition: "box-shadow 0.15s"
      }}
    >
      <CardContent sx={{ p: "12px !important" }}>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.5 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            bgcolor: priorityDot(task.priority), mt: 0.75
          }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{
              fontFamily: "monospace", color: "text.secondary", fontSize: 10, display: "block"
            }}>
              {task.reference}
            </Typography>
            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.4 }}>
              {task.title}
            </Typography>
          </Box>
        </Stack>

        {task.description ? (
          <Typography variant="caption" color="text.secondary" sx={{
            display: "-webkit-box", WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical", overflow: "hidden",
            mb: 1, lineHeight: 1.4
          }}>
            {task.description}
          </Typography>
        ) : null}

        <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ mb: 1 }}>
          {task.dueAt ? (
            <Chip size="small"
              icon={<CalendarTodayIcon sx={{ fontSize: "11px !important" }} />}
              label={new Date(task.dueAt).toLocaleDateString("en-GB")}
              sx={{
                fontSize: 11, height: 20,
                bgcolor: overdue ? "#fee2e2" : "#f1f5f9",
                color: overdue ? "#dc2626" : "#475569",
                fontWeight: overdue ? 700 : 400,
                "& .MuiChip-icon": { color: overdue ? "#dc2626" : "#94a3b8" }
              }}
            />
          ) : null}
          {task.linkedEntityType ? (
            <Chip size="small"
              icon={<LinkIcon sx={{ fontSize: "11px !important" }} />}
              label={entityLabel(task.linkedEntityType)}
              onClick={(e) => {
                e.stopPropagation()
                if (path) navigate(path)
              }}
              sx={{
                fontSize: 11, height: 20,
                bgcolor: "#f0f9ff", color: "#0369a1",
                cursor: path ? "pointer" : "default",
                "& .MuiChip-icon": { color: "#0369a1" }
              }}
            />
          ) : null}
        </Stack>

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          {task.assignee ? (
            <Box sx={{
              width: 24, height: 24, borderRadius: "50%",
              bgcolor: "#e0e7ff", display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#4338ca"
            }}>
              {getInitials(task.assignee.email)}
            </Box>
          ) : (
            <Box sx={{
              width: 24, height: 24, borderRadius: "50%",
              bgcolor: "#f1f5f9", border: "1px dashed #cbd5e1"
            }} />
          )}
          <Chip size="small"
            label={task.status.toLowerCase().replace("_", " ")}
            sx={statusChipSx(task.status)} />
        </Stack>
      </CardContent>
    </Card>
  )
}

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  linkedEntityType?: string
  linkedEntityId?: string
  linkedEntityLabel?: string
  onSuccess?: () => void
}

export function CreateTaskModal({
  open, onClose,
  linkedEntityType, linkedEntityId, linkedEntityLabel
}: CreateTaskModalProps) {
  const qc = useQueryClient()
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")
  const [dueAt, setDueAt] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true)
    setError("")
    try {
      await api.post("/tasks", {
        title,
        description: description || undefined,
        priority,
        dueAt: dueAt || undefined,
        assigneeId: assigneeId || undefined,
        linkedEntityType: linkedEntityType || undefined,
        linkedEntityId: linkedEntityId || undefined
      })
      setTitle(""); setDescription(""); setPriority("medium")
      setDueAt(""); setAssigneeId("")
      onClose()
      if (onSuccess) onSuccess()
      qc.invalidateQueries({ queryKey: ["tasks"] })
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Failed to create task")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create task</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {linkedEntityType ? (
            <Box sx={{
              p: 1.25, borderRadius: 1.5,
              bgcolor: "#f0f9ff", border: "1px solid #bae6fd"
            }}>
              <Typography variant="caption" color="#0369a1">
                Linked to: <strong>{linkedEntityLabel ?? linkedEntityType}</strong>
              </Typography>
            </Box>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="Title" value={title}
            onChange={(e) => setTitle(e.target.value)} fullWidth required />
          <TextField label="Description" value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline rows={3} fullWidth />
          <Stack direction="row" spacing={1.5}>
            <TextField select label="Priority" value={priority}
              onChange={(e) => setPriority(e.target.value)} fullWidth>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </TextField>
            <TextField label="Due date" type="date"
              InputLabelProps={{ shrink: true }} value={dueAt}
              onChange={(e) => setDueAt(e.target.value)} fullWidth />
          </Stack>
          <TextField select label="Assignee" value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)} fullWidth>
            <MenuItem value="">Unassigned</MenuItem>
            {(users ?? []).map((u) => (
              <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate}
          disabled={saving || !title.trim()}>
          {saving ? "Creating..." : "Create task"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function TasksPage() {
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = React.useState<"board" | "table">("table")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [filterStatus, setFilterStatus] = React.useState("OPEN")

  const { data, isLoading, error } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => (await api.get<Task[]>("/tasks")).data
  })

  const tasks = data ?? []

  const filteredTasks = filterStatus === "ALL"
    ? tasks
    : tasks.filter((t) => t.status === filterStatus)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState title="Failed to load tasks" />

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h4">Tasks</Typography>
          <Typography variant="body2" color="text.secondary">
            {tasks.length} task{tasks.length !== 1 ? "s" : ""} ·{" "}
            {tasks.filter((t) => t.status !== "DONE").length} open
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v)}
            size="small"
          >
            <ToggleButton value="board" sx={{ px: 1.5 }}>
              <ViewKanbanIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="table" sx={{ px: 1.5 }}>
              <TableRowsIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
          {canManage ? (
            <Button variant="contained" size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}>
              Create task
            </Button>
          ) : null}
        </Stack>
      </Stack>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks yet"
          detail="Tasks are created from triage, service requests, risks, issues and sites." />
      ) : null}

      {/* Board view */}
      {viewMode === "board" && tasks.length > 0 ? (
        <Box sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 2,
          alignItems: "start"
        }}>
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.status)
            return (
              <Box key={col.status}>
                <Stack direction="row" justifyContent="space-between"
                  alignItems="center" sx={{ mb: 1.5 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{
                      px: 1.25, py: 0.25, borderRadius: 10,
                      bgcolor: col.color
                    }}>
                      <Typography sx={{
                        fontSize: 12, fontWeight: 700,
                        color: col.textColor, lineHeight: 1.6
                      }}>
                        {col.label}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {colTasks.length}
                    </Typography>
                  </Stack>
                </Stack>

                {colTasks.length === 0 ? (
                  <Box sx={{
                    border: "1px dashed #e2e8f0",
                    borderRadius: 2, p: 2, textAlign: "center"
                  }}>
                    <Typography variant="caption" color="text.secondary">
                      No tasks
                    </Typography>
                  </Box>
                ) : (
                  colTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))
                )}
              </Box>
            )
          })}
        </Box>
      ) : null}

      {/* Table view */}
      {viewMode === "table" && tasks.length > 0 ? (
        <Card>
          <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2 }}>
            <Tabs value={filterStatus} onChange={(_, v) => setFilterStatus(v)}
              variant="scrollable" scrollButtons="auto" sx={{ minHeight: 44 }}>
              {[...COLUMNS.map((c) => ({
                value: c.status, label: c.label
              })), { value: "ALL", label: "All" }].map((tab) => {
                const count = tab.value === "ALL"
                  ? tasks.length
                  : tasks.filter((t) => t.status === tab.value).length
                return (
                  <Tab key={tab.value} value={tab.value}
                    sx={{ minHeight: 44, fontSize: 13 }}
                    label={
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <span>{tab.label}</span>
                        {(count > 0 && tab.value !== "ALL") ? (
                          <Box sx={{
                            bgcolor: filterStatus === tab.value ? "#1d4ed8" : "#e2e8f0",
                            color: filterStatus === tab.value ? "#fff" : "#475569",
                            borderRadius: 10, px: 0.75, py: 0.1,
                            fontSize: 11, fontWeight: 700, lineHeight: 1.6
                          }}>
                            {count}
                          </Box>
                        ) : null}
                      </Stack>
                  }
                  />
                )
              })}
            </Tabs>
          </Box>
          <CardContent>
            <TableContainer>
              <Table sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Assignee</TableCell>
                    <TableCell>Linked to</TableCell>
                    <TableCell>Due</TableCell>
                    <TableCell>Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTasks.map((task) => {
                    const overdue = isOverdue(task.dueAt)
                    return (
                      <TableRow
                        key={task.id}
                        hover
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box sx={{
                              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                              bgcolor: priorityDot(task.priority)
                            }} />
                            <Typography variant="body2" fontWeight={600}>
                              {task.title}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}>
                          {task.reference}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" sx={statusChipSx(task.status)}
                            label={task.status.toLowerCase().replace("_", " ")} />
                        </TableCell>
                        <TableCell>
                          <Chip size="small" sx={priorityChipSx(task.priority)}
                            label={task.priority} />
                        </TableCell>
                        <TableCell>
                          {task.assignee ? (
                            <Stack direction="row" spacing={0.75} alignItems="center">
                              <Box sx={{
                                width: 22, height: 22, borderRadius: "50%",
                                bgcolor: "#e0e7ff", display: "flex",
                                alignItems: "center", justifyContent: "center",
                                fontSize: 9, fontWeight: 700, color: "#4338ca", flexShrink: 0
                              }}>
                                {getInitials(task.assignee.email)}
                              </Box>
                              <Typography variant="caption">
                                {task.assignee.email.split("@")[0]}
                              </Typography>
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              Unassigned
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                        {task.linkedEntityType ? (
                          <Chip size="small"
                            label={entityLabel(task.linkedEntityType)}
                            onClick={(e) => {
                              e.stopPropagation()
                              const p = entityPath(task.linkedEntityType, task.linkedEntityId)
                              if (p) navigate(p)
                            }}
                            sx={{ bgcolor: "#f0f9ff", color: "#0369a1", fontSize: 11, cursor: "pointer" }} />
                          ) : task.incident ? (
                            <Chip size="small"
                              label={task.incident.reference}
                              sx={{ bgcolor: "#fef3c7", color: "#92400e", fontSize: 11 }} />
                          ) : (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption"
                            sx={{ color: overdue ? "#dc2626" : "text.secondary",
                              fontWeight: overdue ? 700 : 400 }}>
                            {task.dueAt
                              ? new Date(task.dueAt).toLocaleDateString("en-GB")
                              : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(task.updatedAt).toLocaleDateString("en-GB")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      ) : null}

      {/* Create task modal */}
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </Box>
  )
}