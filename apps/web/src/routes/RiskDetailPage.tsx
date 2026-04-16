import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, MenuItem, Stack, Tab, Tabs,
  TextField, Typography
} from "@mui/material"
import LockIcon from "@mui/icons-material/Lock"
import {
  InfoField, Badge, PropertiesPanel, LinkedEntitiesPanel, SectionHeader,
  chipSx, statusSelectSx, type LinkedTask,
  WorkflowStrip
} from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { CreateTaskModal, TaskQuickDetailModal } from "./TasksPage"

type Risk = {
  id: string
  reference: string
  title: string
  description: string
  likelihood: string
  impact: string
  status: string
  source: string | null
  mitigationPlan: string | null
  acceptanceNote: string | null
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
  data?: { from?: string; to?: string; fields?: string[] } | null
  createdAt: string
}
type RiskPropertyRow = { label: string; value: React.ReactNode }

type RiskComment = {
  id: string
  body: string
  type: string
  createdAt: string
  author: { id: string; email: string }
}

const STATUS_FLOW: Record<string, string[]> = {
  IDENTIFIED: ["ASSESSED", "CLOSED"],
  ASSESSED: ["MITIGATING", "ACCEPTED", "CLOSED"],
  MITIGATING: ["ASSESSED", "ACCEPTED", "CLOSED"],
  ACCEPTED: ["MITIGATING", "CLOSED"],
  CLOSED: []
}

const STATUS_ALL = ["IDENTIFIED", "ASSESSED", "MITIGATING", "ACCEPTED", "CLOSED"]

const STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: "Identified",
  ASSESSED: "Assessed",
  MITIGATING: "Mitigating",
  ACCEPTED: "Accepted",
  CLOSED: "Closed"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  IDENTIFIED: "Logged, not yet evaluated",
  ASSESSED: "Likelihood & impact confirmed",
  MITIGATING: "Active treatment underway",
  ACCEPTED: "Accepted with rationale",
  CLOSED: "Resolved or retired"
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manual entry",
  SURVEY: "Survey / audit",
  INCIDENT: "Incident",
  CHANGE: "Change request",
  AUDIT: "Audit finding"
}

function deriveRag(likelihood: string, impact: string): "RED" | "AMBER" | "GREEN" {
  const score: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 }
  const total = (score[likelihood] ?? 2) * (score[impact] ?? 2)
  if (total >= 6) return "RED"
  if (total >= 3) return "AMBER"
  return "GREEN"
}

function ragLabel(level: "RED" | "AMBER" | "GREEN") {
  if (level === "RED") return "High risk"
  if (level === "AMBER") return "Medium risk"
  return "Low risk"
}

