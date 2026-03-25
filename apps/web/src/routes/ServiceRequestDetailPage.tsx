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
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
import EditIcon from "@mui/icons-material/Edit"
import AddIcon from "@mui/icons-material/Add"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { ErrorState, LoadingState } from "../components/PageState"
import { CreateTaskModal } from "./TasksPage"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

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
  visibleToCustomer: boolean
  fromCustomer: boolean
  createdAt: string
  author: { id: string; email: string }
}

type SR = {
  id: string
  reference: string
  subject: string
  description: string
  status: string
  priority: string
  closureSummary: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; email: string } | null
  client: { id: string; name: string }
}

type Task = {
  id: string
  reference: string
  title: string
  status: string
  priority: string
  assignee: { id: string; email: string } | null
}

type User = { id: string; email: string }

const STATUS_ALL = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CLOSED"]

const STATUS_FLOW: Record<string, string[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: []
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  WAITING_CUSTOMER: "Waiting on customer",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  NEW: "Received, not yet actioned",
  ASSIGNED: "Allocated to an engineer",
  IN_PROGRESS: "Actively being worked on",
  WAITING_CUSTOMER: "Awaiting customer response",
  COMPLETED: "Work done, pending closure",
  CLOSED: "Resolved and closed",
  CANCELLED: "Cancelled"
}

function priorityDot(priority: string) {
  const colors: Record<string, string> = {
    low: "#94a3b8", medium: "#f59e0b", high: "#ef4444", critical: "#7c3aed"
  }
  return colors[priority.toLowerCase()] ?? "#94a3b8"
}

function actionLabel(action: string, data: any): string {
  switch (action) {
    case "CREATED": return "Request created"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return "Request updated"
    case "CLOSED": return "Request closed"
    default: return action.toLowerCase().replaceAll("_", " ")
  }
}

function actionColor(action: string): string {
  if (action === "CREATED") return "#e0e7ff"
  if (action === "STATUS_UPDATED") return "#e8f1ff"
  if (action === "CLOSED") return "#dcfce7"
  return "#f1f5f9"
}

