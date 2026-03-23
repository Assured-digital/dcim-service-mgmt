import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogContent,
  DialogTitle, Divider, MenuItem, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { ErrorState, LoadingState } from "../components/PageState"

type AuditEvent = {
  id: string
  action: string
  actorUserId: string | null
  data: any
  createdAt: string
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

export default function ServiceRequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = React.useState(0)
  const [comment, setComment] = React.useState("")
  const [savingComment, setSavingComment] = React.useState(false)
  const [closureSummary, setClosureSummary] = React.useState("")
  const [savingStatus, setSavingStatus] = React.useState(false)
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

  async function handleComment() {
    if (!comment.trim() || !sr) return
    setSavingComment(true)
    try {
      await api.post("/comments", {
        entityType: "ServiceRequest",
        entityId: sr.id,
        body: comment
      })
      setComment("")
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
    } finally {
      setSavingComment(false)
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

      {/* Header */}
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
            <Tab label={`Activity (${sr.auditEvents.length})`} />
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
                      fullWidth
                      multiline
                      rows={3}
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
                {sr.auditEvents.length === 0 ? (
                  <Typography color="text.secondary" variant="body2">No activity yet.</Typography>
                ) : (
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    {sr.auditEvents.map((e) => (
                      <Box key={e.id} sx={{ display: "flex", gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 32, height: 32, borderRadius: "50%",
                            bgcolor: "#e8f1ff", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 700, color: "#1d4ed8",
                            flexShrink: 0
                          }}
                        >
                          {e.action.charAt(0)}
                        </Box>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {e.action.replace(/_/g, " ").toLowerCase()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(e.createdAt).toLocaleString("en-GB")}
                          </Typography>
                          {e.data?.comment ? (
                            <Typography variant="body2" sx={{ mt: 0.5 }}>{e.data.comment}</Typography>
                          ) : null}
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}

                <Divider sx={{ mb: 2 }} />
                <Typography variant="subtitle2" gutterBottom>Add comment</Typography>
                <TextField
                  fullWidth multiline rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                  sx={{ mb: 1 }}
                />
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button
                    variant="contained" size="small"
                    onClick={handleComment}
                    disabled={savingComment || !comment.trim()}
                  >
                    {savingComment ? "Saving..." : "Add comment"}
                  </Button>
                </Box>
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

      {/* Edit dialog */}
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