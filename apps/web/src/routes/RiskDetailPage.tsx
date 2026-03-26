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
import AddIcon from "@mui/icons-material/Add"
import EditIcon from "@mui/icons-material/Edit"
import { statusChipSx } from "../lib/ui"
import { ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { CreateTaskModal } from "./TasksPage"

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

type Task = {
  id: string
  reference: string
  title: string
  status: string
  priority: string
  assignee: { id: string; email: string } | null
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

function ragSx(level: string) {
  if (level === "RED" || level === "HIGH")
    return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 700 }
  if (level === "AMBER" || level === "MEDIUM")
    return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 700 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 700 }
}

function ragLabel(level: "RED" | "AMBER" | "GREEN") {
  if (level === "RED") return "High risk"
  if (level === "AMBER") return "Medium risk"
  return "Low risk"
}

function priorityDot(priority: string) {
  const colors: Record<string, string> = {
    low: "#94a3b8", medium: "#f59e0b", high: "#ef4444", critical: "#7c3aed"
  }
  return colors[priority.toLowerCase()] ?? "#94a3b8"
}

function actionLabel(action: string, data: any): string {
  switch (action) {
    case "CREATED": return "Risk logged"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return `Risk updated${data?.fields ? `: ${data.fields.join(", ")}` : ""}`
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

export default function RiskDetailPage() {
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

  // Status transition
  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [acceptanceNote, setAcceptanceNote] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)

  // ASSESSED transition — likelihood/impact confirmation
  const [transitionLikelihood, setTransitionLikelihood] = React.useState("MEDIUM")
  const [transitionImpact, setTransitionImpact] = React.useState("MEDIUM")

  // Mitigation
  const [editingMitigation, setEditingMitigation] = React.useState(false)
  const [mitigationPlan, setMitigationPlan] = React.useState("")
  const [savingMitigation, setSavingMitigation] = React.useState(false)

  // Properties edit
  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editLikelihood, setEditLikelihood] = React.useState("MEDIUM")
  const [editImpact, setEditImpact] = React.useState("MEDIUM")
  const [editReviewDate, setEditReviewDate] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  // Work note
  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const { data: risk, isLoading } = useQuery({
    queryKey: ["risk-detail", id],
    queryFn: async () => (await api.get<Risk>(`/risks/${id}`)).data,
    enabled: !!id
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-risk", id],
    queryFn: async () =>
      (await api.get<Task[]>("/tasks", {
        params: { linkedEntityType: "Risk", linkedEntityId: id }
      })).data,
    enabled: !!id
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
      (await api.get<Comment[]>(`/comments/Risk/${id}/work-notes`)).data,
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
      // If moving to ASSESSED, save likelihood/impact first
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

      // Auto-switch to mitigation tab when moving to MITIGATING
      if (transitionTarget === "MITIGATING") {
        setActiveTab(0)
      }

      setTransitionTarget(null)
      setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["risk-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-risk", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-risk", id] })
      qc.invalidateQueries({ queryKey: ["risks"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status")
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

  if (isLoading) return <LoadingState />
  if (!risk) return <ErrorState title="Risk not found" />

  const nextStatuses = STATUS_FLOW[risk.status] ?? []
  const currentIndex = STATUS_ALL.indexOf(risk.status)
  const rag = deriveRag(risk.likelihood, risk.impact)

  return (
    <Box>
      {/* Top bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => fromTask ? navigate(`/tasks/${fromTask}`) : navigate("/risks")}
            sx={{ color: "text.secondary" }} size="small"
          >
            {fromTask ? `Back to task ${fromTaskRef}` : "Back to risks"}
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
              {risk.reference}
            </Typography>
            <Box sx={{ width: 1, height: 14, bgcolor: "var(--color-border-tertiary)" }} />
            <Chip size="small" sx={statusChipSx(risk.status)}
              label={STATUS_LABELS[risk.status] ?? risk.status} />
            <Chip size="small" sx={ragSx(rag)} label={ragLabel(rag)} />
          </Box>
        </Stack>
        {canManage && nextStatuses.includes("CLOSED") ? (
          <Button size="small" variant="contained" color="error"
            onClick={() => setTransitionTarget("CLOSED")}>
            Close risk
          </Button>
        ) : null}
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
          {risk.title}
        </Typography>

        <Divider sx={{ mb: 2 }} />

        {/* Description */}
        <InfoField label="DESCRIPTION">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
            {risk.description}
          </Typography>
        </InfoField>
      </Box>

      {/* Workflow strip — no Close risk button anywhere else */}
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
            const isCurrent = status === risk.status
            const isPast = idx < currentIndex
            const isNext = nextStatuses.includes(status) && canManage
            return (
              <React.Fragment key={status}>
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
              <Tab label="Mitigation plan" sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab
                label={
                  <Stack direction="row" alignItems="center">
                    <span>Work notes</span>
                    <Badge count={(workNotes ?? []).length} />
                  </Stack>
                }
                sx={{ minHeight: 44 }}
              />
              <Tab
                label={
                  <Stack direction="row" alignItems="center">
                    <span>History</span>
                    <Badge count={(auditEvents ?? []).length} />
                  </Stack>
                }
                sx={{ minHeight: 44 }}
              />
              {risk.status === "ACCEPTED" ? (
                <Tab label="Acceptance note" sx={{ fontSize: 13, minHeight: 44 }} />
              ) : null}
            </Tabs>
          </Box>
          <CardContent>

            {/* Mitigation plan tab */}
            {activeTab === 0 ? (
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography sx={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                    color: "var(--color-text-tertiary)"
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

            {/* Work notes tab */}
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

            {/* History tab */}
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

            {/* Acceptance note tab */}
            {activeTab === 3 && risk.status === "ACCEPTED" ? (
              <Stack spacing={1.5}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  color: "var(--color-text-tertiary)"
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

          {/* Properties — with edit capability */}
          <Card>
            <CardContent sx={{ pb: "12px !important" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  color: "var(--color-text-tertiary)"
                }}>
                  PROPERTIES
                </Typography>
                {canManage && !editingProperties && risk.status !== "CLOSED" ? (
                  <Button size="small" startIcon={<EditIcon sx={{ fontSize: 13 }} />}
                    onClick={() => setEditingProperties(true)}>
                    Edit
                  </Button>
                ) : null}
              </Stack>

              {editingProperties ? (
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
              ) : (
                <Stack spacing={0} divider={<Divider />}>
                  {[
                    {
                      label: "Overall risk",
                      value: <Chip size="small" sx={ragSx(rag)} label={ragLabel(rag)} />
                    },
                    {
                      label: "Likelihood",
                      value: <Chip size="small" sx={ragSx(risk.likelihood)} label={risk.likelihood} />
                    },
                    {
                      label: "Impact",
                      value: <Chip size="small" sx={ragSx(risk.impact)} label={risk.impact} />
                    },
                    {
                      label: "Source",
                      value: <Typography variant="caption">
                        {SOURCE_LABELS[risk.source ?? "MANUAL"] ?? risk.source}
                      </Typography>
                    },
                    risk.reviewDate ? {
                      label: "Review date",
                      value: <Typography variant="caption">
                        {new Date(risk.reviewDate).toLocaleDateString("en-GB")}
                      </Typography>
                    } : null,
                    {
                      label: "Logged",
                      value: <Typography variant="caption">
                        {new Date(risk.createdAt).toLocaleDateString("en-GB")}
                      </Typography>
                    },
                    risk.closedAt ? {
                      label: "Closed",
                      value: <Typography variant="caption">
                        {new Date(risk.closedAt).toLocaleDateString("en-GB")}
                      </Typography>
                    } : null
                  ].filter(Boolean).map((row: any) => (
                    <Stack key={row.label} direction="row" justifyContent="space-between"
                      alignItems="center" sx={{ py: 0.75 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, mr: 1 }}>
                        {row.label}
                      </Typography>
                      {row.value}
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          {/* Linked tasks */}
          <Card>
            <CardContent sx={{ pb: "12px !important" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                  color: "var(--color-text-tertiary)"
                }}>
                  LINKED TASKS
                </Typography>
                {canManage ? (
                  <Button size="small" startIcon={<AddIcon />} onClick={() => setTaskOpen(true)}>
                    Create
                  </Button>
                ) : null}
              </Stack>
              {(linkedTasks ?? []).length === 0 ? (
                <Box sx={{
                  py: 1.5, textAlign: "center",
                  border: "1px dashed var(--color-border-tertiary)",
                  borderRadius: 1.5
                }}>
                  <Typography variant="caption" color="text.secondary">
                    No tasks linked yet
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={0.75}>
                  {(linkedTasks ?? []).map((task) => (
                    <Box key={task.id}
                      onClick={() => navigate(`/tasks/${task.id}`, {
                        state: { fromRisk: risk.id, fromRiskRef: risk.reference }
                      })}
                      sx={{
                        p: 1, borderRadius: 1.5, cursor: "pointer",
                        border: "0.5px solid var(--color-border-tertiary)",
                        bgcolor: "var(--color-background-secondary)",
                        "&:hover": { bgcolor: "var(--color-background-primary)" },
                        transition: "background 0.1s"
                      }}
                    >
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                        <Box sx={{
                          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                          bgcolor: priorityDot(task.priority)
                        }} />
                        <Typography variant="caption" fontWeight={600} sx={{
                          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>
                          {task.title}
                        </Typography>
                      </Stack>
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ ml: 1.75 }}>
                        <Typography variant="caption" sx={{
                          fontFamily: "monospace", fontSize: 10, color: "text.secondary"
                        }}>
                          {task.reference}
                        </Typography>
                        <Chip size="small"
                          label={task.status.toLowerCase().replace("_", " ")}
                          sx={{ ...statusChipSx(task.status), height: 16, fontSize: 10 }} />
                      </Stack>
                    </Box>
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
              This will update the risk status to{" "}
              <strong>{STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</strong>.
            </Typography>

            {/* ASSESSED — prompt to confirm likelihood and impact */}
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

            {/* ACCEPTED — require acceptance note */}
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
    </Box>
  )
}