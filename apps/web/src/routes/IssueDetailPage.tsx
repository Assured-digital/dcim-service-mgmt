import React from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, MenuItem, Stack, Tab, Tabs,
  TextField, Tooltip, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import LockIcon from "@mui/icons-material/Lock"
import CheckIcon from "@mui/icons-material/Check"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import {
  InfoField, Badge, DetailHeader, PropertiesPanel, LinkedEntitiesPanel,
  chipSx, type LinkedTask
} from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { CreateTaskModal } from "./TasksPage"

type Issue = {
  id: string
  reference: string
  title: string
  description: string
  severity: string
  status: string
  resolution: string | null
  reviewDate: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

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
  OPEN: ["IN_PROGRESS", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: []
}

const STATUS_ALL = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  OPEN: "Logged, not yet actioned",
  IN_PROGRESS: "Actively being worked on",
  RESOLVED: "Fix applied, pending confirmation",
  CLOSED: "Confirmed and signed off"
}

function severityLabel(severity: string) {
  if (severity === "RED") return "High severity"
  if (severity === "AMBER") return "Medium severity"
  return "Low severity"
}

function actionLabel(action: string, data: any): string {
  switch (action) {
    case "CREATED": return "Issue logged"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return `Issue updated${data?.fields ? `: ${data.fields.join(", ")}` : ""}`
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

export default function IssueDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fromTask = location.state?.fromTask
  const fromTaskRef = location.state?.fromTaskRef
  const qc = useQueryClient()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState(0)

  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [resolution, setResolution] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)

  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editSeverity, setEditSeverity] = React.useState("AMBER")
  const [editReviewDate, setEditReviewDate] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const { data: issue, isLoading } = useQuery({
    queryKey: ["issue-detail", id],
    queryFn: async () => (await api.get<Issue>(`/issues/${id}`)).data,
    enabled: !!id
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-issue", id],
    queryFn: async () =>
      (await api.get<LinkedTask[]>("/tasks", {
        params: { linkedEntityType: "Issue", linkedEntityId: id }
      })).data,
    enabled: !!id
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-issue", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/Issue/${id}`)).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-issue", id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/comments/Issue/${id}/work-notes`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (issue) {
      setEditSeverity(issue.severity)
      setEditReviewDate(issue.reviewDate?.slice(0, 10) ?? "")
      setResolution(issue.resolution ?? "")
    }
  }, [issue])

  async function handleTransition() {
    if (!transitionTarget || !issue) return
    setSavingTransition(true)
    setError("")
    try {
      await api.post(`/issues/${id}/status`, {
        status: transitionTarget,
        resolution: transitionTarget === "RESOLVED" || transitionTarget === "CLOSED"
          ? resolution : undefined
      })
      if (transitionComment.trim()) {
        await api.post("/comments/work-note", {
          entityType: "Issue", entityId: id, body: transitionComment.trim()
        })
      }
      if (transitionTarget === "RESOLVED") setActiveTab(0)
      setTransitionTarget(null)
      setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["issue-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-issue", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-issue", id] })
      qc.invalidateQueries({ queryKey: ["issues"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status")
    } finally {
      setSavingTransition(false)
    }
  }

  async function handleSaveProperties() {
    setSavingProperties(true)
    try {
      await api.put(`/issues/${id}`, {
        severity: editSeverity,
        reviewDate: editReviewDate || undefined
      })
      setEditingProperties(false)
      qc.invalidateQueries({ queryKey: ["issue-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-issue", id] })
    } finally {
      setSavingProperties(false)
    }
  }

  async function handleAddNote() {
    if (!workNoteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Issue", entityId: id, body: workNoteBody
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-issue", id] })
    } finally {
      setSavingNote(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!issue) return <ErrorState title="Issue not found" />

  const nextStatuses = STATUS_FLOW[issue.status] ?? []
  const currentIndex = STATUS_ALL.indexOf(issue.status)

  return (
    <Box>
      {/* Top bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => fromTask ? navigate(`/tasks/${fromTask}`) : navigate("/issues")}
            sx={{ color: "text.secondary" }} size="small"
          >
            {fromTask ? `Back to task ${fromTaskRef}` : "Back to issues"}
          </Button>
          <DetailHeader
            reference={issue.reference}
            status={issue.status}
            statusLabel={STATUS_LABELS[issue.status]}
            extras={
              <Chip size="small" sx={chipSx(issue.severity)}
                label={severityLabel(issue.severity)} />
            }
          />
        </Stack>
      </Stack>

      {/* Info container */}
      <Box sx={{
        bgcolor: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderTopLeftRadius: 8, borderTopRightRadius: 8,
        p: 2.5
      }}>
        <InfoField label="ISSUE">
          <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            {issue.title}
          </Typography>
        </InfoField>
        <Divider sx={{ my: 1.5 }} />
        <InfoField label="DESCRIPTION">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
            {issue.description}
          </Typography>
        </InfoField>
        <Divider sx={{ mt: 1.5 }} />
      </Box>

      {/* Workflow strip */}
      <Box sx={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderTop: "none",
        borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
        bgcolor: "var(--color-background-primary)",
        px: 2.5, pt: 1.5, pb: 2, mb: 3
      }}>
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
          <Typography sx={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
            color: "var(--color-text-tertiary)"
          }}>
            STATUS
          </Typography>
          <Tooltip
            title="Click an available stage to transition this record. Stages shown in blue are available next steps."
            placement="right" arrow
          >
            <InfoOutlinedIcon sx={{ fontSize: 13, color: "var(--color-text-tertiary)", cursor: "help" }} />
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={0} alignItems="stretch">
          {STATUS_ALL.map((status, idx) => {
            const isCurrent = status === issue.status
            const isPast = idx < currentIndex
            const isNext = nextStatuses.includes(status) && canManage
            return (
              <React.Fragment key={status}>
                <Tooltip title={STATUS_DESCRIPTIONS[status]} placement="bottom" arrow>
                  <Box
                    onClick={isNext ? () => setTransitionTarget(status) : undefined}
                    sx={{
                      flex: 1, px: 1.5, py: 1.25, borderRadius: 1.5,
                      cursor: isNext ? "pointer" : "default",
                      bgcolor: isCurrent ? "#0f172a"
                        : isPast ? "#f1f5f9"
                        : isNext ? "#eff6ff"
                        : "transparent",
                      border: "1px solid",
                      borderColor: isCurrent ? "#0f172a"
                        : isPast ? "var(--color-border-tertiary)"
                        : isNext ? "#bfdbfe"
                        : "transparent",
                      transition: "all 0.15s",
                      "&:hover": isNext ? { bgcolor: "#dbeafe", borderColor: "#93c5fd" } : {}
                    }}
                  >
                    <Stack direction="row" spacing={0.75} alignItems="center">
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
                    </Stack>
                  </Box>
                </Tooltip>
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
              <Tab label="Resolution" sx={{ fontSize: 13, minHeight: 44 }} />
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

            {activeTab === 0 ? (
              <Stack spacing={1.5}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                  color: "var(--color-text-tertiary)"
                }}>
                  RESOLUTION
                </Typography>
                {issue.status === "CLOSED" ? (
                  <Box sx={{
                    p: 1.5, borderRadius: 1.5,
                    border: "1px solid #bbf7d0", bgcolor: "#f0fdf4"
                  }}>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {issue.resolution ?? "No resolution recorded."}
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Document how this issue was or will be resolved. Required when moving to Resolved.
                    </Typography>
                    <TextField fullWidth multiline rows={5}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Describe how this issue is being resolved..."
                      size="small" />
                  </>
                )}
              </Stack>
            ) : null}

            {activeTab === 1 ? (
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
                  <Typography variant="body2" color="text.secondary">No work notes yet.</Typography>
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

            {activeTab === 2 ? (
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
          {editingProperties ? (
            <Card>
              <CardContent sx={{ pb: "12px !important" }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                  color: "var(--color-text-tertiary)", mb: 1.5
                }}>
                  PROPERTIES
                </Typography>
                <Stack spacing={1.5}>
                  <TextField select size="small" label="Severity" fullWidth
                    value={editSeverity}
                    onChange={(e) => setEditSeverity(e.target.value)}>
                    <MenuItem value="GREEN">Green — low</MenuItem>
                    <MenuItem value="AMBER">Amber — medium</MenuItem>
                    <MenuItem value="RED">Red — high</MenuItem>
                  </TextField>
                  <TextField type="date" size="small" label="Review date" fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={editReviewDate}
                    onChange={(e) => setEditReviewDate(e.target.value)} />
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" onClick={() => {
                      setEditingProperties(false)
                      setEditSeverity(issue.severity)
                      setEditReviewDate(issue.reviewDate?.slice(0, 10) ?? "")
                    }}>Cancel</Button>
                    <Button size="small" variant="contained"
                      onClick={handleSaveProperties} disabled={savingProperties}>
                      {savingProperties ? "Saving..." : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <PropertiesPanel
              onEdit={canManage && issue.status !== "CLOSED"
                ? () => setEditingProperties(true)
                : undefined}
              rows={[
                {
                  label: "Severity",
                  value: <Chip size="small" sx={chipSx(issue.severity)}
                    label={severityLabel(issue.severity)} />
                },
                issue.reviewDate ? {
                  label: "Review date",
                  value: <Typography variant="caption">
                    {new Date(issue.reviewDate).toLocaleDateString("en-GB")}
                  </Typography>
                } : null,
                {
                  label: "Logged",
                  value: <Typography variant="caption">
                    {new Date(issue.createdAt).toLocaleDateString("en-GB")}
                  </Typography>
                },
                issue.closedAt ? {
                  label: "Closed",
                  value: <Typography variant="caption">
                    {new Date(issue.closedAt).toLocaleDateString("en-GB")}
                  </Typography>
                } : null
              ].filter(Boolean) as any}
            />
          )}

          <LinkedEntitiesPanel
            items={linkedTasks ?? []}
            onNavigate={(task) => navigate(`/tasks/${task.id}`, {
              state: { fromIssue: issue.id, fromIssueRef: issue.reference }
            })}
            onCreate={canManage ? () => setTaskOpen(true) : undefined}
          />
        </Stack>
      </Box>

      <Dialog open={!!transitionTarget} onClose={() => setTransitionTarget(null)}
        maxWidth="xs" fullWidth>
        <DialogTitle>
          Move to {STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              This will update the issue status to{" "}
              <strong>{STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</strong>.
            </Typography>
            {transitionTarget === "RESOLVED" || transitionTarget === "CLOSED" ? (
              <TextField
                label={transitionTarget === "RESOLVED" ? "Resolution (required)" : "Resolution (optional)"}
                multiline rows={3} fullWidth
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Describe how this issue was resolved..." />
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
            disabled={
              savingTransition ||
              (transitionTarget === "RESOLVED" && !resolution.trim())
            }
            color={transitionTarget === "CLOSED" ? "error" : "primary"}
            onClick={handleTransition}>
            {savingTransition ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        linkedEntityType="Issue"
        linkedEntityId={issue.id}
        linkedEntityLabel={issue.reference}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["linked-tasks-issue", id] })}
      />
    </Box>
  )
}