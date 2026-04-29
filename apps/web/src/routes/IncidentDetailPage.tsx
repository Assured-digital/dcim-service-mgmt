import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, Menu, MenuItem, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import LockIcon from "@mui/icons-material/Lock"
import MoreHorizIcon from "@mui/icons-material/MoreHoriz"
import {
  Badge, InfoField, LinkedEntitiesPanel, PropertiesPanel, SectionHeader, WorkflowStrip,
  chipSx, statusSelectSx, type LinkedTask
} from "../components/shared"
import { TicketHeaderCard, primaryTransition } from "../components/ticket-detail/TicketHeaderCard"
import { ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { CreateTaskModal, TaskQuickDetailModal } from "./TasksPage"

type Incident = {
  id: string
  reference: string
  title: string
  description: string
  status: string
  severity: string
  priority: string
  assigneeId: string | null
  assignee: { id: string; email: string } | null
  createdAt: string
  updatedAt: string
}

type AuditEvent = {
  id: string
  action: string
  actorUserId: string | null
  actorEmail?: string | null
  data?: { from?: string; to?: string; fields?: string[] } | null
  createdAt: string
}

type IncidentComment = {
  id: string
  body: string
  type: string
  createdAt: string
  author: { id: string; email: string }
}

type User = { id: string; email: string }
type IncidentPropertyRow = { label: string; value: React.ReactNode }

const STATUS_FLOW: Record<string, string[]> = {
  NEW: ["INVESTIGATING", "CLOSED"],
  INVESTIGATING: ["MITIGATED", "RESOLVED", "CLOSED"],
  MITIGATED: ["INVESTIGATING", "RESOLVED", "CLOSED"],
  RESOLVED: ["CLOSED"],
  CLOSED: []
}

const STATUS_ALL = ["NEW", "INVESTIGATING", "MITIGATED", "RESOLVED", "CLOSED"]

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  INVESTIGATING: "Investigating",
  MITIGATED: "Mitigated",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  NEW: "Raised and awaiting triage",
  INVESTIGATING: "Root cause analysis in progress",
  MITIGATED: "Immediate mitigation applied",
  RESOLVED: "Root cause addressed",
  CLOSED: "Confirmed and closed"
}

function actionLabel(action: string, data?: { from?: string; to?: string; fields?: string[] } | null): string {
  switch (action) {
    case "CREATED": return "Incident logged"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return `Incident updated${data?.fields ? `: ${data.fields.join(", ")}` : ""}`
    default: return action.toLowerCase().replaceAll("_", " ")
  }
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message)) return message.join(", ")
  }
  return fallback
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

