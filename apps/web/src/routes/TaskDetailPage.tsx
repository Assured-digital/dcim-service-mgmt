import React from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, MenuItem, Stack, Tab, Tabs,
  TextField, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import LockIcon from "@mui/icons-material/Lock"
import CheckIcon from "@mui/icons-material/Check"
import EditIcon from "@mui/icons-material/Edit"
import LinkIcon from "@mui/icons-material/Link"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

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

type AuditEvent = {
  id: string
  action: string
  actorUserId: string | null
  actorEmail?: string | null
  data: any
  createdAt: string
}

type Comment = {
  id: string
  body: string
  type: string
  createdAt: string
  author: { id: string; email: string }
}

const STATUS_FLOW: Record<string, string[]> = {
  OPEN: ["IN_PROGRESS", "BLOCKED", "DONE"],
  IN_PROGRESS: ["OPEN", "BLOCKED", "DONE"],
  BLOCKED: ["OPEN", "IN_PROGRESS", "DONE"],
  DONE: ["OPEN"]
}

const STATUS_ALL = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"]

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  OPEN: "Not yet started",
  IN_PROGRESS: "Actively being worked on",
  BLOCKED: "Waiting on dependency",
  DONE: "Completed"
}

function entityLabel(type: string | null) {
  if (!type) return null
  const labels: Record<string, string> = {
    ServiceRequest: "Service request",
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

function actionLabel(action: string, data: any): string {
  switch (action) {
    case "CREATED": return "Task created"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return `Task updated${data?.fields ? `: ${data.fields.join(", ")}` : ""}`
    default: return action.toLowerCase().replaceAll("_", " ")
  }
}

function actionColor(action: string): string {
  if (action === "CREATED") return "#e0e7ff"
  if (action === "STATUS_UPDATED") return "#e8f1ff"
  if (action === "UPDATED") return "#f0fdf4"
  return "#f1f5f9"
}

function actionTextColor(action: string): string {
  if (action === "CREATED") return "#4338ca"
  if (action === "STATUS_UPDATED") return "#1d4ed8"
  if (action === "UPDATED") return "#15803d"
  return "#475569"
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
        color: "var(--color-text-tertiary)", mb: 0.5
      }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}

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

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fromSR = location.state?.fromSR
  const fromSRRef = location.state?.fromSRRef
  const fromIssue = location.state?.fromIssue
  const fromIssueRef = location.state?.fromIssueRef
  const fromTask = location.state?.fromTask
  const fromTaskRef = location.state?.fromTaskRef
  const fromRisk = location.state?.fromRisk
  const fromRiskRef = location.state?.fromRiskRef
  const qc = useQueryClient()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const [error, setError] = React.useState("")
  const [activeTab, setActiveTab] = React.useState(0)

  // Transition dialog
  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)

  // Properties edit
  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editPriority, setEditPriority] = React.useState("")
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [editDueAt, setEditDueAt] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  // Work note
  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const { data: task, isLoading } = useQuery({
    queryKey: ["task-detail", id],
    queryFn: async () => (await api.get<Task>(`/tasks/${id}`)).data,
    enabled: !!id
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-task", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/Task/${id}`)).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-task", id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/comments/Task/${id}/work-notes`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (task) {
      setEditTitle(task.title)
      setEditDescription(task.description ?? "")
      setEditPriority(task.priority)
      setEditAssigneeId(task.assigneeId ?? "")
      setEditDueAt(task.dueAt?.slice(0, 10) ?? "")
    }
  }, [task])

  async function handleTransition() {
    if (!transitionTarget || !task) return
    setSavingTransition(true)
    setError("")
    try {
      await api.post(`/tasks/${id}/status`, {
        status: transitionTarget,
        comment: transitionComment.trim() || undefined
      })
      if (transitionComment.trim()) {
        await api.post("/comments/work-note", {
          entityType: "Task", entityId: id, body: transitionComment.trim()
        })
      }
      setTransitionTarget(null)
      setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["task-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-task", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-task", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status")
    } finally {
      setSavingTransition(false)
    }
  }

  async function handleSaveProperties() {
    setSavingProperties(true)
    setError("")
    try {
      await api.put(`/tasks/${id}`, {
        title: editTitle,
        description: editDescription || undefined,
        priority: editPriority,
        assigneeId: editAssigneeId || undefined,
        dueAt: editDueAt || undefined
      })
      setEditingProperties(false)
      qc.invalidateQueries({ queryKey: ["task-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-task", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally {
      setSavingProperties(false)
    }
  }

  async function handleAddNote() {
    if (!workNoteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Task", entityId: id, body: workNoteBody
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-task", id] })
    } finally {
      setSavingNote(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!task) return <ErrorState title="Task not found" />

  const nextStatuses = STATUS_FLOW[task.status] ?? []
  const currentIndex = STATUS_ALL.indexOf(task.status)
  const linkedPath = entityPath(task.linkedEntityType, task.linkedEntityId)
  const linkedLabel = entityLabel(task.linkedEntityType)
  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== "DONE"

  return (
    <Box>
      {/* Top bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => fromSR
              ? navigate(`/service-requests/${fromSR}`)
              : fromIssue
              ? navigate(`/issues/${fromIssue}`)
              : fromRisk
              ? navigate(`/risks/${fromRisk}`)
              : navigate("/tasks")
            }
            sx={{ color: "text.secondary" }} size="small"
          >
            {fromSR ? `Back to ${fromSRRef}`
              : fromIssue ? `Back to ${fromIssueRef}`
              : fromRisk ? `Back to ${fromRiskRef}`
              : "Back to tasks"}
          </Button>
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
              {task.reference}
            </Typography>
            <Box sx={{ width: 1, height: 14, bgcolor: "var(--color-border-tertiary)" }} />
            <Chip size="small" sx={statusChipSx(task.status)}
              label={STATUS_LABELS[task.status] ?? task.status} />
            <Chip size="small" sx={priorityChipSx(task.priority)} label={task.priority} />
          </Box>
        </Stack>
      </Stack>

      {/* Unified info container */}
      <Box sx={{
        bgcolor: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderTopLeftRadius: 8, borderTopRightRadius: 8,
        p: 2.5
      }}>

        {/* Dominant title */}
        <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.2, mb: 2 }}>
          {task.title}
        </Typography>

        <Divider sx={{ mb: 2 }} />

        {/* Description + linked record in same row */}
        <Box sx={{
          display: "grid",
          gridTemplateColumns: task.linkedEntityType || task.incident
            ? "1fr auto" : "1fr",
          gap: 3, alignItems: "start"
        }}>
          <InfoField label="DESCRIPTION">
            <Typography variant="body2" color="text.secondary"
              sx={{ whiteSpace: "pre-wrap" }}>
              {task.description ?? "No description provided."}
            </Typography>
          </InfoField>

          {task.linkedEntityType || task.incident ? (
            <InfoField label="LINKED TO">
              <Button
                size="small" variant="outlined"
                startIcon={<LinkIcon sx={{ fontSize: 13 }} />}
                onClick={() => linkedPath && navigate(linkedPath, {
                  state: { fromTask: task.id, fromTaskRef: task.reference }
                })}
                sx={{ mt: 0.25 }}
              >
                {linkedLabel ?? `Incident ${task.incident?.reference}`}
              </Button>
            </InfoField>
          ) : null}
        </Box>
      </Box>

      {/* Workflow strip */}
      <Box sx={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderTop: "none",
        borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
        bgcolor: "var(--color-background-primary)",
        px: 2.5, py: 2, mb: 3
      }}>
        <Typography sx={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
          color: "var(--color-text-tertiary)", display: "block", mb: 1.5
        }}>
          STATUS — click a stage to transition
        </Typography>
        <Stack direction="row" spacing={0} alignItems="stretch">
          {STATUS_ALL.map((status, idx) => {
            const isCurrent = status === task.status
            const isPast = idx < currentIndex
            const isNext = nextStatuses.includes(status) && canManage
            return (
              <React.Fragment key={status}>
                <Box
                  onClick={isNext ? () => setTransitionTarget(status) : undefined}
                  sx={{
                    flex: 1, px: 1.5, py: 1.25, borderRadius: 1.5,
                    cursor: isNext ? "pointer" : "default",
                    bgcolor: isCurrent
                      ? status === "BLOCKED" ? "#7f1d1d" : "#0f172a"
                      : isPast ? "#f1f5f9"
                      : isNext ? "#eff6ff"
                      : "transparent",
                    border: "1px solid",
                    borderColor: isCurrent
                      ? status === "BLOCKED" ? "#7f1d1d" : "#0f172a"
                      : isPast ? "var(--color-border-tertiary)"
                      : isNext ? "#bfdbfe"
                      : "transparent",
                    transition: "all 0.15s",
                    "&:hover": isNext ? { bgcolor: "#dbeafe", borderColor: "#93c5fd" } : {}
                  }}
                >
                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                    {isCurrent ? (
                      <Box sx={{
                        width: 16, height: 16, borderRadius: "50%", bgcolor: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                      }}>
                        <CheckIcon sx={{ fontSize: 11, color: "#0f172a" }} />
                      </Box>
                    ) : isPast ? (
                      <Box sx={{
                        width: 16, height: 16, borderRadius: "50%", bgcolor: "#cbd5e1",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                      }}>
                        <CheckIcon sx={{ fontSize: 11, color: "#fff" }} />
                      </Box>
                    ) : (
                      <Box sx={{
                        width: 16, height: 16, borderRadius: "50%",
                        border: isNext ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                        flexShrink: 0
                      }} />
                    )}
                    <Typography sx={{
                      fontSize: 12, fontWeight: isCurrent ? 700 : 500,
                      color: isCurrent ? "#fff"
                        : isPast ? "#94a3b8"
                        : isNext ? "#1d4ed8"
                        : "var(--color-text-tertiary)"
                    }}>
                      {STATUS_LABELS[status]}
                    </Typography>
                    {isNext ? (
                      <Typography sx={{ fontSize: 10, color: "#3b82f6", ml: "auto" }}>
                        click →
                      </Typography>
                    ) : null}
                  </Stack>
                  <Typography sx={{
                    fontSize: 10,
                    color: isCurrent ? "rgba(255,255,255,0.6)" : "var(--color-text-tertiary)",
                    lineHeight: 1.3
                  }}>
                    {STATUS_DESCRIPTIONS[status]}
                  </Typography>
                </Box>
                {idx < STATUS_ALL.length - 1 ? (
                  <Box sx={{
                    width: 20, display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0
                  }}>
                    <Box sx={{ width: 12, height: 1, bgcolor: "var(--color-border-tertiary)" }} />
                  </Box>
                ) : null}
              </React.Fragment>
            )
          })}
        </Stack>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 260px" },
        gap: 3, alignItems: "start"
      }}>

        {/* Left — tabbed card */}
        <Card sx={{ alignSelf: "start" }}>
          <Box sx={{ borderBottom: "1px solid #e2e8f0" }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{ px: 2, minHeight: 44 }}
              textColor="inherit"
              TabIndicatorProps={{ style: { backgroundColor: "#0f172a" } }}
            >
              <Tab label="Work notes"
                icon={<Badge count={(workNotes ?? []).length} />}
                iconPosition="end"
                sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="History"
                icon={<Badge count={(auditEvents ?? []).length} />}
                iconPosition="end"
                sx={{ fontSize: 13, minHeight: 44 }} />
            </Tabs>
          </Box>
          <CardContent>

            {/* Work notes tab */}
            {activeTab === 0 ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <TextField fullWidth multiline rows={2} size="small"
                    value={workNoteBody}
                    onChange={(e) => setWorkNoteBody(e.target.value)}
                    placeholder="Add a work note..." />
                  <Button variant="contained" size="small"
                    onClick={handleAddNote}
                    disabled={savingNote || !workNoteBody.trim()}
                    sx={{ alignSelf: "flex-end", whiteSpace: "nowrap" }}>
                    Add note
                  </Button>
                </Stack>
                <Divider />
                {(workNotes ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No work notes yet.
                  </Typography>
                ) : (
                  <Stack spacing={0}>
                    {(workNotes ?? []).slice().reverse().map((note, i, arr) => (
                      <Box key={note.id} sx={{
                        display: "flex", gap: 1.5, pb: 2,
                        position: "relative",
                        "&:before": i < arr.length - 1 ? {
                          content: '""', position: "absolute",
                          left: 13, top: 28, bottom: 0,
                          width: "1px", bgcolor: "var(--color-border-tertiary)"
                        } : {}
                      }}>
                        <Box sx={{
                          width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                          bgcolor: "#f1f5f9", display: "flex",
                          alignItems: "center", justifyContent: "center", zIndex: 1
                        }}>
                          <LockIcon sx={{ fontSize: 13, color: "#64748b" }} />
                        </Box>
                        <Box sx={{ pt: 0.25, flex: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography variant="caption" fontWeight={600}>Work note</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {note.author.email}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(note.createdAt).toLocaleString("en-GB")}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary"
                            sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                            {note.body}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Stack>
            ) : null}

            {/* History tab */}
            {activeTab === 1 ? (
              <Stack spacing={0}>
                {(auditEvents ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No history yet.</Typography>
                ) : (
                  (auditEvents ?? []).map((event, i) => (
                    <Box key={event.id} sx={{
                      display: "flex", gap: 1.5, pb: 2,
                      position: "relative",
                      "&:before": i < (auditEvents ?? []).length - 1 ? {
                        content: '""', position: "absolute",
                        left: 13, top: 28, bottom: 0,
                        width: "1px", bgcolor: "var(--color-border-tertiary)"
                      } : {}
                    }}>
                      <Box sx={{
                        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                        bgcolor: actionColor(event.action),
                        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1
                      }}>
                        <Typography sx={{
                          fontSize: 10, fontWeight: 700,
                          color: actionTextColor(event.action)
                        }}>
                          {event.action.charAt(0)}
                        </Typography>
                      </Box>
                      <Box sx={{ pt: 0.25, flex: 1 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography variant="caption" fontWeight={600}>
                            {actionLabel(event.action, event.data)}
                          </Typography>
                          {event.actorEmail ? (
                            <Typography variant="caption" color="text.secondary">
                              {event.actorEmail}
                            </Typography>
                          ) : null}
                          <Typography variant="caption" color="text.secondary">
                            {new Date(event.createdAt).toLocaleString("en-GB")}
                          </Typography>
                        </Stack>
                        {event.data && event.action === "STATUS_UPDATED" ? (
                          <Typography variant="caption" color="text.secondary"
                            sx={{ display: "block", mt: 0.25 }}>
                            {event.data.from} → {event.data.to}
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>
                  ))
                )}
              </Stack>
            ) : null}
          </CardContent>
        </Card>

        {/* Right column */}
        <Stack spacing={2} sx={{ alignSelf: "start" }}>

          {/* Properties */}
          <Card>
            <CardContent sx={{ pb: "12px !important" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  color: "var(--color-text-tertiary)"
                }}>
                  PROPERTIES
                </Typography>
                {canManage && !editingProperties && task.status !== "DONE" ? (
                  <Button size="small" startIcon={<EditIcon sx={{ fontSize: 13 }} />}
                    onClick={() => setEditingProperties(true)}>
                    Edit
                  </Button>
                ) : null}
              </Stack>

              {editingProperties ? (
                <Stack spacing={1.5}>
                  <TextField size="small" label="Title" fullWidth
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)} />
                  <TextField size="small" label="Description" fullWidth multiline rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)} />
                  <TextField select size="small" label="Priority" fullWidth
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                  </TextField>
                  <TextField select size="small" label="Assignee" fullWidth
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}>
                    <MenuItem value="">Unassigned</MenuItem>
                    {(users ?? []).map((u) => (
                      <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>
                    ))}
                  </TextField>
                  <TextField type="date" size="small" label="Due date" fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={editDueAt}
                    onChange={(e) => setEditDueAt(e.target.value)} />
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" onClick={() => {
                      setEditingProperties(false)
                      setEditTitle(task.title)
                      setEditDescription(task.description ?? "")
                      setEditPriority(task.priority)
                      setEditAssigneeId(task.assigneeId ?? "")
                      setEditDueAt(task.dueAt?.slice(0, 10) ?? "")
                    }}>Cancel</Button>
                    <Button size="small" variant="contained"
                      onClick={handleSaveProperties} disabled={savingProperties}>
                      {savingProperties ? "Saving..." : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              ) : (
                <Stack spacing={0} divider={<Divider />}>
                  {[
                    {
                      label: "Priority",
                      value: <Chip size="small" sx={priorityChipSx(task.priority)}
                        label={task.priority} />
                    },
                    {
                      label: "Assignee",
                      value: <Typography variant="caption">
                        {task.assignee?.email.split("@")[0] ?? "Unassigned"}
                      </Typography>
                    },
                    task.dueAt ? {
                      label: "Due date",
                      value: <Typography variant="caption"
                        sx={{ color: isOverdue ? "#b91c1c" : "inherit", fontWeight: isOverdue ? 700 : 400 }}>
                        {new Date(task.dueAt).toLocaleDateString("en-GB")}
                      </Typography>
                    } : null,
                    task.linkedEntityType ? {
                      label: "Linked to",
                      value: <Typography variant="caption">
                        {linkedLabel}
                      </Typography>
                    } : null,
                    {
                      label: "Created",
                      value: <Typography variant="caption">
                        {new Date(task.createdAt).toLocaleDateString("en-GB")}
                      </Typography>
                    }
                  ].filter(Boolean).map((row: any) => (
                    <Stack key={row.label} direction="row" justifyContent="space-between"
                      alignItems="center" sx={{ py: 0.75 }}>
                      <Typography variant="caption" color="text.secondary"
                        sx={{ flexShrink: 0, mr: 1 }}>
                        {row.label}
                      </Typography>
                      {row.value}
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>
        </Stack>
      </Box>

      {/* Transition dialog */}
      <Dialog open={!!transitionTarget} onClose={() => setTransitionTarget(null)}
        maxWidth="xs" fullWidth>
        <DialogTitle>
          Move to {STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              This will update the task status to{" "}
              <strong>{STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</strong>.
            </Typography>
            {transitionTarget === "BLOCKED" ? (
              <Box sx={{
                p: 1.25, borderRadius: 1.5,
                bgcolor: "#fef2f2", border: "1px solid #fecaca"
              }}>
                <Typography variant="caption" color="#b91c1c">
                  Add a note explaining what is blocking this task.
                </Typography>
              </Box>
            ) : null}
            <TextField label="Comment (optional)" multiline rows={2} fullWidth
              value={transitionComment}
              onChange={(e) => setTransitionComment(e.target.value)}
              placeholder="Add context for this transition..." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransitionTarget(null)}>Cancel</Button>
          <Button variant="contained"
            disabled={savingTransition}
            color={transitionTarget === "BLOCKED" ? "error" : "primary"}
            onClick={handleTransition}>
            {savingTransition ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}