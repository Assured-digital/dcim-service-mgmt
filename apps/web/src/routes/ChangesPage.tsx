import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, Chip, Dialog, DialogContent, DialogTitle,
  MenuItem, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tab, Tabs, TextField, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import { chipSx } from "../components/shared"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type ChangeApproval = {
  id: string
  decision: string
  notes: string | null
  decidedAt: string
}

type ChangeRequest = {
  id: string
  reference: string
  changeType: string
  title: string
  description: string
  status: string
  priority: string
  scheduledStart: string | null
  scheduledEnd: string | null
  assigneeId: string | null
  assignee: { id: string; email: string } | null
  approvals?: ChangeApproval[]
  createdAt: string
  updatedAt: string
}

type User = { id: string; email: string }

const CHANGE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "REJECTED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
  "ALL"
]

const CHANGE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  ALL: "All"
}

const CHANGE_TYPES = ["STANDARD", "NORMAL", "EMERGENCY"]
const PRIORITIES = ["low", "medium", "high", "critical"]

function capitalize(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
}

export default function ChangesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [filterStatus, setFilterStatus] = React.useState("DRAFT")
  const [logOpen, setLogOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [changeType, setChangeType] = React.useState("NORMAL")
  const [priority, setPriority] = React.useState("medium")
  const [reason, setReason] = React.useState("")
  const [impactAssessment, setImpactAssessment] = React.useState("")
  const [rollbackPlan, setRollbackPlan] = React.useState("")
  const [scheduledStart, setScheduledStart] = React.useState("")
  const [scheduledEnd, setScheduledEnd] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")

  const { data, isLoading, error } = useQuery({
    queryKey: ["changes"],
    queryFn: async () => (await api.get<ChangeRequest[]>("/changes")).data
  })

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const all = data ?? []
  const filtered = filterStatus === "ALL" ? all : all.filter((item) => item.status === filterStatus)
  const counts: Record<string, number> = { ALL: all.length }
  CHANGE_STATUSES.slice(0, -1).forEach((status) => {
    counts[status] = all.filter((item) => item.status === status).length
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/changes", {
        title: title.trim(),
        description: description.trim(),
        changeType,
        priority,
        reason: reason.trim() || undefined,
        impactAssessment: impactAssessment.trim() || undefined,
        rollbackPlan: rollbackPlan.trim() || undefined,
        scheduledStart: scheduledStart || undefined,
        scheduledEnd: scheduledEnd || undefined,
        assigneeId: assigneeId || undefined
      })
      setLogOpen(false)
      setTitle("")
      setDescription("")
      setChangeType("NORMAL")
      setPriority("medium")
      setReason("")
      setImpactAssessment("")
      setRollbackPlan("")
      setScheduledStart("")
      setScheduledEnd("")
      setAssigneeId("")
      qc.invalidateQueries({ queryKey: ["changes"] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Card>
        <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2, display: "flex", alignItems: "center" }}>
          <Tabs
            value={filterStatus}
            onChange={(_event, value) => setFilterStatus(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 44, flex: 1 }}
            textColor="inherit"
            TabIndicatorProps={{ style: { backgroundColor: "#1d4ed8" } }}
          >
            {CHANGE_STATUSES.map((status) => {
              const count = counts[status] ?? 0
              return (
                <Tab
                  key={status}
                  value={status}
                  sx={{ minHeight: 44, fontSize: 13 }}
                  label={(
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{CHANGE_STATUS_LABELS[status]}</span>
                      {count > 0 && status !== "ALL" ? (
                        <Box sx={{
                          bgcolor: filterStatus === status ? "#1d4ed8" : "#e2e8f0",
                          color: filterStatus === status ? "#fff" : "#475569",
                          borderRadius: 10, px: 0.75, py: 0.1,
                          fontSize: 11, fontWeight: 700, lineHeight: 1.6
                        }}>
                          {count}
                        </Box>
                      ) : null}
                    </Stack>
                  )}
                />
              )
            })}
          </Tabs>
          {canManage ? (
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 13 }} />}
              onClick={() => setLogOpen(true)}
              sx={{ ml: 2, flexShrink: 0, fontSize: 12 }}
            >
              Log change
            </Button>
          ) : null}
        </Box>

        {isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {error ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load changes" /></Box> : null}
        {!isLoading && !error && filtered.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState
              title={filterStatus === "ALL" ? "No changes logged" : `No ${CHANGE_STATUS_LABELS[filterStatus]?.toLowerCase()} changes`}
              detail="Log a change to get started."
            />
          </Box>
        ) : null}

        {filtered.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ "& th": { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc" } }}>
                  <TableCell>Reference</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Assignee</TableCell>
                  <TableCell>Scheduled</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((change) => (
                  <TableRow key={change.id} hover onClick={() => navigate(`/changes/${change.id}`)} sx={{ cursor: "pointer" }}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12, color: "#475569" }}>
                      {change.reference}
                    </TableCell>
                    <TableCell><Typography variant="body2" fontWeight={500}>{change.title}</Typography></TableCell>
                    <TableCell><Chip size="small" sx={chipSx(change.changeType)} label={change.changeType} /></TableCell>
                    <TableCell><Chip size="small" sx={chipSx(change.status)} label={CHANGE_STATUS_LABELS[change.status] ?? change.status} /></TableCell>
                    <TableCell><Chip size="small" sx={chipSx(change.priority)} label={capitalize(change.priority)} /></TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#64748b" }}>
                      {change.assignee?.email.split("@")[0] ?? "Unassigned"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#64748b" }}>
                      {change.scheduledStart ? new Date(change.scheduledStart).toLocaleDateString("en-GB") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Log change</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} required fullWidth multiline rows={3} />
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              <TextField select label="Change type" value={changeType} onChange={(event) => setChangeType(event.target.value)} fullWidth>
                {CHANGE_TYPES.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
              <TextField select label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} fullWidth>
                {PRIORITIES.map((item) => <MenuItem key={item} value={item}>{capitalize(item)}</MenuItem>)}
              </TextField>
              <TextField select label="Assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} fullWidth>
                <MenuItem value="">Unassigned</MenuItem>
                {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.email}</MenuItem>)}
              </TextField>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              <TextField
                label="Scheduled start"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={scheduledStart}
                onChange={(event) => setScheduledStart(event.target.value)}
                fullWidth
              />
              <TextField
                label="Scheduled end"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={scheduledEnd}
                onChange={(event) => setScheduledEnd(event.target.value)}
                fullWidth
              />
            </Stack>
            <TextField label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} fullWidth multiline rows={2} />
            <TextField label="Impact assessment" value={impactAssessment} onChange={(event) => setImpactAssessment(event.target.value)} fullWidth multiline rows={2} />
            <TextField label="Rollback plan" value={rollbackPlan} onChange={(event) => setRollbackPlan(event.target.value)} fullWidth multiline rows={2} />
            <Stack direction="row" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setLogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()}>
                {saving ? "Saving..." : "Log change"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
