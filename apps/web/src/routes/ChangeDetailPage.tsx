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
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type Approval = {
  id: string
  decision: string
  notes: string | null
  decidedAt: string
  approver: { id: string; email: string }
}

type Change = {
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
  createdAt: string
  updatedAt: string
  assignee: { id: string; email: string } | null
  approvals: Approval[]
}

type User = { id: string; email: string }

const STATUS_FLOW: Record<string, string[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"],
  REJECTED: ["DRAFT"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: []
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Submit for approval",
  APPROVED: "Approve",
  REJECTED: "Reject",
  IN_PROGRESS: "Start implementation",
  COMPLETED: "Mark completed",
  CLOSED: "Close",
  CANCELLED: "Cancel",
  DRAFT: "Return to draft"
}

export default function ChangeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = React.useState(0)
  const [error, setError] = React.useState("")
  const [savingStatus, setSavingStatus] = React.useState(false)
  const [implementationNotes, setImplementationNotes] = React.useState("")
  const [postImplReview, setPostImplReview] = React.useState("")

  const [editOpen, setEditOpen] = React.useState(false)
  const [editAssigneeId, setEditAssigneeId] = React.useState("")
  const [editPriority, setEditPriority] = React.useState("")
  const [editScheduledStart, setEditScheduledStart] = React.useState("")
  const [editScheduledEnd, setEditScheduledEnd] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const [approvalOpen, setApprovalOpen] = React.useState(false)
  const [approvalDecision, setApprovalDecision] = React.useState("APPROVED")
  const [approvalNotes, setApprovalNotes] = React.useState("")
  const [savingApproval, setSavingApproval] = React.useState(false)

  const canApprove = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const { data: change, isLoading } = useQuery({
    queryKey: ["change-detail", id],
    queryFn: async () => (await api.get<Change>(`/changes/${id}`)).data,
    enabled: !!id
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  React.useEffect(() => {
    if (change) {
      setImplementationNotes(change.implementationNotes ?? "")
      setPostImplReview(change.postImplReview ?? "")
    }
  }, [change])

  function openEdit() {
    if (!change) return
    setEditAssigneeId(change.assignee?.id ?? "")
    setEditPriority(change.priority)
    setEditScheduledStart(change.scheduledStart?.slice(0, 10) ?? "")
    setEditScheduledEnd(change.scheduledEnd?.slice(0, 10) ?? "")
    setEditOpen(true)
  }

  async function handleEdit() {
    setSaving(true)
    setError("")
    try {
      await api.put(`/changes/${id}`, {
        assigneeId: editAssigneeId || undefined,
        priority: editPriority,
        scheduledStart: editScheduledStart || undefined,
        scheduledEnd: editScheduledEnd || undefined
      })
      setEditOpen(false)
      qc.invalidateQueries({ queryKey: ["change-detail", id] })
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
      await api.post(`/changes/${id}/status`, {
        status,
        implementationNotes: implementationNotes || undefined,
        postImplReview: postImplReview || undefined
      })
      qc.invalidateQueries({ queryKey: ["change-detail", id] })
      qc.invalidateQueries({ queryKey: ["changes"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to update status")
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleApproval() {
    setSavingApproval(true)
    setError("")
    try {
      await api.post(`/changes/${id}/approve`, {
        decision: approvalDecision,
        notes: approvalNotes || undefined
      })
      setApprovalOpen(false)
      setApprovalNotes("")
      qc.invalidateQueries({ queryKey: ["change-detail", id] })
      qc.invalidateQueries({ queryKey: ["changes"] })
    } catch (e: any) {
      setError(e?.message ?? "Failed to record approval")
    } finally {
      setSavingApproval(false)
    }
  }

  if (isLoading) return <LoadingState />
  if (!change) return <ErrorState title="Change request not found" />

  const nextStatuses = STATUS_FLOW[change.status] ?? []
  const showImplNotes = ["IN_PROGRESS", "COMPLETED", "CLOSED"].includes(change.status) ||
    nextStatuses.includes("COMPLETED") || nextStatuses.includes("CLOSED")

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate("/changes")}
        sx={{ mb: 2, color: "text.secondary" }}
        size="small"
      >
        Back to changes
      </Button>

      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontFamily: "monospace", color: "text.secondary" }}>
              {change.reference}
            </Typography>
            <Chip size="small" sx={statusChipSx(change.status)}
              label={change.status.toLowerCase().replaceAll("_", " ")} />
            <Chip size="small" sx={priorityChipSx(change.priority)} label={change.priority} />
            <Chip size="small" label={change.changeType} />
          </Stack>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>{change.title}</Typography>
        </Box>
        <Button variant="outlined" size="small" onClick={openEdit}>Edit</Button>
      </Stack>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      <Box sx={{ display: "grid", gridTemplateColumns: { md: "1fr 300px" }, gap: 3 }}>

        {/* Left */}
        <Box>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}
            sx={{ mb: 2, borderBottom: "1px solid #e2e8f0" }}>
            <Tab label="Details" />
            <Tab label={`Approvals (${change.approvals.length})`} />
            <Tab label="History" />
          </Tabs>

          {tab === 0 ? (
            <Stack spacing={2}>
              <Card>
                <CardContent>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    Description
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
                    {change.description}
                  </Typography>

                  {change.reason ? (
                    <>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Reason for change
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
                        {change.reason}
                      </Typography>
                    </>
                  ) : null}

                  {change.impactAssessment ? (
                    <>
                      <Divider sx={{ mb: 2 }} />
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Impact assessment
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mb: 2 }}>
                        {change.impactAssessment}
                      </Typography>
                    </>
                  ) : null}

                  {change.rollbackPlan ? (
                    <>
                      <Divider sx={{ mb: 2 }} />
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Rollback plan
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {change.rollbackPlan}
                      </Typography>
                    </>
                  ) : null}
                </CardContent>
              </Card>

              {showImplNotes ? (
                <Card>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Implementation notes
                    </Typography>
                    <TextField
                      fullWidth multiline rows={3}
                      value={implementationNotes}
                      onChange={(e) => setImplementationNotes(e.target.value)}
                      disabled={change.status === "CLOSED" || change.status === "CANCELLED"}
                      placeholder="Record implementation details..."
                      sx={{ mb: 2 }}
                    />
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Post-implementation review
                    </Typography>
                    <TextField
                      fullWidth multiline rows={3}
                      value={postImplReview}
                      onChange={(e) => setPostImplReview(e.target.value)}
                      disabled={change.status === "CLOSED" || change.status === "CANCELLED"}
                      placeholder="Review outcomes after implementation..."
                    />
                  </CardContent>
                </Card>
              ) : null}
            </Stack>
          ) : null}

          {tab === 1 ? (
            <Card>
              <CardContent>
                {change.approvals.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No approvals recorded yet.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {change.approvals.map((a) => (
                      <Box key={a.id} sx={{
                        p: 1.5, borderRadius: 1.5, border: "1px solid",
                        borderColor: a.decision === "APPROVED" ? "#bbf7d0" : "#fecaca",
                        bgcolor: a.decision === "APPROVED" ? "#f0fdf4" : "#fef2f2"
                      }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Chip
                            size="small"
                            label={a.decision}
                            sx={{
                              bgcolor: a.decision === "APPROVED" ? "#16a34a" : "#dc2626",
                              color: "#fff",
                              fontWeight: 700,
                              fontSize: 11
                            }}
                          />
                          <Typography variant="caption" fontWeight={600}>
                            {a.approver.email}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(a.decidedAt).toLocaleString("en-GB")}
                          </Typography>
                        </Stack>
                        {a.notes ? (
                          <Typography variant="body2" color="text.secondary">
                            {a.notes}
                          </Typography>
                        ) : null}
                      </Box>
                    ))}
                  </Stack>
                )}

                {canApprove && change.status === "PENDING_APPROVAL" ? (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => setApprovalOpen(true)}
                    >
                      Record approval decision
                    </Button>
                  </>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {tab === 2 ? (
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  Audit history coming soon.
                </Typography>
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
                  <Typography variant="caption" color="text.secondary">Assignee</Typography>
                  <Typography variant="body2">{change.assignee?.email ?? "Unassigned"}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Type</Typography>
                  <Typography variant="body2">{change.changeType}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Priority</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip size="small" sx={priorityChipSx(change.priority)} label={change.priority} />
                  </Box>
                </Box>
                {change.scheduledStart ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Scheduled start</Typography>
                    <Typography variant="body2">
                      {new Date(change.scheduledStart).toLocaleDateString("en-GB")}
                    </Typography>
                  </Box>
                ) : null}
                {change.scheduledEnd ? (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Scheduled end</Typography>
                    <Typography variant="body2">
                      {new Date(change.scheduledEnd).toLocaleDateString("en-GB")}
                    </Typography>
                  </Box>
                ) : null}
                <Box>
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography variant="body2">
                    {new Date(change.createdAt).toLocaleDateString("en-GB")}
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
                      variant={["COMPLETED", "CLOSED", "APPROVED"].includes(status) ? "contained" : "outlined"}
                      size="small"
                      color={["REJECTED", "CANCELLED"].includes(status) ? "error" : "primary"}
                      disabled={savingStatus}
                      onClick={() => handleStatusUpdate(status)}
                    >
                      {STATUS_LABELS[status] ?? status}
                    </Button>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </Stack>
      </Box>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit change request</DialogTitle>
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
            <TextField
              label="Scheduled start" type="date" value={editScheduledStart}
              onChange={(e) => setEditScheduledStart(e.target.value)}
              fullWidth InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Scheduled end" type="date" value={editScheduledEnd}
              onChange={(e) => setEditScheduledEnd(e.target.value)}
              fullWidth InputLabelProps={{ shrink: true }}
            />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleEdit} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Approval dialog */}
      <Dialog open={approvalOpen} onClose={() => setApprovalOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record approval decision</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select label="Decision" value={approvalDecision}
              onChange={(e) => setApprovalDecision(e.target.value)} fullWidth
            >
              <MenuItem value="APPROVED">Approve</MenuItem>
              <MenuItem value="REJECTED">Reject</MenuItem>
            </TextField>
            <TextField
              label="Notes" value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              fullWidth multiline rows={3}
              placeholder="Optional notes..."
            />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => setApprovalOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                color={approvalDecision === "APPROVED" ? "primary" : "error"}
                onClick={handleApproval}
                disabled={savingApproval}
              >
                {savingApproval ? "Saving..." : "Confirm"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}