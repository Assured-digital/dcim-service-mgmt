import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogContent,
  DialogTitle, Divider, MenuItem, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import LockIcon from "@mui/icons-material/Lock"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { ErrorState, LoadingState } from "../components/PageState"

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
  auditEvents: AuditEvent[]
}

type User = { id: string; email: string }

const STATUS_FLOW: Record<string, string[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED"],
  WAITING_CUSTOMER: ["IN_PROGRESS"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: []
}

const STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Assign",
  IN_PROGRESS: "Start working",
  WAITING_CUSTOMER: "Waiting on customer",
  COMPLETED: "Mark completed",
  CLOSED: "Close ticket",
  CANCELLED: "Cancel"
}

function AuditEventList({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["audit", entityType, entityId],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/${entityType}/${entityId}`)).data
  })

  if (isLoading) return <LoadingState />
  if (!data?.length) return (
    <Typography variant="body2" color="text.secondary">No audit history yet.</Typography>
  )

  return (
    <Stack spacing={0}>
      {data.map((event, i) => (
        <Box
          key={event.id}
          sx={{
            display: "flex",
            gap: 1.5,
            pb: 2,
            position: "relative",
            "&:before": i < data.length - 1 ? {
              content: '""',
              position: "absolute",
              left: 15,
              top: 32,
              bottom: 0,
              width: "1px",
              bgcolor: "#e2e8f0"
            } : {}
          }}
        >
          <Box sx={{
            width: 32, height: 32, borderRadius: "50%",
            bgcolor: "#e8f1ff", display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, color: "#1d4ed8",
            flexShrink: 0, zIndex: 1
          }}>
            {event.action.charAt(0)}
          </Box>
          <Box sx={{ pt: 0.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                size="small"
                sx={statusChipSx(event.action)}
                label={event.action.toLowerCase().replaceAll("_", " ")}
              />
              {event.actorEmail ? (
                <Typography variant="caption" fontWeight={600}>{event.actorEmail}</Typography>
              ) : null}
              <Typography variant="caption" color="text.secondary">
                {new Date(event.createdAt).toLocaleString("en-GB")}
              </Typography>
            </Stack>
            {event.data ? (
              <Typography
                variant="caption"
                component="pre"
                sx={{
                  display: "block", mt: 0.75,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  bgcolor: "#f8fafc", border: "1px solid #e2e8f0",
                  borderRadius: 1, px: 1, py: 0.75, fontSize: 11
                }}
              >
                {JSON.stringify(event.data, null, 2)}
              </Typography>
            ) : null}
          </Box>
        </Box>
      ))}
    </Stack>
  )
}

function CommentThread({
  comments,
  placeholder,
  buttonLabel,
  isInternal,
  onSubmit,
  saving
}: {
  comments: Comment[]
  placeholder: string
  buttonLabel: string
  isInternal: boolean
  onSubmit: (body: string) => Promise<void>
  saving: boolean
}) {
  const [body, setBody] = React.useState("")

  async function handleSubmit() {
    if (!body.trim()) return
    await onSubmit(body)
    setBody("")
  }

  return (
    <Stack spacing={2}>
      {comments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No entries yet.</Typography>
      ) : (
        comments.map((c) => (
          <Box
            key={c.id}
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              border: "1px solid",
              borderColor: isInternal ? "#e2e8f0" : "#dbeafe",
              bgcolor: isInternal ? "#f8fafc" : "#eff6ff"
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
              {isInternal
                ? <LockIcon sx={{ fontSize: 13, color: "#64748b" }} />
                : <ChatBubbleOutlineIcon sx={{ fontSize: 13, color: "#3b82f6" }} />
              }
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                {c.fromCustomer ? "Customer" : c.author.email}
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
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        size="small"
      />
      {isInternal ? null : (
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
          This message will be visible to the customer in the portal.
        </Typography>
      )}
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          size="small"
          onClick={handleSubmit}
          disabled={saving || !body.trim()}
        >
          {saving ? "Saving..." : buttonLabel}
        </Button>
      </Box>
    </Stack>
  )
}

export default function ServiceRequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = React.useState(0)
  const [activityTab, setActivityTab] = React.useState(0)
  const [closureSummary, setClosureSummary] = React.useState("")
  const [savingStatus, setSavingStatus] = React.useState(false)
  const [savingWorkNote, setSavingWorkNote] = React.useState(false)
  const [savingCustomerUpdate, setSavingCustomerUpdate] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [editPriority, setEditPriority] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const { data: sr, isLoading } = useQuery({
    queryKey: ["sr-detail", id],
    queryFn: async () => (await api.get<SR>(`/service-requests/${id}`)).data,
    enabled: !!id
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes", id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/comments/ServiceRequest/${id}/work-notes`)).data,
    enabled: !!id
  })

  const { data: customerUpdates } = useQuery({
    queryKey: ["customer-updates", id],
    queryFn: async () =>
      (await api.get<Comment[]>(`/comments/ServiceRequest/${id}/customer-updates`)).data,
    enabled: !!id
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  React.useEffect(() => {
    if (sr) setClosureSummary(sr.closureSummary ?? "")
  }, [sr])

  function openEdit() {
    if (!sr) return
    setEditAssigneeId(sr.assignee?.id ?? "")
    setEditPriority(sr.priority)
    setEditOpen(true)
  }

  async function handleEdit() {
    setSaving(true)
    setError("")
    try {
      await api.put(`/service-requests/${id}`, {
        assigneeId: editAssigneeId || undefined,
        priority: editPriority
      })
      setEditOpen(false)
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusUpdate(status: string) {
    setSavingStatus(true)
    setError("")
    try {
      await api.post(`/service-requests/${id}/status`, {
        status,
        closureSummary: closureSummary || undefined
      })
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
      qc.invalidateQueries({ queryKey: ["service-requests"] })
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Failed")
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleWorkNote(body: string) {
    if (!sr) return
    setSavingWorkNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "ServiceRequest",
        entityId: sr.id,
        body,
        serviceRequestId: sr.id
      })
      qc.invalidateQueries({ queryKey: ["work-notes", id] })
    } finally {
      setSavingWorkNote(false)
    }
  }

  async function handleCustomerUpdate(body: string) {
    if (!sr) return
    setSavingCustomerUpdate(true)
    try {
      await api.post("/comments/customer-update", {
        entityType: "ServiceRequest",
        entityId: sr.id,
        body,
        serviceRequestId: sr.id
      })
      qc.invalidateQueries({ queryKey: ["customer-updates", id] })
    } finally {
      setSavingCustomerUpdate(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!sr) return <ErrorState title="Service request not found" />

  const nextStatuses = STATUS_FLOW[sr.status] ?? []
  const needsClosure = ["COMPLETED", "CLOSED"].includes(sr.status) ||
    nextStatuses.includes("COMPLETED") || nextStatuses.includes("CLOSED")

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/service-requests")}
        sx={{ mb: 2, color: "text.secondary" }}
        size="small"
      >
        Back to service requests
      </Button>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
              {sr.reference}
            </Typography>
            <Chip size="small" sx={statusChipSx(sr.status)} label={sr.status.toLowerCase().replaceAll("_", " ")} />
            <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{sr.subject}</Typography>
        </Box>
        <Button variant="outlined" size="small" onClick={openEdit}>Edit</Button>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { md: "1fr 300px" }, gap: 3 }}>

        {/* Left */}
        <Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: "1px solid #e2e8f0" }}>
            <Tab label="Details" />
            <Tab label="Activity" />
          </Tabs>

          {tab === 0 ? (
            <Card>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>Description</Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 3 }}>
                  {sr.description}
                </Typography>

                {needsClosure ? (
                  <>
                    <Divider sx={{ mb: 2 }} />
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Closure summary
                      {sr.status !== "CLOSED" ? (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          required before closing
                        </Typography>
                      ) : null}
                    </Typography>
                    <TextField
                      fullWidth multiline rows={3}
                      value={closureSummary}
                      onChange={(e) => setClosureSummary(e.target.value)}
                      disabled={sr.status === "CLOSED" || sr.status === "CANCELLED"}
                      placeholder="Describe how this was resolved..."
                    />
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {tab === 1 ? (
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
                  <Tab
                    label={
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <ChatBubbleOutlineIcon sx={{ fontSize: 13 }} />
                        <span>Customer updates ({customerUpdates?.length ?? 0})</span>
                      </Stack>
                    }
                    sx={{ fontSize: 12, minHeight: 40 }}
                  />
                  <Tab label="History" sx={{ fontSize: 12, minHeight: 40 }} />
                </Tabs>

                {activityTab === 0 ? (
                  <CommentThread
                    comments={workNotes ?? []}
                    placeholder="Add an internal note — not visible to the customer..."
                    buttonLabel="Add work note"
                    isInternal={true}
                    onSubmit={handleWorkNote}
                    saving={savingWorkNote}
                  />
                ) : null}

                {activityTab === 1 ? (
                  <CommentThread
                    comments={customerUpdates ?? []}
                    placeholder="Send an update to the customer..."
                    buttonLabel="Send update"
                    isInternal={false}
                    onSubmit={handleCustomerUpdate}
                    saving={savingCustomerUpdate}
                  />
                ) : null}

                {activityTab === 2 ? (
                  <AuditEventList entityType="ServiceRequest" entityId={sr.id} />
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </Box>

        {/* Right */}
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" fontWeight={700} gutterBottom>Details</Typography>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Client</Typography>
                  <Typography variant="body2">{sr.client.name}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Assignee</Typography>
                  <Typography variant="body2">{sr.assignee?.email ?? "Unassigned"}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Raised</Typography>
                  <Typography variant="body2">
                    {new Date(sr.createdAt).toLocaleDateString("en-GB")}
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {nextStatuses.length > 0 ? (
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>Workflow</Typography>
                <Stack spacing={1}>
                  {nextStatuses.map((status) => (
                    <Button
                      key={status}
                      fullWidth
                      variant={status === "CLOSED" || status === "COMPLETED" ? "contained" : "outlined"}
                      size="small"
                      disabled={
                        savingStatus ||
                        (["COMPLETED", "CLOSED"].includes(status) && !closureSummary.trim())
                      }
                      onClick={() => handleStatusUpdate(status)}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </Button>
                  ))}
                  {["COMPLETED", "CLOSED"].includes(nextStatuses[0]) && !closureSummary.trim() ? (
                    <Typography variant="caption" color="text.secondary" textAlign="center">
                      Add closure summary first
                    </Typography>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {sr.status === "CLOSED" ? (
            <Card>
              <CardContent>
                <Typography variant="subtitle2" fontWeight={700} gutterBottom>Closure summary</Typography>
                <Typography variant="body2" color="text.secondary">{sr.closureSummary}</Typography>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      </Box>

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit service request</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select label="Assignee" value={editAssigneeId}
              onChange={(e) => setEditAssigneeId(e.target.value)} fullWidth
            >
              <MenuItem value="">Unassigned</MenuItem>
              {(users ?? []).map((u) => (
                <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>
              ))}
            </TextField>
            <TextField
              select label="Priority" value={editPriority}
              onChange={(e) => setEditPriority(e.target.value)} fullWidth
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </TextField>
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleEdit} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}