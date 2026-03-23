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
  const [selected, setSelected] = React.useState<TriageItem | null>(null)
  const [targetType, setTargetType] = React.useState<"SERVICE_REQUEST" | "INCIDENT" | "TASK">("SERVICE_REQUEST")
  const [priority, setPriority] = React.useState("medium")
  const [incidentSeverity, setIncidentSeverity] = React.useState("MEDIUM")
  const [taskDueAt, setTaskDueAt] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [statusTarget, setStatusTarget] = React.useState<"UNDER_REVIEW" | "REJECTED">("UNDER_REVIEW")
  const [statusNotes, setStatusNotes] = React.useState("")
  const [statusRow, setStatusRow] = React.useState<TriageItem | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ["triage-queue"],
    queryFn: async () => (await api.get<TriageItem[]>("/triage/queue")).data
  })

  const convert = useMutation({
    mutationFn: async (row: TriageItem) =>
      (await api.post(`/triage/${row.sourceType}/${row.id}/convert`, {
        targetType, priority,
        incidentSeverity: targetType === "INCIDENT" ? incidentSeverity : undefined,
        taskDueAt: targetType === "TASK" ? taskDueAt : undefined,
        title: title.trim() || undefined,
        description: description.trim() || undefined
      })).data,
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: ["triage-queue"] })
      const previous = qc.getQueryData<TriageItem[]>(["triage-queue"]) ?? []
      qc.setQueryData<TriageItem[]>(["triage-queue"],
        previous.map((item) =>
          item.id === row.id && item.sourceType === row.sourceType
            ? { ...item, status: "CONVERTED" } : item
        ))
      return { previous }
    },
    onSuccess: async () => {
      setSelected(null)
      setTitle(""); setDescription(""); setTaskDueAt("")
      setTargetType("SERVICE_REQUEST"); setPriority("medium")
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["triage-queue"] }),
        qc.invalidateQueries({ queryKey: ["service-requests"] }),
        qc.invalidateQueries({ queryKey: ["incidents"] }),
        qc.invalidateQueries({ queryKey: ["tasks"] })
      ])
    },
    onError: (_e, _r, ctx) => {
      if (ctx?.previous) qc.setQueryData(["triage-queue"], ctx.previous)
    }
  })

  const updateStatus = useMutation({
    mutationFn: async (row: TriageItem) =>
      (await api.post(`/triage/${row.sourceType}/${row.id}/status`, {
        status: statusTarget,
        triageNotes: statusNotes.trim() || undefined
      })).data,
    onMutate: async (row) => {
      await qc.cancelQueries({ queryKey: ["triage-queue"] })
      const previous = qc.getQueryData<TriageItem[]>(["triage-queue"]) ?? []
      qc.setQueryData<TriageItem[]>(["triage-queue"],
        previous.map((item) =>
          item.id === row.id && item.sourceType === row.sourceType
            ? { ...item, status: statusTarget, triageNotes: statusNotes.trim() || item.triageNotes }
            : item
        ))
      return { previous }
    },
    onSuccess: async () => {
      setStatusRow(null); setStatusNotes(""); setStatusTarget("UNDER_REVIEW")
      await qc.invalidateQueries({ queryKey: ["triage-queue"] })
    },
    onError: (_e, _r, ctx) => {
      if (ctx?.previous) qc.setQueryData(["triage-queue"], ctx.previous)
    }
  })

  const convertError = convert.error as ApiError | null
  const convertErrorMessage = Array.isArray(convertError?.message)
    ? convertError?.message.join(", ") : convertError?.message
  const statusError = updateStatus.error as ApiError | null
  const statusErrorMessage = Array.isArray(statusError?.message)
    ? statusError?.message.join(", ") : statusError?.message

  const openConvert = (row: TriageItem) => {
    setSelected(row); setTargetType("SERVICE_REQUEST"); setPriority("medium")
    setIncidentSeverity("MEDIUM"); setTaskDueAt("")
    setTitle(row.title); setDescription(row.description)
  }

  const openStatusDialog = (row: TriageItem, status: "UNDER_REVIEW" | "REJECTED") => {
    setStatusRow(row); setStatusTarget(status); setStatusNotes(row.triageNotes ?? "")
  }

  const convertDisabled = !selected || !priority.trim() ||
    (targetType === "INCIDENT" && !incidentSeverity) ||
    (targetType === "TASK" && !taskDueAt)
  const statusDisabled = !statusRow || (statusTarget === "REJECTED" && statusNotes.trim().length < 5)

  return (
    <>
      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load triage inbox" /> : null}
          {convertError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {convertErrorMessage ?? "Failed to convert submission"}
            </Alert>
          ) : null}
          {statusError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {statusErrorMessage ?? "Failed to update triage status"}
            </Alert>
          ) : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="Triage inbox is clear" detail="No pending requests at the moment." />
          ) : null}
          <TableContainer>
            <Table sx={{ minWidth: 880 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Requester</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((row) => {
                  const canConvert = row.status === "NEW" || row.status === "UNDER_REVIEW"
                  const canSetUnderReview = row.status === "NEW"
                  const canReject = row.status === "NEW" || row.status === "UNDER_REVIEW"
                  return (
                    <TableRow key={`${row.sourceType}-${row.id}`}>
                      <TableCell>{row.requesterName}</TableCell>
                      <TableCell>{row.requesterEmail}</TableCell>
                      <TableCell>{row.title}</TableCell>
                      <TableCell>
                        <Chip size="small" sx={statusChipSx(row.status)}
                          label={row.status.toLowerCase()} />
                      </TableCell>
                      <TableCell>{new Date(row.createdAt).toLocaleDateString("en-GB")}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.8} justifyContent="flex-end">
                          <Button size="small" variant="outlined"
                            disabled={!canManage || !canSetUnderReview || updateStatus.isPending}
                            onClick={() => openStatusDialog(row, "UNDER_REVIEW")}>
                            Review
                          </Button>
                          <Button size="small" color="error" variant="outlined"
                            disabled={!canManage || !canReject || updateStatus.isPending}
                            onClick={() => openStatusDialog(row, "REJECTED")}>
                            Reject
                          </Button>
                          <Button size="small" variant="contained"
                            disabled={!canManage || !canConvert || convert.isPending}
                            onClick={() => openConvert(row)}>
                            {canConvert ? "Convert" : "Converted"}
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="sm">
        <DialogTitle>Convert triage item</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} sx={{ mt: 0.5 }}>
            <TextField select label="Convert to" value={targetType}
              onChange={(e) => setTargetType(e.target.value as any)}>
              <MenuItem value="SERVICE_REQUEST">Service request</MenuItem>
              <MenuItem value="INCIDENT">Incident</MenuItem>
              <MenuItem value="TASK">Task</MenuItem>
            </TextField>
            <TextField select label="Priority" value={priority}
              onChange={(e) => setPriority(e.target.value)}>
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>
            {targetType === "INCIDENT" ? (
              <TextField select label="Severity (required)" value={incidentSeverity}
                onChange={(e) => setIncidentSeverity(e.target.value)}>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
                <MenuItem value="CRITICAL">Critical</MenuItem>
              </TextField>
            ) : null}
            {targetType === "TASK" ? (
              <TextField label="Due date (required)" type="date"
                InputLabelProps={{ shrink: true }} value={taskDueAt}
                onChange={(e) => setTaskDueAt(e.target.value)} />
            ) : null}
            <TextField label="Title" value={title}
              onChange={(e) => setTitle(e.target.value)} />
            <TextField label="Description" value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline minRows={3} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>Cancel</Button>
          <Button variant="contained"
            disabled={convertDisabled || convert.isPending}
            onClick={() => selected && convert.mutate(selected)}>
            Convert
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!statusRow} onClose={() => setStatusRow(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {statusTarget === "UNDER_REVIEW" ? "Mark as under review" : "Reject triage item"}
        </DialogTitle>
        <DialogContent>
          <TextField
            label={statusTarget === "REJECTED" ? "Rejection notes (required)" : "Triage notes"}
            multiline minRows={3} fullWidth sx={{ mt: 0.5 }}
            value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusRow(null)}>Cancel</Button>
          <Button variant="contained"
            color={statusTarget === "REJECTED" ? "error" : "primary"}
            disabled={statusDisabled || updateStatus.isPending}
            onClick={() => statusRow && updateStatus.mutate(statusRow)}>
            Save
          </Button>
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