function actionTextColor(action: string): string {
  if (action === "CREATED") return "#4338ca"
  if (action === "STATUS_UPDATED") return "#1d4ed8"
  if (action === "CLOSED") return "#15803d"
  return "#475569"
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography sx={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
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

export default function ServiceRequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fromTask = location.state?.fromTask
  const fromTaskRef = location.state?.fromTaskRef
  const qc = useQueryClient()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [activeTab, setActiveTab] = React.useState(0)
  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)

  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [closureSummary, setClosureSummary] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)

  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [editPriority, setEditPriority] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const [customerBody, setCustomerBody] = React.useState("")
  const [savingCustomer, setSavingCustomer] = React.useState(false)

  const { data: sr, isLoading } = useQuery({
    queryKey: ["sr-detail", id],
    queryFn: async () => (await api.get<SR>(`/service-requests/${id}`)).data,
    enabled: !!id
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-sr", id],
    queryFn: async () =>
      (await api.get<Task[]>("/tasks", {
        params: { linkedEntityType: "ServiceRequest", linkedEntityId: id }
      })).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-sr", id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/comments/ServiceRequest/${id}/work-notes`)).data,
    enabled: !!id
  })

  const { data: customerUpdates } = useQuery({
    queryKey: ["customer-updates-sr", id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/comments/ServiceRequest/${id}/customer-updates`)).data,
    enabled: !!id
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-sr", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/ServiceRequest/${id}`)).data,
    enabled: !!id
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  React.useEffect(() => {
    if (sr) {
      setClosureSummary(sr.closureSummary ?? "")
      setEditAssigneeId(sr.assignee?.id ?? "")
      setEditPriority(sr.priority)
    }
  }, [sr])

  async function handleTransition() {
    if (!transitionTarget || !sr) return
    setSavingTransition(true)
    setError("")
    try {
      if (transitionTarget === "CLOSED") {
        await api.post(`/service-requests/${id}/close`, {
          closureSummary: closureSummary.trim()
        })
      } else {
        await api.post(`/service-requests/${id}/status`, {
          status: transitionTarget,
          closureSummary: transitionTarget === "COMPLETED" ? closureSummary : undefined
        })
      }
      if (transitionComment.trim()) {
        await api.post("/comments/work-note", {
          entityType: "ServiceRequest",
          entityId: id,
          body: transitionComment.trim(),
          serviceRequestId: id
        })
      }
      setTransitionTarget(null)
      setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-sr", id] })
      qc.invalidateQueries({ queryKey: ["service-requests"] })
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Failed")
    } finally {
      setSavingTransition(false)
    }
  }

  async function handleSaveProperties() {
    setSavingProperties(true)
    setError("")
    try {
      await api.put(`/service-requests/${id}`, {
        assigneeId: editAssigneeId || undefined,
        priority: editPriority
      })
      setEditingProperties(false)
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
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
        entityType: "ServiceRequest",
        entityId: id,
        body: workNoteBody,
        serviceRequestId: id
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-sr", id] })
    } finally {
      setSavingNote(false)
    }
  }

  async function handleCustomerUpdate() {
    if (!customerBody.trim()) return
    setSavingCustomer(true)
    try {
      await api.post("/comments/customer-update", {
        entityType: "ServiceRequest",
        entityId: id,
        body: customerBody,
        serviceRequestId: id
      })
      setCustomerBody("")
      qc.invalidateQueries({ queryKey: ["customer-updates-sr", id] })
    } finally {
      setSavingCustomer(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!sr) return <ErrorState title="Service request not found" />

  const nextStatuses = STATUS_FLOW[sr.status] ?? []
  const currentIndex = STATUS_ALL.indexOf(sr.status)
  const needsClosure = transitionTarget === "COMPLETED" || transitionTarget === "CLOSED"

  return (
    <Box>
      {/* Top bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => fromTask ? navigate(`/tasks/${fromTask}`) : navigate("/service-desk")}
            sx={{ color: "text.secondary" }} size="small"
          >
            {fromTask ? `Back to task ${fromTaskRef}` : "Back to service desk"}
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
              {sr.reference}
            </Typography>
            <Box sx={{ width: 1, height: 14, bgcolor: "var(--color-border-tertiary)" }} />
            <Chip size="small" sx={statusChipSx(sr.status)}
              label={STATUS_LABELS[sr.status] ?? sr.status} />
            <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
          </Box>
        </Stack>
        {nextStatuses.includes("CANCELLED") && canManage ? (
          <Button size="small" color="error" variant="outlined"
            onClick={() => setTransitionTarget("CANCELLED")}>
            Cancel request
          </Button>
        ) : null}
      </Stack>

      {/* Unified info container */}
      <Box sx={{
        bgcolor: "var(--color-background-secondary)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderTopLeftRadius: 8, borderTopRightRadius: 8,
        p: 1.5
      }}>
        <InfoField label="SERVICE REQUEST">
          <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            {sr.subject}
          </Typography>
        </InfoField>
        <Divider sx={{ my: 1.5 }} />
        <InfoField label="DESCRIPTION">
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
            {sr.description}
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
        px: 2.5, pt: 0.5, pb: 2, mb: 1.5
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
            placement="right"
            arrow
          >
            <InfoOutlinedIcon sx={{ fontSize: 13, color: "var(--color-text-tertiary)", cursor: "help" }} />
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={0} alignItems="stretch">
          {STATUS_ALL.filter(s => s !== "CANCELLED").map((status, idx, arr) => {
            const isCurrent = status === sr.status
            const isPast = idx < currentIndex
            const isNext = nextStatuses.includes(status) && canManage
            return (
              <React.Fragment key={status}>
                <Tooltip title={STATUS_DESCRIPTIONS[status]} placement="bottom" arrow>
                  <Box
                    onClick={isNext ? () => setTransitionTarget(status) : undefined}
                    sx={{
                      flex: 1, px: 1.25, py: 1.25, borderRadius: 1.5,
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
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {isCurrent ? (
                        <Box sx={{
                          width: 14, height: 14, borderRadius: "50%", bgcolor: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                        }}>
                          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#0f172a" }} />
                        </Box>
                      ) : isPast ? (
                        <Box sx={{
                          width: 14, height: 14, borderRadius: "50%", bgcolor: "#cbd5e1",
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                        }}>
                          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#fff" }} />
                        </Box>
                      ) : (
                        <Box sx={{
                          width: 14, height: 14, borderRadius: "50%",
                          border: isNext ? "1.5px solid #3b82f6" : "1.5px solid #e2e8f0",
                          flexShrink: 0
                        }} />
                      )}
                      <Typography sx={{
                        fontSize: 11, fontWeight: isCurrent ? 700 : 500,
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
                {idx < arr.length - 1 ? (
                  <Box sx={{
                    width: 16, display: "flex", alignItems: "center",
                    justifyContent: "center", flexShrink: 0
                  }}>
                    <Box sx={{ width: 10, height: 1, bgcolor: "var(--color-border-tertiary)" }} />
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
              <Tab label="Customer updates"
                icon={<Badge count={(customerUpdates ?? []).length} />}
                iconPosition="end"
                sx={{ fontSize: 13, minHeight: 44 }} />
              <Tab label="History"
                icon={<Badge count={(auditEvents ?? []).length} />}
                iconPosition="end"
                sx={{ fontSize: 13, minHeight: 44 }} />
              {sr.closureSummary || nextStatuses.includes("COMPLETED") || nextStatuses.includes("CLOSED") ? (
                <Tab label="Closure" sx={{ fontSize: 13, minHeight: 44 }} />
              ) : null}
            </Tabs>
          </Box>
          <CardContent>

            {activeTab === 0 ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <TextField fullWidth multiline rows={2} size="small"
                    value={workNoteBody}
                    onChange={(e) => setWorkNoteBody(e.target.value)}
                    placeholder="Add an internal work note — not visible to the customer..." />
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
                              {note.fromCustomer ? "Customer" : note.author.email}
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

            {activeTab === 1 ? (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1}>
                  <TextField fullWidth multiline rows={2} size="small"
                    value={customerBody}
                    onChange={(e) => setCustomerBody(e.target.value)}
                    placeholder="Send an update to the customer..." />
                  <Button variant="contained" size="small"
                    onClick={handleCustomerUpdate}
                    disabled={savingCustomer || !customerBody.trim()}
                    sx={{ alignSelf: "flex-end", whiteSpace: "nowrap" }}>
                    Send
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
                  This message will be visible to the customer in the portal.
                </Typography>
                <Divider />
                {(customerUpdates ?? []).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No customer updates yet.
                  </Typography>
                ) : (
                  <Stack spacing={0}>
                    {(customerUpdates ?? []).slice().reverse().map((update, i, arr) => (
                      <Box key={update.id} sx={{
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
                          bgcolor: "#eff6ff", display: "flex",
                          alignItems: "center", justifyContent: "center", zIndex: 1
                        }}>
                          <ChatBubbleOutlineIcon sx={{ fontSize: 13, color: "#3b82f6" }} />
                        </Box>
                        <Box sx={{ pt: 0.25, flex: 1 }}>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                            <Typography variant="caption" fontWeight={600}>
                              {update.fromCustomer ? "Customer" : "Team update"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {update.fromCustomer ? "Customer" : update.author.email}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(update.createdAt).toLocaleString("en-GB")}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary"
                            sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                            {update.body}
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

            {activeTab === 3 ? (
              <Stack spacing={1.5}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                  color: "var(--color-text-tertiary)"
                }}>
                  CLOSURE SUMMARY
                </Typography>
                {sr.status === "CLOSED" || sr.status === "CANCELLED" ? (
                  <Box sx={{
                    p: 1.5, borderRadius: 1.5,
                    border: "1px solid #bbf7d0", bgcolor: "#f0fdf4"
                  }}>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                      {sr.closureSummary ?? "No closure summary recorded."}
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary">
                      Required before marking as completed or closed.
                    </Typography>
                    <TextField fullWidth multiline rows={4}
                      value={closureSummary}
                      onChange={(e) => setClosureSummary(e.target.value)}
                      placeholder="Describe how this request was resolved..."
                      size="small" />
                  </>
                )}
              </Stack>
            ) : null}
          </CardContent>
        </Card>

        {/* Right column */}
        <Stack spacing={2} sx={{ alignSelf: "start" }}>
          <Card>
            <CardContent sx={{ pb: "12px !important" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
                  color: "var(--color-text-tertiary)"
                }}>
                  PROPERTIES
                </Typography>
                {canManage && !editingProperties && sr.status !== "CLOSED" && sr.status !== "CANCELLED" ? (
                  <Button size="small" startIcon={<EditIcon sx={{ fontSize: 13 }} />}
                    onClick={() => setEditingProperties(true)}>
                    Edit
                  </Button>
                ) : null}
              </Stack>
              {editingProperties ? (
                <Stack spacing={1.5}>
                  <TextField select size="small" label="Assignee" fullWidth
                    value={editAssigneeId}
                    onChange={(e) => setEditAssigneeId(e.target.value)}>
                    <MenuItem value="">Unassigned</MenuItem>
                    {(users ?? []).map((u) => (
                      <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label="Priority" fullWidth
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                  </TextField>
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" onClick={() => setEditingProperties(false)}>Cancel</Button>
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
                      label: "Client",
                      value: <Typography variant="caption" fontWeight={600}>{sr.client.name}</Typography>
                    },
                    {
                      label: "Assignee",
                      value: <Typography variant="caption">
                        {sr.assignee?.email.split("@")[0] ?? "Unassigned"}
                      </Typography>
                    },
                    {
                      label: "Priority",
                      value: <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
                    },
                    {
                      label: "Raised",
                      value: <Typography variant="caption">
                        {new Date(sr.createdAt).toLocaleDateString("en-GB")}
                      </Typography>
                    },
                    {
                      label: "Updated",
                      value: <Typography variant="caption">
                        {new Date(sr.updatedAt).toLocaleDateString("en-GB")}
                      </Typography>
                    }
                  ].map((row) => (
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

          <Card>
            <CardContent sx={{ pb: "12px !important" }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.25 }}>
                <Typography sx={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
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
                  <Typography variant="caption" color="text.secondary">No tasks linked yet</Typography>
                </Box>
              ) : (
                <Stack spacing={0.75}>
                  {(linkedTasks ?? []).map((task) => (
                    <Box key={task.id}
                      onClick={() => navigate(`/tasks/${task.id}`, {
                        state: { fromSR: sr.id, fromSRRef: sr.reference }
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

      <Dialog open={!!transitionTarget} onClose={() => setTransitionTarget(null)}
        maxWidth="xs" fullWidth>
        <DialogTitle>
          Move to {STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              This will update the request status to{" "}
              <strong>{STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}</strong>.
            </Typography>
            {transitionTarget === "CANCELLED" ? (
              <Box sx={{
                p: 1.25, borderRadius: 1.5,
                bgcolor: "#fef2f2", border: "1px solid #fecaca"
              }}>
                <Typography variant="caption" color="#b91c1c">
                  This request will be cancelled. This action should be noted.
                </Typography>
              </Box>
            ) : null}
            {needsClosure ? (
              <TextField
                label={`Closure summary${transitionTarget === "COMPLETED" ? " (required)" : ""}`}
                multiline rows={3} fullWidth
                value={closureSummary}
                onChange={(e) => setClosureSummary(e.target.value)}
                placeholder="Describe how this request was resolved..." />
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
              (needsClosure && transitionTarget === "COMPLETED" && !closureSummary.trim())
            }
            color={transitionTarget === "CANCELLED" ? "error" : "primary"}
            onClick={handleTransition}>
            {savingTransition ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      <CreateTaskModal
        open={taskOpen}
        onClose={() => setTaskOpen(false)}
        linkedEntityType="ServiceRequest"
        linkedEntityId={sr.id}
        linkedEntityLabel={sr.reference}
        onSuccess={() => qc.invalidateQueries({ queryKey: ["linked-tasks-sr", id] })}
      />
    </Box>
  )
}