function severitySx(severity: string) {
  if (severity === "CRITICAL") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: 11 }
  if (severity === "HIGH") return { bgcolor: "#ffedd5", color: "#c2410c", fontWeight: 700, fontSize: 11 }
  if (severity === "MEDIUM") return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 700, fontSize: 11 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 700, fontSize: 11 }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export default function IncidentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState(0)
  const [moreAnchor, setMoreAnchor] = React.useState<null | HTMLElement>(null)

  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)

  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editTitle, setEditTitle] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editSeverity, setEditSeverity] = React.useState("MEDIUM")
  const [editPriority, setEditPriority] = React.useState("medium")
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident-detail", id],
    queryFn: async () => (await api.get<Incident>(`/incidents/${id}`)).data,
    enabled: !!id
  })

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-incident", id],
    queryFn: async () =>
      (await api.get<LinkedTask[]>("/tasks", {
        params: { linkedEntityType: "Incident", linkedEntityId: id }
      })).data,
    enabled: !!id
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-incident", id],
    queryFn: async () => (await api.get<AuditEvent[]>(`/audit-events/entity/Incident/${id}`)).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-incident", id],
    queryFn: async () => (await api.get<IncidentComment[]>(`/comments/Incident/${id}/work-notes`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (incident) {
      setEditTitle(incident.title)
      setEditDescription(incident.description)
      setEditSeverity(incident.severity)
      setEditPriority(incident.priority)
      setEditAssigneeId(incident.assigneeId ?? "")
    }
  }, [incident])

  React.useEffect(() => { if (incident) setRecordLabel(incident.reference) }, [incident]) // eslint-disable-line
  if (isLoading) return <LoadingState />
  if (!incident) return <ErrorState title="Incident not found" />

  async function handleTransition() {
    if (!transitionTarget || !incident) return
    setSavingTransition(true)
    setError("")
    try {
      await api.post(`/incidents/${id}/status`, {
        status: transitionTarget,
        comment: transitionComment.trim() || undefined
      })
      if (transitionComment.trim()) {
        await api.post("/comments/work-note", {
          entityType: "Incident",
          entityId: id,
          body: transitionComment.trim()
        })
      }
      setTransitionTarget(null)
      setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["incident-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-incident", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-incident", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to update status"))
    } finally {
      setSavingTransition(false)
    }
  }

  async function handleSaveProperties() {
    setSavingProperties(true)
    setError("")
    try {
      await api.put(`/incidents/${id}`, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        severity: editSeverity,
        priority: editPriority,
        assigneeId: editAssigneeId || ""
      })
      setEditingProperties(false)
      qc.invalidateQueries({ queryKey: ["incident-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-incident", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to save incident properties"))
    } finally {
      setSavingProperties(false)
    }
  }

  async function handleAddNote() {
    if (!workNoteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Incident",
        entityId: id,
        body: workNoteBody.trim()
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-incident", id] })
      qc.invalidateQueries({ queryKey: ["audit-incident", id] })
    } finally {
      setSavingNote(false)
    }
  }

  async function patchLinkedTask(taskId: string, patch: Record<string, any>) {
    await api.put(`/tasks/${taskId}`, patch)
    qc.invalidateQueries({ queryKey: ["linked-tasks-incident", id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  async function updateLinkedTaskStatus(taskId: string, status: string) {
    await api.post(`/tasks/${taskId}/status`, { status })
    qc.invalidateQueries({ queryKey: ["linked-tasks-incident", id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  const nextStatuses = STATUS_FLOW[incident.status] ?? []
  const propertyRows: IncidentPropertyRow[] = [
    { label: "Severity", value: <Chip size="small" sx={severitySx(incident.severity)} label={incident.severity} /> },
    { label: "Priority", value: <Chip size="small" sx={chipSx(incident.priority)} label={capitalize(incident.priority)} /> },
    { label: "Assignee", value: <Typography variant="caption">{incident.assignee?.email ?? "Unassigned"}</Typography> },
    { label: "Logged", value: <Typography variant="caption">{new Date(incident.createdAt).toLocaleDateString("en-GB")}</Typography> },
    { label: "Updated", value: <Typography variant="caption">{new Date(incident.updatedAt).toLocaleDateString("en-GB")}</Typography> }
  ]

  const primary = primaryTransition("INC", incident.status)
  const secondaryTransitions = nextStatuses.filter(s => s !== primary?.target)

  const headerActions = canManage ? (
    <>
      {secondaryTransitions.length > 0 ? (
        <>
          <IconButton
            size="small"
            onClick={(e) => setMoreAnchor(e.currentTarget)}
            sx={{ border: "1px solid #e2e8f0", borderRadius: 1, width: 32, height: 32 }}
            aria-label="More status transitions"
          >
            <MoreHorizIcon sx={{ fontSize: 18, color: "#475569" }} />
          </IconButton>
          <Menu anchorEl={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
            {secondaryTransitions.map(s => (
              <MenuItem key={s} dense onClick={() => { setTransitionTarget(s); setMoreAnchor(null) }}>
                {STATUS_LABELS[s] ?? s}
              </MenuItem>
            ))}
          </Menu>
        </>
      ) : null}
      {primary ? (
        <Button size="small" variant="contained"
          onClick={() => setTransitionTarget(primary.target)}
          sx={{ fontSize: 12 }}
        >
          {primary.label}
        </Button>
      ) : null}
    </>
  ) : null

  const metaParts: React.ReactNode[] = [
    <>Severity <strong style={{ color: "#b91c1c" }}>{incident.severity}</strong></>,
    <>opened {new Date(incident.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>,
    incident.assignee ? `assigned to ${incident.assignee.email.split("@")[0]}` : "Unassigned",
  ]

  return (
    <Box>
      <TicketHeaderCard
        kind="INC"
        reference={incident.reference}
        status={incident.status}
        statusLabel={STATUS_LABELS[incident.status] ?? incident.status}
        priority={incident.priority}
        title={incident.title}
        actions={headerActions}
        meta={metaParts.map((m, i) => (
          <React.Fragment key={i}>{i > 0 ? <span style={{ color: "#cbd5e1", margin: "0 6px" }}>·</span> : null}{m}</React.Fragment>
        ))}
        workflow={
          <WorkflowStrip
            stages={STATUS_ALL.map((status) => ({
              id: status,
              label: STATUS_LABELS[status],
              description: STATUS_DESCRIPTIONS[status]
            }))}
            currentStage={incident.status}
            mb={0}
            specialStageColors={{ MITIGATED: "#14532d", RESOLVED: "#14532d", CLOSED: "#14532d" }}
          />
        }
        description={incident.description}
      />

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 280px" },
        gap: 3, alignItems: "start"
      }}>
        <Card sx={{ alignSelf: "start" }}>
          <Box sx={{ borderBottom: "1px solid #e2e8f0" }}>
            <Tabs
              value={activeTab}
              onChange={(_event, value) => setActiveTab(value)}
              sx={{ px: 2, minHeight: 44 }}
              textColor="inherit"
              TabIndicatorProps={{ style: { backgroundColor: "var(--color-text-primary)" } }}
            >
              <Tab label="Work notes" icon={<Badge count={(workNotes ?? []).length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="History" icon={<Badge count={(auditEvents ?? []).length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
            </Tabs>
          </Box>
          <CardContent>
            {activeTab === 0 ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                    value={workNoteBody}
                    onChange={(event) => setWorkNoteBody(event.target.value)}
                    placeholder="Add a work note..."
                  />
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleAddNote}
                    disabled={savingNote || !workNoteBody.trim()}
                    sx={{ alignSelf: "flex-end", whiteSpace: "nowrap" }}
                  >
                    Add note
                  </Button>
                </Stack>
                <Divider />
                {(workNotes ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No work notes yet.</Typography>
                ) : (
                  <Stack spacing={0}>
                    {(workNotes ?? []).slice().reverse().map((note, index, list) => (
                      <Box key={note.id} sx={{
                        display: "flex", gap: 1.5, pb: 2,
                        position: "relative",
                        "&:before": index < list.length - 1 ? {
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
                            <Typography variant="caption" color="text.secondary">{note.author.email}</Typography>
                            <Typography variant="caption" color="text.secondary">{new Date(note.createdAt).toLocaleString("en-GB")}</Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                            {note.body}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}
              </Stack>
            ) : null}

            {activeTab === 1 ? (
              <Stack spacing={0}>
                {(auditEvents ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No history yet.</Typography>
                ) : (
                  (auditEvents ?? []).map((event, index) => (
                    <Box key={event.id} sx={{
                      display: "flex", gap: 1.5, pb: 2,
                      position: "relative",
                      "&:before": index < (auditEvents ?? []).length - 1 ? {
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
                          <Typography variant="caption" fontWeight={600}>{actionLabel(event.action, event.data)}</Typography>
                          {event.actorEmail ? (
                            <Typography variant="caption" color="text.secondary">{event.actorEmail}</Typography>
                          ) : null}
                          <Typography variant="caption" color="text.secondary">{new Date(event.createdAt).toLocaleString("en-GB")}</Typography>
                        </Stack>
                      </Box>
                    </Box>
                  ))
                )}
              </Stack>
            ) : null}
          </CardContent>
        </Card>

        <Stack spacing={2} sx={{ alignSelf: "start" }}>
          {editingProperties ? (
            <Card>
              <CardContent sx={{ pb: "12px !important" }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                  color: "var(--color-text-muted)", mb: 1.5
                }}>
                  PROPERTIES
                </Typography>
                <Stack spacing={1.5}>
                  <TextField size="small" label="Title" fullWidth value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
                  <TextField size="small" label="Description" fullWidth multiline rows={3} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
                  <TextField select size="small" label="Severity" fullWidth value={editSeverity} onChange={(event) => setEditSeverity(event.target.value)}>
                    <MenuItem value="LOW">LOW</MenuItem>
                    <MenuItem value="MEDIUM">MEDIUM</MenuItem>
                    <MenuItem value="HIGH">HIGH</MenuItem>
                    <MenuItem value="CRITICAL">CRITICAL</MenuItem>
                  </TextField>
                  <TextField select size="small" label="Priority" fullWidth value={editPriority} onChange={(event) => setEditPriority(event.target.value)}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                  </TextField>
                  <TextField select size="small" label="Assignee" fullWidth value={editAssigneeId} onChange={(event) => setEditAssigneeId(event.target.value)}>
                    <MenuItem value="">Unassigned</MenuItem>
                    {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.email}</MenuItem>)}
                  </TextField>
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" onClick={() => {
                      setEditingProperties(false)
                      setEditTitle(incident.title)
                      setEditDescription(incident.description)
                      setEditSeverity(incident.severity)
                      setEditPriority(incident.priority)
                      setEditAssigneeId(incident.assigneeId ?? "")
                    }}>Cancel</Button>
                    <Button size="small" variant="contained" onClick={handleSaveProperties} disabled={savingProperties || !editTitle.trim() || !editDescription.trim()}>
                      {savingProperties ? "Saving..." : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <PropertiesPanel
              rows={propertyRows}
              onEdit={canManage && incident.status !== "CLOSED" ? () => setEditingProperties(true) : undefined}
            />
          )}

          <LinkedEntitiesPanel
            items={linkedTasks ?? []}
            onNavigate={(task) => setQuickTaskId(task.id)}
            onCreate={canManage ? () => setTaskOpen(true) : undefined}
          />
        </Stack>
      </Box>

      <Dialog open={!!transitionTarget} onClose={() => setTransitionTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Move to {STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              This will update the incident status to <strong>{STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</strong>.
            </Typography>
            <TextField
              label="Comment (optional)"
              multiline
              rows={2}
              fullWidth
              value={transitionComment}
              onChange={(event) => setTransitionComment(event.target.value)}
              placeholder="Add context for this transition..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransitionTarget(null)}>Cancel</Button>
          <Button variant="contained" disabled={savingTransition} onClick={handleTransition}>
            {savingTransition ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        linkedEntityType="Incident"
        linkedEntityId={incident.id}
        linkedEntityLabel={incident.reference}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["linked-tasks-incident", id] })}
      />

      <TaskQuickDetailModal
        open={Boolean(quickTaskId)}
        taskId={quickTaskId}
        users={users}
        canManage={canManage}
        onClose={() => setQuickTaskId(null)}
        onOpenFull={(taskId) => navigate(`/tasks/${taskId}`, {
          state: { fromIncident: incident.id, fromIncidentRef: incident.reference }
        })}
        onPatchTask={patchLinkedTask}
        onUpdateStatus={updateLinkedTaskStatus}
      />
    </Box>
  )
}