function actionLabel(action: string, data?: { from?: string; to?: string; fields?: string[] } | null): string {
  switch (action) {
    case "CREATED": return "Risk logged"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return `Risk updated${data?.fields ? `: ${data.fields.join(", ")}` : ""}`
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

export default function RiskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState(0)

  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [acceptanceNote, setAcceptanceNote] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)
  const [transitionLikelihood, setTransitionLikelihood] = React.useState("MEDIUM")
  const [transitionImpact, setTransitionImpact] = React.useState("MEDIUM")

  const [editingMitigation, setEditingMitigation] = React.useState(false)
  const [mitigationPlan, setMitigationPlan] = React.useState("")
  const [savingMitigation, setSavingMitigation] = React.useState(false)

  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editLikelihood, setEditLikelihood] = React.useState("MEDIUM")
  const [editImpact, setEditImpact] = React.useState("MEDIUM")
  const [editReviewDate, setEditReviewDate] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)

  const { data: risk, isLoading } = useQuery({
    queryKey: ["risk-detail", id],
    queryFn: async () => (await api.get<Risk>(`/risks/${id}`)).data,
    enabled: !!id
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-risk", id],
    queryFn: async () =>
      (await api.get<LinkedTask[]>("/tasks", {
        params: { linkedEntityType: "Risk", linkedEntityId: id }
      })).data,
    enabled: !!id
  })
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<{ id: string; email: string }[]>("/users")).data
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-risk", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/Risk/${id}`)).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-risk", id],
    queryFn: async () =>
      (await api.get<RiskComment[]>(`/comments/Risk/${id}/work-notes`)).data,
    enabled: !!id
  })

  React.useEffect(() => {
    if (risk) {
      setMitigationPlan(risk.mitigationPlan ?? "")
      setAcceptanceNote(risk.acceptanceNote ?? "")
      setEditLikelihood(risk.likelihood)
      setEditImpact(risk.impact)
      setEditReviewDate(risk.reviewDate?.slice(0, 10) ?? "")
      setTransitionLikelihood(risk.likelihood)
      setTransitionImpact(risk.impact)
    }
  }, [risk])

  async function handleTransition() {
    if (!transitionTarget || !risk) return
    setSavingTransition(true)
    setError("")
    try {
      if (transitionTarget === "ASSESSED") {
        await api.put(`/risks/${id}`, {
          likelihood: transitionLikelihood,
          impact: transitionImpact
        })
      }
      await api.post(`/risks/${id}/status`, {
        status: transitionTarget,
        acceptanceNote: transitionTarget === "ACCEPTED" ? acceptanceNote : undefined
      })
      if (transitionComment.trim()) {
        await api.post("/comments/work-note", {
          entityType: "Risk", entityId: id, body: transitionComment.trim()
        })
      }
      if (transitionTarget === "MITIGATING") setActiveTab(0)
      setTransitionTarget(null)
      setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["risk-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-risk", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-risk", id] })
      qc.invalidateQueries({ queryKey: ["risks"] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to update status"))
    } finally {
      setSavingTransition(false)
    }
  }

  async function handleSaveMitigation() {
    setSavingMitigation(true)
    try {
      await api.put(`/risks/${id}`, { mitigationPlan })
      setEditingMitigation(false)
      qc.invalidateQueries({ queryKey: ["risk-detail", id] })
    } finally {
      setSavingMitigation(false)
    }
  }

  async function handleSaveProperties() {
    setSavingProperties(true)
    try {
      await api.put(`/risks/${id}`, {
        likelihood: editLikelihood,
        impact: editImpact,
        reviewDate: editReviewDate || undefined
      })
      setEditingProperties(false)
      qc.invalidateQueries({ queryKey: ["risk-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-risk", id] })
    } finally {
      setSavingProperties(false)
    }
  }

  async function handleAddNote() {
    if (!workNoteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Risk", entityId: id, body: workNoteBody
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-risk", id] })
    } finally {
      setSavingNote(false)
    }
  }

  async function patchLinkedTask(taskId: string, patch: Record<string, any>) {
    await api.put(`/tasks/${taskId}`, patch)
    qc.invalidateQueries({ queryKey: ["linked-tasks-risk", id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  async function updateLinkedTaskStatus(taskId: string, status: string) {
    await api.post(`/tasks/${taskId}/status`, { status })
    qc.invalidateQueries({ queryKey: ["linked-tasks-risk", id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  React.useEffect(() => { if (risk) setRecordLabel(risk.reference) }, [risk]) // eslint-disable-line
  if (isLoading) return <LoadingState />
  if (!risk) return <ErrorState title="Risk not found" />

  const nextStatuses = STATUS_FLOW[risk.status] ?? []
  const rag = deriveRag(risk.likelihood, risk.impact)

  const propertyRows: RiskPropertyRow[] = [
    {
      label: "Overall risk",
      value: <Chip size="small" sx={chipSx(rag)} label={ragLabel(rag)} />
    },
    {
      label: "Likelihood",
      value: <Chip size="small" sx={chipSx(risk.likelihood)} label={risk.likelihood} />
    },
    {
      label: "Impact",
      value: <Chip size="small" sx={chipSx(risk.impact)} label={risk.impact} />
    },
    {
      label: "Source",
      value: <Typography variant="caption">
        {SOURCE_LABELS[risk.source ?? "MANUAL"] ?? risk.source}
      </Typography>
    },
    {
      label: "Logged",
      value: <Typography variant="caption">
        {new Date(risk.createdAt).toLocaleDateString("en-GB")}
      </Typography>
    }
  ]
  if (risk.reviewDate) {
    propertyRows.push({
      label: "Review date",
      value: <Typography variant="caption">
        {new Date(risk.reviewDate).toLocaleDateString("en-GB")}
      </Typography>
    })
  }
  if (risk.closedAt) {
    propertyRows.push({
      label: "Closed",
      value: <Typography variant="caption">
        {new Date(risk.closedAt).toLocaleDateString("en-GB")}
      </Typography>
    })
  }

  return (
    <Box>
      {/* Info container */}
      <Box sx={{
        bgcolor: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderTopLeftRadius: 8, borderTopRightRadius: 8,
        px: 2.5, pt: 1.25, pb: 2
      }}>
        <SectionHeader
          label="RISK"
          action={canManage && nextStatuses.includes("CLOSED") ? (
            <Button size="small" variant="contained" color="error"
              onClick={() => setTransitionTarget("CLOSED")}>
              Close risk
            </Button>
          ) : undefined}
        />
        <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
          {risk.title}
        </Typography>
        <Divider sx={{ my: 1.5 }} />
        <InfoField label="DESCRIPTION">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
            {risk.description}
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
          stages={STATUS_ALL.map(s => ({
            id: s,
            label: STATUS_LABELS[s],
            description: STATUS_DESCRIPTIONS[s]
          }))}
          currentStage={risk.status}
          mb={0}
          specialStageColors={{ CLOSED: "#14532d" }}
        />
        {canManage ? (
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              select
              size="small"
              label="Change status"
              value={transitionTarget ?? ""}
              onChange={(e) => setTransitionTarget(e.target.value)}
              sx={statusSelectSx(190)}
            >
              <MenuItem value="" disabled>
                No status selected
              </MenuItem>
              {nextStatuses.map((status) => (
                <MenuItem key={status} value={status}>
                  {STATUS_LABELS[status] ?? status}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        ) : null}
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
              TabIndicatorProps={{ style: { backgroundColor: "var(--color-text-primary)" } }}
            >
              <Tab label="Mitigation plan" sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="Work notes"
                icon={<Badge count={(workNotes ?? []).length} />}
                iconPosition="end"
                sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="History"
                icon={<Badge count={(auditEvents ?? []).length} />}
                iconPosition="end"
                sx={{ fontSize: 13, minHeight: 44 }} />
              {risk.status === "ACCEPTED" ? (
                <Tab label="Acceptance note" sx={{ fontSize: 13, minHeight: 44 }} />
              ) : null}
            </Tabs>
          </Box>
          <CardContent>

            {activeTab === 0 ? (
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                    color: "var(--color-text-muted)"
                  }}>
                    MITIGATION PLAN
                  </Typography>
                  {canManage && !editingMitigation && risk.status !== "CLOSED" ? (
                    <Button size="small" onClick={() => setEditingMitigation(true)}>
                      {risk.mitigationPlan ? "Edit" : "Add plan"}
                    </Button>
                  ) : null}
                </Stack>
                {editingMitigation ? (
                  <Stack spacing={1.5}>
                    <TextField fullWidth multiline rows={6} value={mitigationPlan}
                      onChange={(e) => setMitigationPlan(e.target.value)}
                      placeholder="Describe mitigation steps..." size="small" />
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                      <Button size="small" onClick={() => {
                        setEditingMitigation(false)
                        setMitigationPlan(risk.mitigationPlan ?? "")
                      }}>Cancel</Button>
                      <Button size="small" variant="contained"
                        onClick={handleSaveMitigation} disabled={savingMitigation}>
                        {savingMitigation ? "Saving..." : "Save"}
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Typography variant="body2"
                    color={risk.mitigationPlan ? "text.primary" : "text.secondary"}
                    sx={{ whiteSpace: "pre-wrap" }}>
                    {risk.mitigationPlan ?? "No mitigation plan recorded yet. Click 'Add plan' to get started."}
                  </Typography>
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

            {activeTab === 3 && risk.status === "ACCEPTED" ? (
              <Stack spacing={1.5}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                  color: "var(--color-text-muted)"
                }}>
                  ACCEPTANCE NOTE
                </Typography>
                <Box sx={{
                  p: 1.5, borderRadius: 1.5,
                  border: "1px solid #fde68a", bgcolor: "#fffbeb"
                }}>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                    {risk.acceptanceNote ?? "No acceptance note recorded."}
                  </Typography>
                </Box>
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
                  <TextField select size="small" label="Likelihood" fullWidth
                    value={editLikelihood}
                    onChange={(e) => setEditLikelihood(e.target.value)}>
                    <MenuItem value="LOW">Low</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                  </TextField>
                  <TextField select size="small" label="Impact" fullWidth
                    value={editImpact}
                    onChange={(e) => setEditImpact(e.target.value)}>
                    <MenuItem value="LOW">Low</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                  </TextField>
                  <TextField type="date" size="small" label="Review date" fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={editReviewDate}
                    onChange={(e) => setEditReviewDate(e.target.value)} />
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" onClick={() => {
                      setEditingProperties(false)
                      setEditLikelihood(risk.likelihood)
                      setEditImpact(risk.impact)
                      setEditReviewDate(risk.reviewDate?.slice(0, 10) ?? "")
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
              onEdit={canManage && risk.status !== "CLOSED"
                ? () => setEditingProperties(true)
                : undefined}
              rows={propertyRows}
            />
          )}

          <LinkedEntitiesPanel
            items={linkedTasks ?? []}
            onNavigate={(task) => setQuickTaskId(task.id)}
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
              This will update the risk status to{" "}
              <strong>{STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</strong>.
            </Typography>
            {transitionTarget === "ASSESSED" ? (
              <Box sx={{
                p: 1.5, borderRadius: 1.5,
                bgcolor: "#eff6ff", border: "1px solid #bfdbfe"
              }}>
                <Typography variant="caption" fontWeight={600} color="#1d4ed8"
                  sx={{ display: "block", mb: 1.25 }}>
                  Confirm likelihood and impact before assessing
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <TextField select size="small" label="Likelihood" fullWidth
                    value={transitionLikelihood}
                    onChange={(e) => setTransitionLikelihood(e.target.value)}>
                    <MenuItem value="LOW">Low</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                  </TextField>
                  <TextField select size="small" label="Impact" fullWidth
                    value={transitionImpact}
                    onChange={(e) => setTransitionImpact(e.target.value)}>
                    <MenuItem value="LOW">Low</MenuItem>
                    <MenuItem value="MEDIUM">Medium</MenuItem>
                    <MenuItem value="HIGH">High</MenuItem>
                  </TextField>
                </Stack>
              </Box>
            ) : null}
            {transitionTarget === "ACCEPTED" ? (
              <TextField label="Acceptance note (required)" multiline rows={3} fullWidth
                value={acceptanceNote}
                onChange={(e) => setAcceptanceNote(e.target.value)}
                placeholder="Explain why this risk is being accepted..." />
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
              (transitionTarget === "ACCEPTED" && !acceptanceNote.trim())
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
        linkedEntityType="Risk"
        linkedEntityId={risk.id}
        linkedEntityLabel={risk.reference}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["linked-tasks-risk", id] })}
      />

      <TaskQuickDetailModal
        open={Boolean(quickTaskId)}
        taskId={quickTaskId}
        users={users}
        canManage={canManage}
        onClose={() => setQuickTaskId(null)}
        onOpenFull={(taskId) => navigate(`/tasks/${taskId}`, {
          state: { fromRisk: risk.id, fromRiskRef: risk.reference }
        })}
        onPatchTask={patchLinkedTask}
        onUpdateStatus={updateLinkedTaskStatus}
      />
    </Box>
  )
}