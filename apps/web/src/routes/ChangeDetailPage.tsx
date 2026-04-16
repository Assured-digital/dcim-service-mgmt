import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, MenuItem, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import LockIcon from "@mui/icons-material/Lock"
import {
  Badge, InfoField, LinkedEntitiesPanel, PropertiesPanel, SectionHeader, WorkflowStrip,
  chipSx, statusSelectSx, type LinkedTask
} from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { CreateTaskModal, TaskQuickDetailModal } from "./TasksPage"

type ChangeApproval = {
  id: string
  decision: string
  notes: string | null
  decidedAt: string
  approver: { id: string; email: string }
}

type ChangeRequest = {
  id: string
  reference: string
  title: string
  description: string
  changeType: string
  status: string
  priority: string
  reason: string | null
  impactAssessment: string | null
  rollbackPlan: string | null
  implementationNotes: string | null
  postImplReview: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  closedAt: string | null
  assigneeId: string | null
  assignee: { id: string; email: string } | null
  approvals: ChangeApproval[]
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

type ChangeComment = {
  id: string
  body: string
  type: string
  createdAt: string
  author: { id: string; email: string }
}

type User = { id: string; email: string }
type ChangePropertyRow = { label: string; value: React.ReactNode }

const STATUS_FLOW: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"],
  REJECTED: ["DRAFT", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: []
}

const STATUS_ALL = ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "IN_PROGRESS", "COMPLETED", "CLOSED", "CANCELLED"]

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  DRAFT: "Drafting and planning",
  SUBMITTED: "Raised for review",
  PENDING_APPROVAL: "Awaiting approver decision",
  APPROVED: "Approved for execution",
  REJECTED: "Rejected or sent back",
  IN_PROGRESS: "Implementation underway",
  COMPLETED: "Implementation complete",
  CLOSED: "Closed and archived",
  CANCELLED: "Cancelled"
}

