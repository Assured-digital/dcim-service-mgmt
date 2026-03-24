import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Divider,
  MenuItem, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import LinkIcon from "@mui/icons-material/Link"
import LockIcon from "@mui/icons-material/Lock"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
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

type Comment = {
  id: string
  body: string
  type: string
  visibleToCustomer: boolean
  fromCustomer: boolean
  createdAt: string
  author: { id: string; email: string }
}

const STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "DONE", label: "Done" },
]

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

function LinkedRecordPanel({
  entityType, entityId, incident, taskReference, taskId
}: {
  entityType: string | null
  entityId: string | null
  incident: { id: string; reference: string; title: string } | null
  taskReference: string
  taskId: string
}) {
  const navigate = useNavigate()

  const path = entityPath(entityType, entityId)
  const label = entityLabel(entityType)

  const { data, isLoading } = useQuery({
    queryKey: ["linked-entity", entityType, entityId],
    queryFn: async () => {
      if (!entityType || !entityId) return null
      const paths: Record<string, string> = {
        ServiceRequest: `/service-requests/${entityId}`,
        Risk: `/risks/${entityId}`,
        Issue: `/issues/${entityId}`,
        Site: `/sites/${entityId}`,
        Survey: `/surveys/${entityId}`,
        Incident: `/incidents/${entityId}`
      }
      const endpoint = paths[entityType]
      if (!endpoint) return null
      return (await api.get(endpoint)).data
    },
    enabled: !!(entityType && entityId)
  })

  if (isLoading) return <LoadingState />

  const record = data as any

  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between"
          alignItems="flex-start" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block">
              {label ?? "Linked record"}
            </Typography>
            <Typography variant="h6" fontWeight={700}>
              {record?.subject ?? record?.title ?? record?.name ?? "—"}
            </Typography>
            {(record?.reference) ? (
              <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
                {record.reference}
              </Typography>
            ) : null}
          </Box>
          {path ? (
            <Button
              variant="contained"
              size="small"
              startIcon={<LinkIcon />}
              onClick={() => navigate(path, {
                state: { fromTask: taskId, fromTaskRef: taskReference }
              })}
            >
              Go to {label}
            </Button>
          ) : null}
        </Stack>

        <Stack spacing={1.5}>
          {record?.status ? (
            <Box>
              <Typography variant="caption" color="text.secondary">Status</Typography>
              <Box sx={{ mt: 0.5 }}>
                <Chip size="small" label={record.status.toLowerCase().replaceAll("_", " ")} />
              </Box>
            </Box>
          ) : null}
          {record?.description ? (
            <Box>
              <Typography variant="caption" color="text.secondary">Description</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                {record.description}
              </Typography>
            </Box>
          ) : null}
          {record?.priority ? (
            <Box>
              <Typography variant="caption" color="text.secondary">Priority</Typography>
              <Typography variant="body2">{record.priority}</Typography>
            </Box>
          ) : null}
          {record?.createdAt ? (
            <Box>
              <Typography variant="caption" color="text.secondary">Created</Typography>
              <Typography variant="body2">
                {new Date(record.createdAt).toLocaleDateString("en-GB")}
              </Typography>
            </Box>
          ) : null}
        </Stack>

        {incident && !entityType ? (
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              Linked incident
            </Typography>
            <Typography variant="body2" fontWeight={600}>{incident.reference}</Typography>
            <Typography variant="body2">{incident.title}</Typography>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const [tab, setTab] = React.useState<"details" | "linked" | "activity">("details")
  const [activityTab, setActivityTab] = React.useState(0)
  const [error, setError] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [savingStatus, setSavingStatus] = React.useState(false)
  const [savingWorkNote, setSavingWorkNote] = React.useState(false)
  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [statusComment, setStatusComment] = React.useState("")

  // Edit state
  const [editTitle, setEditTitle] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editPriority, setEditPriority] = React.useState("")
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [editDueAt, setEditDueAt] = React.useState("")
  const [editStatus, setEditStatus] = React.useState("")

  const { data: task, isLoading } = useQuery({
    queryKey: ["task-detail", id],
    queryFn: async () => (await api.get<Task>(`/tasks/${id}`)).data,
    enabled: !!id
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-task", id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/comments/Task/${id}/work-notes`)).data,
    enabled: !!id
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-task", id],
    queryFn: async () =>
      (await api.get<any[]>(`/audit-events/entity/Task/${id}`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (task) {
      setEditTitle(task.title)
      setEditDescription(task.description ?? "")
      setEditPriority(task.priority)
      setEditAssigneeId(task.assigneeId ?? "")
      setEditDueAt(task.dueAt?.slice(0, 10) ?? "")
      setEditStatus(task.status)
    }
  }, [task])

  async function handleSave() {
    if (!task) return
    setSaving(true)
    setError("")
    try {
      await api.put(`/tasks/${id}`, {
        title: editTitle,
        description: editDescription || undefined,
        priority: editPriority,
        assigneeId: editAssigneeId || undefined,
        dueAt: editDueAt || undefined
      })
      qc.invalidateQueries({ queryKey: ["task-detail", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusUpdate() {
    if (!task || editStatus === task.status) return
    setSavingStatus(true)
    setError("")
    try {
      await api.post(`/tasks/${id}/status`, {
        status: editStatus,
        comment: statusComment.trim() || undefined
      })
      setStatusComment("")
      qc.invalidateQueries({ queryKey: ["task-detail", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
      qc.invalidateQueries({ queryKey: ["audit-task", id] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status")
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleWorkNote() {
    if (!workNoteBody.trim()) return
    setSavingWorkNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Task",
        entityId: id,
        body: workNoteBody
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-task", id] })
    } finally {
      setSavingWorkNote(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!task) return <ErrorState title="Task not found" />

  const linkedPath = entityPath(task.linkedEntityType, task.linkedEntityId)
  const linkedLabel = entityLabel(task.linkedEntityType)
  const statusChanged = editStatus !== task.status

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/tasks")}
        sx={{ mb: 2, color: "text.secondary" }}
        size="small"
      >
        Back to tasks
      </Button>

      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
              {task.reference}
            </Typography>
            <Chip size="small" sx={statusChipSx(task.status)}
              label={task.status.toLowerCase().replace("_", " ")} />
            <Chip size="small" sx={priorityChipSx(task.priority)} label={task.priority} />
          </Stack>
          <Typography variant="h5" fontWeight={700}>{task.title}</Typography>
        </Box>

        {linkedPath ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<LinkIcon />}
            onClick={() => navigate(linkedPath)}
          >
            View {linkedLabel}
          </Button>
        ) : null}
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { md: "1fr 280px" }, gap: 3 }}>

        {/* Left */}
        <Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}
            sx={{ mb: 2, borderBottom: "1px solid #e2e8f0" }}>
            <Tab value="details" label="Details" />
            {task.linkedEntityType || task.incident ? (
              <Tab value="linked" label={`Linked — ${linkedLabel ?? "Incident"}`} />
            ) : null}
            <Tab value="activity" label="Activity" />
          </Tabs>

          {tab === "details" ? (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <TextField label="Title" value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    fullWidth disabled={!canManage} />
                  <TextField label="Description" value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    multiline rows={4} fullWidth disabled={!canManage} />
                  {canManage ? (
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button variant="contained" size="small"
                        onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save changes"}
                      </Button>
                    </Box>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {tab === "linked" && (task.linkedEntityType || task.incident) ? (
            <LinkedRecordPanel
              entityType={task.linkedEntityType}
              entityId={task.linkedEntityId}
              incident={task.incident}
              taskReference={task.reference}
              taskId={task.id}
            />
          ) : null}

          {tab === "activity" ? (
            <Card>
              <CardContent>
                <Tabs
                  value={activityTab}
                  onChange={(_, v) => setActivityTab(v)}
                  sx={{ mb: 2, borderBottom: "1px solid #e2e8f0" }}
                  textColor="inherit"
                  TabIndicatorProps={{ style: { backgroundColor: "#0f172a" } }}
                >
                  <Tab
                    label={
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <LockIcon sx={{ fontSize: 13 }} />
                        <span>Work notes ({workNotes?.length ?? 0})</span>
                      </Stack>
                    }
                    sx={{ fontSize: 12, minHeight: 40 }}
                  />
                  <Tab label="History" sx={{ fontSize: 12, minHeight: 40 }} />
                </Tabs>

                {activityTab === 0 ? (
                  <Stack spacing={2}>
                    {(workNotes ?? []).length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No work notes yet.
                      </Typography>
                    ) : (
                      (workNotes ?? []).map((c) => (
                        <Box key={c.id} sx={{
                          p: 1.5, borderRadius: 1.5,
                          border: "1px solid #e2e8f0", bgcolor: "#f8fafc"
                        }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                            <LockIcon sx={{ fontSize: 13, color: "#64748b" }} />
                            <Typography variant="caption" fontWeight={600} color="text.secondary">
                              {c.author.email}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(c.createdAt).toLocaleString("en-GB")}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                            {c.body}
                          </Typography>
                        </Box>
                      ))
                    )}
                    <Divider />
                    <TextField
                      fullWidth multiline rows={2}
                      value={workNoteBody}
                      onChange={(e) => setWorkNoteBody(e.target.value)}
                      placeholder="Add an internal work note..."
                      size="small"
                    />
                    <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                      <Button variant="contained" size="small"
                        onClick={handleWorkNote}
                        disabled={savingWorkNote || !workNoteBody.trim()}>
                        {savingWorkNote ? "Saving..." : "Add note"}
                      </Button>
                    </Box>
                  </Stack>
                ) : null}

                {activityTab === 1 ? (
                  <Stack spacing={1}>
                    {(auditEvents ?? []).length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No history yet.
                      </Typography>
                    ) : (
                      (auditEvents ?? []).map((event: any) => (
                        <Box key={event.id} sx={{
                          display: "flex", gap: 1.5, pb: 1.5,
                          borderBottom: "1px solid #f1f5f9"
                        }}>
                          <Box sx={{
                            width: 28, height: 28, borderRadius: "50%",
                            bgcolor: "#e8f1ff", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 700, color: "#1d4ed8", flexShrink: 0
                          }}>
                            {event.action.charAt(0)}
                          </Box>
                          <Box sx={{ pt: 0.25 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Chip size="small" label={event.action.toLowerCase().replaceAll("_", " ")} />
                              {event.actorEmail ? (
                                <Typography variant="caption" fontWeight={600}>
                                  {event.actorEmail}
                                </Typography>
                              ) : null}
                              <Typography variant="caption" color="text.secondary">
                                {new Date(event.createdAt).toLocaleString("en-GB")}
                              </Typography>
                            </Stack>
                          </Box>
                        </Box>
                      ))
                    )}
                  </Stack>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </Box>

        {/* Right panel */}
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                Properties
              </Typography>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Status</Typography>
                  <TextField select size="small" fullWidth value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    disabled={!canManage} sx={{ mt: 0.5 }}>
                    {STATUSES.map((s) => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </TextField>
                  {statusChanged ? (
                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <TextField
                        size="small" fullWidth multiline rows={2}
                        placeholder="Comment (optional)"
                        value={statusComment}
                        onChange={(e) => setStatusComment(e.target.value)}
                      />
                      <Button size="small" variant="contained"
                        onClick={handleStatusUpdate} disabled={savingStatus}>
                        {savingStatus ? "Updating..." : "Update status"}
                      </Button>
                    </Stack>
                  ) : null}
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <TextField select size="small" fullWidth value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    disabled={!canManage} sx={{ mt: 0.5 }}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                  </TextField>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">Assignee</Typography>
                  <TextField select size="small" fullWidth value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}
                    disabled={!canManage} sx={{ mt: 0.5 }}>
                    <MenuItem value="">Unassigned</MenuItem>
                    {(users ?? []).map((u) => (
                      <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>
                    ))}
                  </TextField>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">Due date</Typography>
                  <TextField type="date" size="small" fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={editDueAt}
                    onChange={(e) => setEditDueAt(e.target.value)}
                    disabled={!canManage} sx={{ mt: 0.5 }} />
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography variant="body2">
                    {new Date(task.createdAt).toLocaleDateString("en-GB")}
                  </Typography>
                </Box>
              </Stack>

              {canManage ? (
                <Button fullWidth variant="outlined" size="small"
                  onClick={handleSave} disabled={saving} sx={{ mt: 2 }}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </Box>
  )
}