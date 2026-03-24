import React from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type ApiError } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography, Badge
} from "@mui/material"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type SR = {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  updatedAt: string
  assignee: { id: string; email: string } | null
}

type TriageItem = {
  id: string
  sourceType: "REQUEST_INTAKE" | "PUBLIC_SUBMISSION"
  requesterName: string
  requesterEmail: string
  title: string
  description: string
  status: string
  triageNotes?: string | null
  createdAt: string
  convertedEntityType?: string | null
  convertedEntityId?: string | null
}

type RequestIntake = {
  id: string
  title: string
  description: string
  category?: string | null
  impact?: string | null
  urgency?: string | null
  status: string
  createdAt: string
}

const SR_STATUSES = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "New" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CUSTOMER", label: "Waiting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" },
]

function ServiceRequestsView() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = React.useState("ALL")

  const { data, isLoading, error } = useQuery({
    queryKey: ["service-requests"],
    queryFn: async () => (await api.get<SR[]>("/service-requests")).data
  })

  const allData = data ?? []
  const filtered = activeTab === "ALL"
    ? allData
    : allData.filter((sr) => sr.status === activeTab)

  function countFor(status: string) {
    if (status === "ALL") return allData.length
    return allData.filter((sr) => sr.status === status).length
  }

  return (
    <Card>
      <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 44 }}
        >
          {SR_STATUSES.map((s) => {
            const count = countFor(s.value)
            return (
              <Tab
                key={s.value}
                value={s.value}
                sx={{ minHeight: 44, fontSize: 13 }}
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <span>{s.label}</span>
                    {count > 0 ? (
                      <Box sx={{
                        bgcolor: activeTab === s.value ? "#1d4ed8" : "#e2e8f0",
                        color: activeTab === s.value ? "#fff" : "#475569",
                        borderRadius: 10, px: 0.75, py: 0.1,
                        fontSize: 11, fontWeight: 700, lineHeight: 1.6
                      }}>
                        {count}
                      </Box>
                    ) : null}
                  </Stack>
                }
              />
            )
          })}
        </Tabs>
      </Box>
      <CardContent>
        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorState title="Failed to load service requests" /> : null}
        {!isLoading && !error && filtered.length === 0 ? (
          <EmptyState
            title={activeTab === "ALL" ? "No service requests yet" : `No ${activeTab.toLowerCase().replaceAll("_", " ")} requests`}
            detail={activeTab === "ALL" ? "New tickets will appear here when submitted or converted from triage." : "Try selecting a different status tab."}
          />
        ) : null}
        {filtered.length > 0 ? (
          <TableContainer>
            <Table sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Ticket</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Assignee</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((sr) => (
                  <TableRow
                    key={sr.id}
                    hover
                    onClick={() => navigate(`/service-requests/${sr.id}`)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>
                      {sr.reference}
                    </TableCell>
                    <TableCell>{sr.subject}</TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(sr.status)}
                        label={sr.status.toLowerCase().replaceAll("_", " ")} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2"
                        color={sr.assignee ? "text.primary" : "text.secondary"}>
                        {sr.assignee?.email ?? "Unassigned"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {new Date(sr.updatedAt).toLocaleDateString("en-GB")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TriageView() {
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])
  const qc = useQueryClient()

  const [reviewRow, setReviewRow] = React.useState<TriageItem | null>(null)
  const [createTask, setCreateTask] = React.useState(false)
  const [rejectMode, setRejectMode] = React.useState(false)

  // Convert state
  const [targetType, setTargetType] = React.useState<"SERVICE_REQUEST" | "TASK">("SERVICE_REQUEST")
  const [priority, setPriority] = React.useState("medium")
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [taskDueAt, setTaskDueAt] = React.useState("")

  // Task state
  const [taskTitle, setTaskTitle] = React.useState("")
  const [taskDescription, setTaskDescription] = React.useState("")
  const [taskPriority, setTaskPriority] = React.useState("medium")
  const [taskDue, setTaskDue] = React.useState("")
  const [taskAssignee, setTaskAssignee] = React.useState("")

  // Reject state
  const [rejectNotes, setRejectNotes] = React.useState("")

  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState("")

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: async () => (await api.get<TriageItem[]>("/triage/queue")).data
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<{ id: string; email: string }[]>("/users")).data
  })

  function openReview(row: TriageItem) {
    setReviewRow(row)
    setCreateTask(false)
    setRejectMode(false)
    setTargetType("SERVICE_REQUEST")
    setPriority("medium")
    setTitle(row.title)
    setDescription(row.description)
    setTaskDueAt("")
    setTaskTitle(row.title)
    setTaskDescription("")
    setTaskPriority("medium")
    setTaskDue("")
    setTaskAssignee("")
    setRejectNotes(row.triageNotes ?? "")
    setError("")
  }

  function closeReview() {
    setReviewRow(null)
    setRejectMode(false)
    setCreateTask(false)
    setError("")
  }

  async function handleConfirm() {
    if (!reviewRow) return
    setSubmitting(true)
    setError("")
    try {
      // Convert the triage item
      await api.post(`/triage/${reviewRow.sourceType}/${reviewRow.id}/convert`, {
        targetType,
        priority,
        taskDueAt: targetType === "TASK" ? taskDueAt : undefined,
        title: title.trim() || undefined,
        description: description.trim() || undefined
      })

      // If task toggle is on, also create a task
      if (createTask && taskTitle.trim()) {
        await api.post("/tasks", {
          title: taskTitle,
          description: taskDescription || undefined,
          priority: taskPriority,
          dueAt: taskDue || undefined,
          assigneeId: taskAssignee || undefined
        })
      }

      closeReview()
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["triage-queue"] }),
        qc.invalidateQueries({ queryKey: ["service-requests"] }),
        qc.invalidateQueries({ queryKey: ["tasks"] })
      ])
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!reviewRow || rejectNotes.trim().length < 5) return
    setSubmitting(true)
    setError("")
    try {
      await api.post(`/triage/${reviewRow.sourceType}/${reviewRow.id}/status`, {
        status: "REJECTED",
        triageNotes: rejectNotes.trim()
      })
      closeReview()
      await qc.invalidateQueries({ queryKey: ["triage-queue"] })
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  const confirmDisabled = submitting || !title.trim() ||
    (targetType === "TASK" && !taskDueAt) ||
    (createTask && !taskTitle.trim())

  return (
    <>
      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {loadError ? <ErrorState title="Failed to load triage inbox" /> : null}
          {!isLoading && !loadError && (data?.length ?? 0) === 0 ? (
            <EmptyState title="Triage inbox is clear" detail="No pending requests at the moment." />
          ) : null}
          <TableContainer>
            <Table sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Requester</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((row) => {
                  const isActionable = row.status === "NEW" || row.status === "UNDER_REVIEW"
                  return (
                    <TableRow key={`${row.sourceType}-${row.id}`} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {row.requesterName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {row.requesterEmail}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>
                        <Chip size="small" sx={statusChipSx(row.status)}
                          label={row.status.toLowerCase().replaceAll("_", " ")} />
                      </TableCell>
                      <TableCell>
                        {new Date(row.createdAt).toLocaleDateString("en-GB")}
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={!canManage || !isActionable}
                          onClick={() => openReview(row)}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={!!reviewRow} onClose={closeReview} fullWidth maxWidth="sm">
        <DialogTitle>Review request</DialogTitle>
        <DialogContent>
          {/* Request summary */}
          <Box sx={{
            p: 1.5, mb: 2.5, borderRadius: 1.5,
            bgcolor: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)"
          }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              {reviewRow?.title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {reviewRow?.description}
            </Typography>
            <Stack direction="row" spacing={2}>
              <Typography variant="caption" color="text.secondary">
                From: <strong>{reviewRow?.requesterName}</strong> ({reviewRow?.requesterEmail})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {reviewRow?.createdAt
                  ? new Date(reviewRow.createdAt).toLocaleDateString("en-GB")
                  : ""}
              </Typography>
            </Stack>
          </Box>

          {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

          {!rejectMode ? (
            <Stack spacing={2}>
              {/* Conversion fields */}
              <TextField select label="Convert to" value={targetType}
                onChange={(e) => setTargetType(e.target.value as any)} fullWidth>
                <MenuItem value="SERVICE_REQUEST">Service request</MenuItem>
                <MenuItem value="TASK">Task</MenuItem>
              </TextField>
              <Stack direction="row" spacing={1.5}>
                <TextField select label="Priority" value={priority}
                  onChange={(e) => setPriority(e.target.value)} fullWidth>
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </TextField>
                {targetType === "TASK" ? (
                  <TextField label="Due date (required)" type="date"
                    InputLabelProps={{ shrink: true }} value={taskDueAt}
                    onChange={(e) => setTaskDueAt(e.target.value)} fullWidth />
                ) : null}
              </Stack>
              <TextField label="Title" value={title}
                onChange={(e) => setTitle(e.target.value)} fullWidth />
              <TextField label="Description" value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline minRows={2} fullWidth />

              {/* Task toggle */}
              <Box
                onClick={() => setCreateTask(!createTask)}
                sx={{
                  display: "flex", alignItems: "center", gap: 1.5,
                  p: 1.5, borderRadius: 1.5, cursor: "pointer",
                  border: "1px solid",
                  borderColor: createTask ? "#1d4ed8" : "var(--color-border-tertiary)",
                  bgcolor: createTask ? "#eff6ff" : "transparent",
                  transition: "all 0.15s"
                }}
              >
                <Box sx={{
                  width: 18, height: 18, borderRadius: 0.5, flexShrink: 0,
                  border: "2px solid",
                  borderColor: createTask ? "#1d4ed8" : "#94a3b8",
                  bgcolor: createTask ? "#1d4ed8" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {createTask ? (
                    <Box sx={{ width: 10, height: 10, color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
                      ✓
                    </Box>
                  ) : null}
                </Box>
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    Create a task
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Generate a linked task in the task module alongside this conversion
                  </Typography>
                </Box>
              </Box>

              {/* Task fields — shown when toggled */}
              {createTask ? (
                <Box sx={{
                  p: 1.5, borderRadius: 1.5,
                  border: "1px solid #bfdbfe",
                  bgcolor: "#f0f9ff"
                }}>
                  <Typography variant="caption" fontWeight={600}
                    color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                    Task details
                  </Typography>
                  <Stack spacing={1.5}>
                    <TextField label="Task title" value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      fullWidth required size="small" />
                    <TextField label="Task description" value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                      multiline minRows={2} fullWidth size="small" />
                    <Stack direction="row" spacing={1.5}>
                      <TextField select label="Priority" value={taskPriority}
                        onChange={(e) => setTaskPriority(e.target.value)}
                        fullWidth size="small">
                        <MenuItem value="low">Low</MenuItem>
                        <MenuItem value="medium">Medium</MenuItem>
                        <MenuItem value="high">High</MenuItem>
                        <MenuItem value="critical">Critical</MenuItem>
                      </TextField>
                      <TextField label="Due date" type="date"
                        InputLabelProps={{ shrink: true }} value={taskDue}
                        onChange={(e) => setTaskDue(e.target.value)}
                        fullWidth size="small" />
                    </Stack>
                    <TextField select label="Assignee" value={taskAssignee}
                      onChange={(e) => setTaskAssignee(e.target.value)}
                      fullWidth size="small">
                      <MenuItem value="">Unassigned</MenuItem>
                      {(users ?? []).map((u) => (
                        <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>
                      ))}
                    </TextField>
                  </Stack>
                </Box>
              ) : null}
            </Stack>
          ) : (
            // Reject mode
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Provide a reason for rejection. This will be recorded against the request.
              </Typography>
              <TextField
                label="Rejection reason (required)"
                multiline minRows={3} fullWidth
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Explain why this request is being rejected..."
              />
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
          {/* Reject toggle on left */}
          {!rejectMode ? (
            <Button
              size="small"
              color="error"
              onClick={() => setRejectMode(true)}
              disabled={submitting}
            >
              Reject request
            </Button>
          ) : (
            <Button
              size="small"
              onClick={() => setRejectMode(false)}
              disabled={submitting}
            >
              Back
            </Button>
          )}

          <Stack direction="row" spacing={1}>
            <Button onClick={closeReview} disabled={submitting}>Cancel</Button>
            {!rejectMode ? (
              <Button
                variant="contained"
                disabled={confirmDisabled}
                onClick={handleConfirm}
              >
                {submitting
                  ? "Processing..."
                  : createTask
                    ? "Confirm & create task"
                    : "Confirm request"}
              </Button>
            ) : (
              <Button
                variant="contained"
                color="error"
                disabled={rejectNotes.trim().length < 5 || submitting}
                onClick={handleReject}
              >
                {submitting ? "Rejecting..." : "Confirm rejection"}
              </Button>
            )}
          </Stack>
        </DialogActions>
      </Dialog>
    </>
  )
}

function RaiseRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [category, setCategory] = React.useState("operational")
  const [impact, setImpact] = React.useState("medium")
  const [urgency, setUrgency] = React.useState("medium")

  const create = useMutation({
    mutationFn: async () =>
      (await api.post<RequestIntake>("/request-intakes", {
        title, description, category, impact, urgency
      })).data,
    onSuccess: async () => {
      setTitle(""); setDescription("")
      setCategory("operational"); setImpact("medium"); setUrgency("medium")
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["request-intakes-mine"] }),
        qc.invalidateQueries({ queryKey: ["triage-queue"] })
      ])
      onClose()
    }
  })

  const createError = create.error as ApiError | null
  const createErrorMessage = Array.isArray(createError?.message)
    ? createError.message.join(", ") : createError?.message

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Raise request</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField
            label="Title" value={title}
            onChange={(e) => setTitle(e.target.value)} fullWidth required
          />
          <TextField
            label="Description" value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline minRows={3} fullWidth required
          />
          <Stack direction="row" spacing={1.5}>
            <TextField select label="Category" value={category}
              onChange={(e) => setCategory(e.target.value)} fullWidth>
              <MenuItem value="operational">Operational</MenuItem>
              <MenuItem value="access">Access</MenuItem>
              <MenuItem value="network">Network</MenuItem>
              <MenuItem value="power">Power</MenuItem>
              <MenuItem value="cooling">Cooling</MenuItem>
            </TextField>
            <TextField select label="Impact" value={impact}
              onChange={(e) => setImpact(e.target.value)} fullWidth>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>
            <TextField select label="Urgency" value={urgency}
              onChange={(e) => setUrgency(e.target.value)} fullWidth>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>
          </Stack>
          {createErrorMessage ? (
            <Alert severity="error">{createErrorMessage}</Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => create.mutate()}
          disabled={!title.trim() || description.trim().length < 10 || create.isPending}
        >
          {create.isPending ? "Submitting..." : "Submit request"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

type View = "requests" | "triage" 

export default function ServiceDeskPage() {
  const [view, setView] = React.useState<View>("requests")
  const [raiseOpen, setRaiseOpen] = React.useState(false)
  const canTriage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const { data: triageData } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: async () => (await api.get<TriageItem[]>("/triage/queue")).data,
    enabled: canTriage
  })

  const pendingCount = (triageData ?? []).filter(
    (t) => t.status === "NEW" || t.status === "UNDER_REVIEW"
  ).length

  return (
    <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
        <Typography variant="h4">Service Desk</Typography>
        <Button variant="contained" onClick={() => setRaiseOpen(true)}>
            Raise request
        </Button>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
        <Button
            variant={view === "requests" ? "contained" : "outlined"}
            size="small"
            onClick={() => setView("requests")}
            sx={{ borderRadius: 10, px: 2 }}
        >
            Service requests
        </Button>
        {canTriage ? (
            <Button
            variant={view === "triage" ? "contained" : "outlined"}
            size="small"
            onClick={() => setView("triage")}
            sx={{ borderRadius: 10, px: 2 }}
            >
            <Stack direction="row" spacing={0.75} alignItems="center">
                <span>Triage</span>
                {pendingCount > 0 ? (
                <Box sx={{
                    bgcolor: view === "triage" ? "rgba(255,255,255,0.25)" : "#1d4ed8",
                    color: "#fff",
                    borderRadius: 10, px: 0.75, py: 0.1,
                    fontSize: 11, fontWeight: 700, lineHeight: 1.6
                }}>
                    {pendingCount}
                </Box>
                ) : null}
            </Stack>
            </Button>
        ) : null}
        </Stack>

        {view === "requests" ? <ServiceRequestsView /> : null}
        {view === "triage" ? <TriageView /> : null}

        <RaiseRequestModal open={raiseOpen} onClose={() => setRaiseOpen(false)} />
    </Box>
  )
}