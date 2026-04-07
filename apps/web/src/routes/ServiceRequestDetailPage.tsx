import React from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack,
  Tab, Tabs, TextField, Tooltip, Typography
} from "@mui/material"
import LockIcon from "@mui/icons-material/Lock"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import AddIcon from "@mui/icons-material/Add"
import PersonIcon from "@mui/icons-material/Person"
import {
  InfoField, Badge, DetailHeader, PropertiesPanel, LinkedEntitiesPanel,
  chipSx, type LinkedTask, WorkflowStrip, type WorkflowStage
} from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { CreateTaskModal } from "./TasksPage"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useBreadcrumb } from "./Shell"

// ── Types ──────────────────────────────────────────────────────────────────
type AuditEvent = {
  id: string; action: string; actorEmail?: string | null
  data: any; createdAt: string
}

type Comment = {
  id: string; body: string; type: string
  visibleToCustomer: boolean; fromCustomer: boolean
  createdAt: string; author: { id: string; email: string }
}

type SR = {
  id: string; reference: string; subject: string; description: string
  status: string; priority: string; closureSummary: string | null
  createdAt: string; updatedAt: string
  assignee: { id: string; email: string } | null
  client: { id: string; name: string }
}

type User = { id: string; email: string }

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_ALL = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CLOSED"]