function actionLabel(action: string, data?: { from?: string; to?: string; fields?: string[] } | null): string {
  switch (action) {
    case "CREATED": return "Change logged"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return `Change updated${data?.fields ? `: ${data.fields.join(", ")}` : ""}`
    case "APPROVAL_RECORDED": return "Approval decision recorded"
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

function formatDateTime(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-GB")
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export default function ChangeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])
  const canApprove = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState(0)

  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [transitionImplementationNotes, setTransitionImplementationNotes] = React.useState("")
  const [transitionPostReview, setTransitionPostReview] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)

  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editPriority, setEditPriority] = React.useState("medium")
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [editScheduledStart, setEditScheduledStart] = React.useState("")
  const [editScheduledEnd, setEditScheduledEnd] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const [approvalOpen, setApprovalOpen] = React.useState<"APPROVED" | "REJECTED" | "DEFERRED" | null>(null)
  const [approvalNote, setApprovalNote] = React.useState("")
  const [savingApproval, setSavingApproval] = React.useState(false)

  const { data: change, isLoading } = useQuery({
    queryKey: ["change-detail", id],
    queryFn: async () => (await api.get<ChangeRequest>(`/changes/${id}`)).data,
    enabled: !!id
  })

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-change", id],
    queryFn: async () =>
      (await api.get<LinkedTask[]>("/tasks", {
        params: { linkedEntityType: "ChangeRequest", linkedEntityId: id }
      })).data,
    enabled: !!id
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-change", id],
    queryFn: async () => (await api.get<AuditEvent[]>(`/audit-events/entity/ChangeRequest/${id}`)).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-change", id],
    queryFn: async () => (await api.get<ChangeComment[]>(`/comments/ChangeRequest/${id}/work-notes`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (change) {
      setEditPriority(change.priority)
      setEditAssigneeId(change.assigneeId ?? "")
      setEditScheduledStart(change.scheduledStart ? change.scheduledStart.slice(0, 16) : "")
      setEditScheduledEnd(change.scheduledEnd ? change.scheduledEnd.slice(0, 16) : "")
      setTransitionImplementationNotes(change.implementationNotes ?? "")
      setTransitionPostReview(change.postImplReview ?? "")
    }
  }, [change])

  React.useEffect(() => { if (change) setRecordLabel(change.reference) }, [change]) // eslint-disable-line
  if (isLoading) return <LoadingState />
  if (!change) return <ErrorState title="Change not found" />

  async function handleTransition() {
    if (!transitionTarget || !change) return
    setSavingTransition(true)
    setError("")
    try {
      await api.post(`/changes/${id}/status`, {
        status: transitionTarget,
        implementationNotes: transitionImplementationNotes.trim() || undefined,
        postImplReview: transitionPostReview.trim() || undefined
      })
      if (transitionComment.trim()) {
        await api.post("/comments/work-note", {
          entityType: "ChangeRequest",
          entityId: id,
          body: transitionComment.trim()
        })
      }
      setTransitionTarget(null)
      setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["change-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-change", id] })
      qc.invalidateQueries({ queryKey: ["changes"] })
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
      await api.put(`/changes/${id}`, {
        priority: editPriority,
        assigneeId: editAssigneeId || undefined,
        scheduledStart: editScheduledStart || undefined,
        scheduledEnd: editScheduledEnd || undefined
      })
      setEditingProperties(false)
      qc.invalidateQueries({ queryKey: ["change-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
      qc.invalidateQueries({ queryKey: ["changes"] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to save change properties"))
    } finally {
      setSavingProperties(false)
    }
  }

  async function handleAddNote() {
    if (!workNoteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "ChangeRequest",
        entityId: id,
        body: workNoteBody.trim()
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-change", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
    } finally {
      setSavingNote(false)
    }
  }

  async function handleApproval() {
    if (!approvalOpen) return
    setSavingApproval(true)
    setError("")
    try {
      await api.post(`/changes/${id}/approve`, {
        decision: approvalOpen,
        notes: approvalNote.trim() || undefined
      })
      setApprovalOpen(null)
      setApprovalNote("")
      qc.invalidateQueries({ queryKey: ["change-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
      qc.invalidateQueries({ queryKey: ["changes"] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to record approval"))
    } finally {
      setSavingApproval(false)
    }
  }

  async function patchLinkedTask(taskId: string, patch: Record<string, any>) {
    await api.put(`/tasks/${taskId}`, patch)
    qc.invalidateQueries({ queryKey: ["linked-tasks-change", id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  async function updateLinkedTaskStatus(taskId: string, status: string) {
    await api.post(`/tasks/${taskId}/status`, { status })
    qc.invalidateQueries({ queryKey: ["linked-tasks-change", id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  const nextStatuses = STATUS_FLOW[change.status] ?? []
  const propertyRows: ChangePropertyRow[] = [
    { label: "Type", value: <Chip size="small" sx={chipSx(change.changeType)} label={change.changeType} /> },
    { label: "Priority", value: <Chip size="small" sx={chipSx(change.priority)} label={capitalize(change.priority)} /> },
    { label: "Assignee", value: <Typography variant="caption">{change.assignee?.email ?? "Unassigned"}</Typography> },
    { label: "Scheduled start", value: <Typography variant="caption">{formatDateTime(change.scheduledStart)}</Typography> },
    { label: "Scheduled end", value: <Typography variant="caption">{formatDateTime(change.scheduledEnd)}</Typography> },
    { label: "Actual start", value: <Typography variant="caption">{formatDateTime(change.actualStart)}</Typography> },
    { label: "Actual end", value: <Typography variant="caption">{formatDateTime(change.actualEnd)}</Typography> },
    { label: "Created", value: <Typography variant="caption">{new Date(change.createdAt).toLocaleDateString("en-GB")}</Typography> }
  ]

  return (
    <Box>
      <Box sx={{
        bgcolor: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderTopLeftRadius: 8, borderTopRightRadius: 8,
        px: 2.5, pt: 1.25, pb: 2
      }}>
        <SectionHeader
          label="CHANGE REQUEST"
          action={canManage && nextStatuses.includes("CANCELLED") ? (
            <Button size="small" variant="outlined" color="error" onClick={() => setTransitionTarget("CANCELLED")}>
              Cancel change
            </Button>
          ) : undefined}
        />
        <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
          {change.title}
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <InfoField label="DESCRIPTION">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
            {change.description}
          </Typography>
        </InfoField>
        <Divider sx={{ mt: 1.5 }} />
      </Box>

      <Box sx={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderTop: "none",
        borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
        bgcolor: "var(--color-background-primary)",
        p: 1.5,
        mb: 3,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr auto" },
        gap: 1.25,
        alignItems: "center"
      }}>
        <WorkflowStrip
          stages={STATUS_ALL.map((status) => ({
            id: status,
            label: STATUS_LABELS[status],
            description: STATUS_DESCRIPTIONS[status]
          }))}
          currentStage={change.status}
          mb={0}
          specialStageColors={{ APPROVED: "#14532d", CLOSED: "#14532d", REJECTED: "#7f1d1d", CANCELLED: "#7f1d1d" }}
        />
        {canManage ? (
          <TextField
            select
            size="small"
            label="Change status"
            value={transitionTarget ?? ""}
            onChange={(event) => setTransitionTarget(event.target.value)}
            sx={statusSelectSx(220)}
          >
            <MenuItem value="" disabled>No status selected</MenuItem>
            {nextStatuses.map((status) => (
              <MenuItem key={status} value={status}>
                {STATUS_LABELS[status] ?? status}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Box>

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
              <Tab label="Implementation" sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="Approvals" icon={<Badge count={(change.approvals ?? []).length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="Work notes" icon={<Badge count={(workNotes ?? []).length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="History" icon={<Badge count={(auditEvents ?? []).length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
            </Tabs>
          </Box>
          <CardContent>
            {activeTab === 0 ? (
              <Stack spacing={2}>
                <InfoField label="Reason">
                  <Typography variant="body2" color="text.secondary">
                    {change.reason || "No reason provided."}
                  </Typography>
                </InfoField>
                <Divider />
                <InfoField label="Impact assessment">
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {change.impactAssessment || "No impact assessment recorded."}
                  </Typography>
                </InfoField>
                <Divider />
                <InfoField label="Rollback plan">
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {change.rollbackPlan || "No rollback plan recorded."}
                  </Typography>
                </InfoField>
                <Divider />
                <InfoField label="Implementation notes">
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {change.implementationNotes || "No implementation notes yet."}
                  </Typography>
                </InfoField>
                <Divider />
                <InfoField label="Post implementation review">
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                    {change.postImplReview || "No post implementation review yet."}
                  </Typography>
                </InfoField>
              </Stack>
            ) : null}

            {activeTab === 1 ? (
              <Stack spacing={2}>
                {canApprove ? (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="contained" color="success" onClick={() => setApprovalOpen("APPROVED")}>
                      Approve
                    </Button>
                    <Button size="small" variant="outlined" color="warning" onClick={() => setApprovalOpen("DEFERRED")}>
                      Defer
                    </Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => setApprovalOpen("REJECTED")}>
                      Reject
                    </Button>
                  </Stack>
                ) : null}
                {(change.approvals ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No approvals yet.</Typography>
                ) : (
                  <Stack spacing={1}>
                    {(change.approvals ?? []).map((approval) => (
                      <Box key={approval.id} sx={{ p: 1.5, border: "1px solid #e2e8f0", borderRadius: 1.5 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip size="small" sx={chipSx(approval.decision)} label={approval.decision} />
                          <Typography variant="caption" color="text.secondary">{approval.approver.email}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(approval.decidedAt).toLocaleString("en-GB")}
                          </Typography>
                        </Stack>
                        {approval.notes ? (
                          <Typography variant="body2" sx={{ mt: 1, color: "#334155", whiteSpace: "pre-wrap" }}>
                            {approval.notes}
                          </Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Stack>
                )}
              </Stack>
            ) : null}

            {activeTab === 2 ? (
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

            {activeTab === 3 ? (
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
                  <TextField
                    type="datetime-local"
                    size="small"
                    label="Scheduled start"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={editScheduledStart}
                    onChange={(event) => setEditScheduledStart(event.target.value)}
                  />
                  <TextField
                    type="datetime-local"
                    size="small"
                    label="Scheduled end"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={editScheduledEnd}
                    onChange={(event) => setEditScheduledEnd(event.target.value)}
                  />
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" onClick={() => {
                      setEditingProperties(false)
                      setEditPriority(change.priority)
                      setEditAssigneeId(change.assigneeId ?? "")
                      setEditScheduledStart(change.scheduledStart ? change.scheduledStart.slice(0, 16) : "")
                      setEditScheduledEnd(change.scheduledEnd ? change.scheduledEnd.slice(0, 16) : "")
                    }}>Cancel</Button>
                    <Button size="small" variant="contained" onClick={handleSaveProperties} disabled={savingProperties}>
                      {savingProperties ? "Saving..." : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <PropertiesPanel
              rows={propertyRows}
              onEdit={canManage && !["CLOSED", "CANCELLED"].includes(change.status) ? () => setEditingProperties(true) : undefined}
            />
          )}

          <LinkedEntitiesPanel
            items={linkedTasks ?? []}
            onNavigate={(task) => setQuickTaskId(task.id)}
            onCreate={canManage ? () => setTaskOpen(true) : undefined}
          />
        </Stack>
      </Box>

      <Dialog open={!!transitionTarget} onClose={() => setTransitionTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Move to {STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              This will update the change status to <strong>{STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</strong>.
            </Typography>
            {(transitionTarget === "IN_PROGRESS" || transitionTarget === "COMPLETED" || transitionTarget === "CLOSED") ? (
              <TextField
                label="Implementation notes"
                multiline
                rows={3}
                fullWidth
                value={transitionImplementationNotes}
                onChange={(event) => setTransitionImplementationNotes(event.target.value)}
              />
            ) : null}
            {(transitionTarget === "COMPLETED" || transitionTarget === "CLOSED") ? (
              <TextField
                label="Post implementation review"
                multiline
                rows={3}
                fullWidth
                value={transitionPostReview}
                onChange={(event) => setTransitionPostReview(event.target.value)}
              />
            ) : null}
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

      <Dialog open={!!approvalOpen} onClose={() => setApprovalOpen(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Record approval decision</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Decision: <strong>{approvalOpen ?? ""}</strong>
            </Typography>
            <TextField
              label="Note (optional)"
              multiline
              rows={3}
              fullWidth
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.target.value)}
              placeholder="Explain this decision..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovalOpen(null)}>Cancel</Button>
          <Button variant="contained" disabled={savingApproval} onClick={handleApproval}>
            {savingApproval ? "Saving..." : "Record"}
          </Button>
        </DialogActions>
      </Dialog>

      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        linkedEntityType="ChangeRequest"
        linkedEntityId={change.id}
        linkedEntityLabel={change.reference}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["linked-tasks-change", id] })}
      />

      <TaskQuickDetailModal
        open={Boolean(quickTaskId)}
        taskId={quickTaskId}
        users={users}
        canManage={canManage}
        onClose={() => setQuickTaskId(null)}
        onOpenFull={(taskId) => navigate(`/tasks/${taskId}`, {
          state: { fromChange: change.id, fromChangeRef: change.reference }
        })}
        onPatchTask={patchLinkedTask}
        onUpdateStatus={updateLinkedTaskStatus}
      />
    </Box>
  )
}