const STATUS_FLOW: Record<string, string[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "WAITING_CUSTOMER", "CANCELLED"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
  WAITING_CUSTOMER: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [], CANCELLED: []
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "New", ASSIGNED: "Assigned", IN_PROGRESS: "In progress",
  WAITING_CUSTOMER: "Waiting on customer", COMPLETED: "Completed",
  CLOSED: "Closed", CANCELLED: "Cancelled"
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

// ── Helpers ────────────────────────────────────────────────────────────────
function priorityChipSx(priority: string) {
  const m: Record<string, { bgcolor: string; color: string }> = {
    critical: { bgcolor: "#fee2e2", color: "#b91c1c" },
    high: { bgcolor: "#ffedd5", color: "#c2410c" },
    medium: { bgcolor: "#fef3c7", color: "#b45309" },
    low: { bgcolor: "#f0fdf4", color: "#15803d" }
  }
  return { ...(m[priority?.toLowerCase()] ?? { bgcolor: "#f1f5f9", color: "#475569" }), fontWeight: 600, fontSize: 11 }
}

function actionLabel(action: string, data: any): string {
  switch (action) {
    case "CREATED": return "Request created"
    case "STATUS_UPDATED": return `Status changed: ${data?.from ?? ""} → ${data?.to ?? ""}`
    case "UPDATED": return "Request updated"
    case "CLOSED": return "Request closed"
    case "CUSTOMER_UPDATE_ADDED": return "Customer update sent"
    default: return action.toLowerCase().replaceAll("_", " ")
  }
}

// ── Unified timeline item ──────────────────────────────────────────────────
type TimelineItem =
  | { kind: "audit"; event: AuditEvent }
  | { kind: "work_note"; comment: Comment }
  | { kind: "customer_update"; comment: Comment }

function getTimestamp(item: TimelineItem) {
  if (item.kind === "audit") return item.event.createdAt
  return item.comment.createdAt
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  if (item.kind === "audit") {
    const { event } = item
    return (
      <Box sx={{ display: "flex", gap: "10px", py: "10px" }}>
        <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: "2px" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#94a3b8" }} />
        </Box>
        <Box sx={{ flex: 1, pt: "4px" }}>
          <Typography sx={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>
            {actionLabel(event.action, event.data)}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: "2px" }}>
            {event.actorEmail ?? "System"} · {new Date(event.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
          </Typography>
        </Box>
      </Box>
    )
  }

  if (item.kind === "work_note") {
    const { comment } = item
    return (
      <Box sx={{ display: "flex", gap: "10px", py: "10px" }}>
        <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "#f1f5f9", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: "2px" }}>
          <LockIcon sx={{ fontSize: 13 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: "4px" }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
              {comment.author.email.split("@")[0]}
            </Typography>
            <Chip label="Work note" size="small" sx={{ height: 16, fontSize: 10, bgcolor: "#f1f5f9", color: "#475569" }} />
            <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
              {new Date(comment.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
            </Typography>
          </Stack>
          <Box sx={{ bgcolor: "#f8fafc", borderLeft: "3px solid #e2e8f0", px: "12px", py: "8px", borderRadius: "0 6px 6px 0" }}>
            <Typography sx={{ fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {comment.body}
            </Typography>
          </Box>
        </Box>
      </Box>
    )
  }

  // customer_update
  const { comment } = item
  return (
    <Box sx={{ display: "flex", gap: "10px", py: "10px" }}>
      <Box sx={{ width: 28, height: 28, borderRadius: "50%", bgcolor: "#eff6ff", color: "#1d4ed8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, mt: "2px" }}>
        <ChatBubbleOutlineIcon sx={{ fontSize: 13 }} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: "4px" }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>
            {comment.author.email.split("@")[0]}
          </Typography>
          <Chip label="Customer update" size="small" sx={{ height: 16, fontSize: 10, bgcolor: "#eff6ff", color: "#1d4ed8" }} />
          <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
            {new Date(comment.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
          </Typography>
        </Stack>
        <Box sx={{ bgcolor: "#eff6ff", borderLeft: "3px solid #1d4ed8", px: "12px", py: "8px", borderRadius: "0 6px 6px 0" }}>
          <Typography sx={{ fontSize: 13, color: "#1e3a5f", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {comment.body}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function ServiceRequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [activeTab, setActiveTab] = React.useState(0)
  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  // Transition
  const [transitionTarget, setTransitionTarget] = React.useState<string | null>(null)
  const [transitionComment, setTransitionComment] = React.useState("")
  const [closureSummary, setClosureSummary] = React.useState("")
  const [savingTransition, setSavingTransition] = React.useState(false)

  // Properties edit
  const [editingProperties, setEditingProperties] = React.useState(false)
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [editPriority, setEditPriority] = React.useState("")
  const [savingProperties, setSavingProperties] = React.useState(false)

  // Comments
  const [noteBody, setNoteBody] = React.useState("")
  const [customerBody, setCustomerBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)
  const [savingCustomer, setSavingCustomer] = React.useState(false)
  const [activeInput, setActiveInput] = React.useState<"note" | "customer" | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: sr, isLoading } = useQuery({
    queryKey: ["sr-detail", id],
    queryFn: async () => (await api.get<SR>(`/service-requests/${id}`)).data,
    enabled: !!id
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-sr", id],
    queryFn: async () => (await api.get<LinkedTask[]>("/tasks", { params: { linkedEntityType: "ServiceRequest", linkedEntityId: id } })).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-sr", id],
    queryFn: async () => (await api.get<Comment[]>(`/comments/ServiceRequest/${id}/work-notes`)).data,
    enabled: !!id
  })

  const { data: customerUpdates } = useQuery({
    queryKey: ["customer-updates-sr", id],
    queryFn: async () => (await api.get<Comment[]>(`/comments/ServiceRequest/${id}/customer-updates`)).data,
    enabled: !!id
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-sr", id],
    queryFn: async () => (await api.get<AuditEvent[]>(`/audit-events/entity/ServiceRequest/${id}`)).data,
    enabled: !!id
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  React.useEffect(() => {
    if (sr) {
      setRecordLabel(sr.reference)
      setClosureSummary(sr.closureSummary ?? "")
      setEditAssigneeId(sr.assignee?.id ?? "")
      setEditPriority(sr.priority)
    }
  }, [sr]) // eslint-disable-line

  // ── Build unified timeline ────────────────────────────────────────────────
  const timeline = React.useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [
      ...(auditEvents ?? []).map(e => ({ kind: "audit" as const, event: e })),
      ...(workNotes ?? []).map(c => ({ kind: "work_note" as const, comment: c })),
      ...(customerUpdates ?? []).map(c => ({ kind: "customer_update" as const, comment: c }))
    ]
    return items.sort((a, b) => new Date(getTimestamp(b)).getTime() - new Date(getTimestamp(a)).getTime())
  }, [auditEvents, workNotes, customerUpdates])

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleTransition() {
    if (!transitionTarget || !sr) return
    setSavingTransition(true); setError("")
    try {
      const needsClosure = transitionTarget === "COMPLETED" || transitionTarget === "CLOSED"
      await api.post(`/service-requests/${id}/status`, {
        status: transitionTarget,
        closureSummary: needsClosure ? closureSummary : undefined
      })
      if (transitionComment.trim()) {
        await api.post("/comments/work-note", {
          entityType: "ServiceRequest", entityId: id, body: transitionComment.trim(), serviceRequestId: id
        })
      }
      setTransitionTarget(null); setTransitionComment("")
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-sr", id] })
      qc.invalidateQueries({ queryKey: ["service-requests"] })
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Failed")
    } finally { setSavingTransition(false) }
  }

  async function handleSaveProperties() {
    setSavingProperties(true); setError("")
    try {
      await api.put(`/service-requests/${id}`, {
        assigneeId: editAssigneeId || undefined, priority: editPriority
      })
      setEditingProperties(false)
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally { setSavingProperties(false) }
  }

  async function handleAddNote() {
    if (!noteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "ServiceRequest", entityId: id, body: noteBody.trim(), serviceRequestId: id
      })
      setNoteBody(""); setActiveInput(null)
      qc.invalidateQueries({ queryKey: ["work-notes-sr", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
    } finally { setSavingNote(false) }
  }

  async function handleCustomerUpdate() {
    if (!customerBody.trim()) return
    setSavingCustomer(true)
    try {
      await api.post("/comments/customer-update", {
        entityType: "ServiceRequest", entityId: id, body: customerBody.trim(), serviceRequestId: id
      })
      setCustomerBody(""); setActiveInput(null)
      qc.invalidateQueries({ queryKey: ["customer-updates-sr", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
    } finally { setSavingCustomer(false) }
  }

  function copyRef() {
    if (!sr) return
    navigator.clipboard.writeText(sr.reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (isLoading) return <LoadingState />
  if (!sr) return <ErrorState title="Service request not found" />

  const nextStatuses = STATUS_FLOW[sr.status] ?? []
  const needsClosure = transitionTarget === "COMPLETED" || transitionTarget === "CLOSED"
  const closureRequired = needsClosure && !closureSummary.trim()

  return (
    <Box>
      {/* ── Record header ────────────────────────────────────────────────── */}
      <Box sx={{ mb: "16px" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
            {/* Reference + copy */}
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: "8px" }}>
              <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
                {sr.reference}
              </Typography>
              <Tooltip title={copied ? "Copied!" : "Copy reference"}>
                <IconButton size="small" onClick={copyRef} sx={{ color: "#94a3b8", width: 20, height: 20 }}>
                  <ContentCopyIcon sx={{ fontSize: 12 }} />
                </IconButton>
              </Tooltip>
              <Chip size="small" sx={chipSx(sr.status)} label={STATUS_LABELS[sr.status]} />
              <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
            </Stack>
            {/* Subject */}
            <Typography variant="h5" fontWeight={700} sx={{ color: "#0f172a", lineHeight: 1.25 }}>
              {sr.subject}
            </Typography>
          </Box>
          {/* Cancel button */}
          {nextStatuses.includes("CANCELLED") && canManage ? (
            <Button size="small" color="error" variant="outlined"
              onClick={() => setTransitionTarget("CANCELLED")} sx={{ flexShrink: 0 }}>
              Cancel request
            </Button>
          ) : null}
        </Stack>
      </Box>

      {/* ── Workflow strip ───────────────────────────────────────────────── */}
      <WorkflowStrip
        stages={STATUS_ALL.map(s => ({ id: s, label: STATUS_LABELS[s], description: STATUS_DESCRIPTIONS[s] }))}
        currentStage={sr.status}
        nextStages={nextStatuses}
        onTransition={setTransitionTarget}
        canTransition={canManage}
        mb={2}
        specialStageColors={{ COMPLETED: "#14532d", CLOSED: "#14532d" }}
      />

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 280px" }, gap: 3, alignItems: "start" }}>

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <Stack spacing={2}>
          {/* Description */}
          <Card>
            <CardContent>
              <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#94a3b8", mb: "8px" }}>
                Description
              </Typography>
              <Typography variant="body2" sx={{ color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {sr.description}
              </Typography>
            </CardContent>
          </Card>

          {/* Activity */}
          <Card>
            <Box sx={{ borderBottom: "1px solid #e2e8f0" }}>
              <Tabs value={activeTab} onChange={(_, v) => { setActiveTab(v); setActiveInput(null); setNoteBody(""); setCustomerBody("") }}
                sx={{ px: 2, minHeight: 44 }} textColor="inherit"
                TabIndicatorProps={{ style: { backgroundColor: "#1d4ed8" } }}>
                <Tab label="Activity" icon={<Badge count={timeline.length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
                <Tab label="Work notes" icon={<Badge count={(workNotes ?? []).length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
                <Tab label="Customer updates" icon={<Badge count={(customerUpdates ?? []).length} />} iconPosition="end" sx={{ fontSize: 13, minHeight: 44 }} />
              </Tabs>
            </Box>
            <CardContent>

              {/* ── Tab 0: Activity — merged timeline, read-only ── */}
              {activeTab === 0 ? (
                timeline.length === 0 ? (
                  <Typography sx={{ fontSize: 13, color: "#94a3b8", textAlign: "center", py: 3 }}>
                    No activity yet
                  </Typography>
                ) : (
                  <Box sx={{ "& > *": { borderBottom: "1px solid #f1f5f9" }, "& > *:last-child": { borderBottom: "none" } }}>
                    {timeline.map((item, i) => <TimelineEntry key={i} item={item} />)}
                  </Box>
                )
              ) : null}

              {/* ── Tab 1: Work notes ── */}
              {activeTab === 1 ? (
                <Stack spacing={2}>
                  {/* Existing notes */}
                  {(workNotes ?? []).length === 0 && !activeInput ? (
                    <Typography sx={{ fontSize: 13, color: "#94a3b8", textAlign: "center", py: 2 }}>
                      No work notes yet
                    </Typography>
                  ) : null}
                  {(workNotes ?? []).length > 0 ? (
                    <Box sx={{ "& > *": { borderBottom: "1px solid #f1f5f9" }, "& > *:last-child": { borderBottom: "none" } }}>
                      {(workNotes ?? [])
                        .slice()
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((c, i) => <TimelineEntry key={i} item={{ kind: "work_note", comment: c }} />)}
                    </Box>
                  ) : null}

                  {/* Add note */}
                  {canManage ? (
                    activeInput === "note" ? (
                      <Box sx={{ p: "12px", bgcolor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        <TextField multiline rows={3} fullWidth size="small" autoFocus
                          placeholder="Add a work note visible only to the team..."
                          value={noteBody} onChange={e => setNoteBody(e.target.value)}
                          onKeyDown={e => { if (e.key === "Escape") { setActiveInput(null); setNoteBody("") } }} />
                        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: "8px" }}>
                          <Button size="small" variant="text" onClick={() => { setActiveInput(null); setNoteBody("") }} sx={{ fontSize: 12, color: "#64748b" }}>Cancel</Button>
                          <Button size="small" variant="contained" onClick={handleAddNote}
                            disabled={savingNote || !noteBody.trim()} sx={{ fontSize: 12 }}>
                            {savingNote ? "Saving..." : "Save note"}
                          </Button>
                        </Stack>
                      </Box>
                    ) : (
                      <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                        onClick={() => setActiveInput("note")}
                        sx={{ alignSelf: "flex-start", fontSize: 12, color: "#475569", borderColor: "#e2e8f0" }}>
                        Add work note
                      </Button>
                    )
                  ) : null}
                </Stack>
              ) : null}

              {/* ── Tab 2: Customer updates ── */}
              {activeTab === 2 ? (
                <Stack spacing={2}>
                  {/* Existing updates */}
                  {(customerUpdates ?? []).length === 0 && !activeInput ? (
                    <Typography sx={{ fontSize: 13, color: "#94a3b8", textAlign: "center", py: 2 }}>
                      No customer updates yet
                    </Typography>
                  ) : null}
                  {(customerUpdates ?? []).length > 0 ? (
                    <Box sx={{ "& > *": { borderBottom: "1px solid #f1f5f9" }, "& > *:last-child": { borderBottom: "none" } }}>
                      {(customerUpdates ?? [])
                        .slice()
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((c, i) => <TimelineEntry key={i} item={{ kind: "customer_update", comment: c }} />)}
                    </Box>
                  ) : null}

                  {/* Send update */}
                  {canManage ? (
                    activeInput === "customer" ? (
                      <Box sx={{ p: "12px", bgcolor: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#1d4ed8", mb: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Visible to client
                        </Typography>
                        <TextField multiline rows={3} fullWidth size="small" autoFocus
                          placeholder="Write an update that the customer will see..."
                          value={customerBody} onChange={e => setCustomerBody(e.target.value)}
                          onKeyDown={e => { if (e.key === "Escape") { setActiveInput(null); setCustomerBody("") } }} />
                        <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: "8px" }}>
                          <Button size="small" variant="text" onClick={() => { setActiveInput(null); setCustomerBody("") }} sx={{ fontSize: 12, color: "#64748b" }}>Cancel</Button>
                          <Button size="small" variant="contained" onClick={handleCustomerUpdate}
                            disabled={savingCustomer || !customerBody.trim()} sx={{ fontSize: 12, bgcolor: "#1d4ed8" }}>
                            {savingCustomer ? "Sending..." : "Send update"}
                          </Button>
                        </Stack>
                      </Box>
                    ) : (
                      <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                        onClick={() => setActiveInput("customer")}
                        sx={{ alignSelf: "flex-start", fontSize: 12, bgcolor: "#1d4ed8" }}>
                        Send customer update
                      </Button>
                    )
                  ) : null}
                </Stack>
              ) : null}

            </CardContent>
          </Card>
        </Stack>

        {/* ── Right column ────────────────────────────────────────────────── */}
        <Stack spacing={2}>
          {/* Properties */}
          {editingProperties ? (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <TextField select label="Assignee" value={editAssigneeId}
                    onChange={e => setEditAssigneeId(e.target.value)} size="small" fullWidth>
                    <MenuItem value="">Unassigned</MenuItem>
                    {(users ?? []).map(u => <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>)}
                  </TextField>
                  <TextField select label="Priority" value={editPriority}
                    onChange={e => setEditPriority(e.target.value)} size="small" fullWidth>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                  </TextField>
                  <Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" onClick={() => setEditingProperties(false)}>Cancel</Button>
                    <Button size="small" variant="contained" onClick={handleSaveProperties} disabled={savingProperties}>
                      {savingProperties ? "Saving..." : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <PropertiesPanel
              onEdit={canManage && !["CLOSED", "CANCELLED"].includes(sr.status) ? () => setEditingProperties(true) : undefined}
              rows={[
                { label: "Client", value: <Typography variant="caption" fontWeight={600}>{sr.client.name}</Typography> },
                {
                  label: "Assignee",
                  value: sr.assignee ? (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Box sx={{ width: 18, height: 18, borderRadius: "50%", bgcolor: "#e8f1ff", color: "#1d4ed8", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {sr.assignee.email.slice(0, 2).toUpperCase()}
                      </Box>
                      <Typography variant="caption">{sr.assignee.email.split("@")[0]}</Typography>
                    </Stack>
                  ) : (
                    <Typography variant="caption" color="text.secondary">Unassigned</Typography>
                  )
                },
                { label: "Priority", value: <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} /> },
                { label: "Raised", value: <Typography variant="caption">{new Date(sr.createdAt).toLocaleDateString("en-GB")}</Typography> },
                { label: "Updated", value: <Typography variant="caption">{new Date(sr.updatedAt).toLocaleDateString("en-GB")}</Typography> },
                ...(sr.closureSummary ? [{ label: "Closure", value: <Typography variant="caption" sx={{ color: "#15803d" }}>{sr.closureSummary}</Typography> }] : [])
              ]}
            />
          )}

          {/* Quick assign — shown when NEW and unassigned */}
          {sr.status === "NEW" && !sr.assignee && canManage ? (
            <Card sx={{ border: "1px solid #fcd34d", bgcolor: "#fffbeb" }}>
              <CardContent sx={{ py: "12px !important" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#b45309", mb: "8px" }}>
                  Unassigned request
                </Typography>
                <TextField select label="Assign to" value={editAssigneeId}
                  onChange={e => setEditAssigneeId(e.target.value)} size="small" fullWidth sx={{ mb: "8px" }}>
                  <MenuItem value="">Select assignee...</MenuItem>
                  {(users ?? []).map(u => <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>)}
                </TextField>
                <Button size="small" variant="contained" fullWidth
                  disabled={!editAssigneeId || savingProperties}
                  onClick={async () => {
                    setSavingProperties(true)
                    try {
                      await api.put(`/service-requests/${id}`, { assigneeId: editAssigneeId, priority: sr.priority })
                      await api.post(`/service-requests/${id}/status`, { status: "ASSIGNED" })
                      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
                      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
                      qc.invalidateQueries({ queryKey: ["service-requests"] })
                    } finally { setSavingProperties(false) }
                  }}>
                  Assign & move to Assigned
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {/* Linked tasks */}
          <LinkedEntitiesPanel
            items={linkedTasks ?? []}
            onNavigate={task => navigate(`/tasks/${task.id}`, { state: { fromSR: sr.id, fromSRRef: sr.reference } })}
            onCreate={canManage ? () => setTaskOpen(true) : undefined}
          />
        </Stack>
      </Box>

      {/* ── Transition dialog ────────────────────────────────────────────── */}
      <Dialog open={!!transitionTarget} onClose={() => setTransitionTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>
          Move to {STATUS_LABELS[transitionTarget ?? ""] ?? transitionTarget}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {transitionTarget === "CANCELLED" ? (
              <Alert severity="warning">This request will be cancelled. This cannot be undone.</Alert>
            ) : null}
            {transitionTarget === "WAITING_CUSTOMER" ? (
              <Alert severity="info" sx={{ fontSize: 12 }}>
                The request will be paused waiting for a customer response. Send a customer update to notify them.
              </Alert>
            ) : null}
            {needsClosure ? (
              <TextField
                label="Closure summary *"
                multiline rows={3} fullWidth
                value={closureSummary}
                onChange={e => setClosureSummary(e.target.value)}
                placeholder="Describe what was done to resolve this request..."
                error={closureRequired}
                helperText={closureRequired ? "Closure summary is required" : ""}
              />
            ) : null}
            <TextField
              label="Add a note (optional)" multiline rows={2} fullWidth size="small"
              value={transitionComment} onChange={e => setTransitionComment(e.target.value)}
              placeholder="Add context for this status change..."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTransitionTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleTransition}
            disabled={savingTransition || (needsClosure && closureRequired)}>
            {savingTransition ? "Saving..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create task modal */}
      <CreateTaskModal
        open={taskOpen} onClose={() => setTaskOpen(false)}
        linkedEntityType="ServiceRequest" linkedEntityId={sr.id}
        linkedEntityLabel={sr.reference}
      />
    </Box>
  )
}