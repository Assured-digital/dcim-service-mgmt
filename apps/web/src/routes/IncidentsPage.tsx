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

type Incident = {
  id: string
  reference: string
  title: string
  description: string
  status: string
  severity: string
  priority: string
  assigneeId: string | null
  assignee: { id: string; email: string } | null
  createdAt: string
  updatedAt: string
}

type User = { id: string; email: string }

const INCIDENT_STATUSES = ["NEW", "INVESTIGATING", "MITIGATED", "RESOLVED", "CLOSED", "ALL"]
const INCIDENT_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  INVESTIGATING: "Investigating",
  MITIGATED: "Mitigated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  ALL: "All"
}

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
const PRIORITIES = ["low", "medium", "high", "critical"]

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function severitySx(severity: string) {
  if (severity === "CRITICAL") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 700, fontSize: 11 }
  if (severity === "HIGH") return { bgcolor: "#ffedd5", color: "#c2410c", fontWeight: 700, fontSize: 11 }
  if (severity === "MEDIUM") return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 700, fontSize: 11 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 700, fontSize: 11 }
}

export default function IncidentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const [filterStatus, setFilterStatus] = React.useState("NEW")
  const [logOpen, setLogOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [severity, setSeverity] = React.useState("MEDIUM")
  const [priority, setPriority] = React.useState("medium")
  const [assigneeId, setAssigneeId] = React.useState("")

  const { data, isLoading, error } = useQuery({
    queryKey: ["incidents"],
    queryFn: async () => (await api.get<Incident[]>("/incidents")).data
  })

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const all = data ?? []
  const filtered = filterStatus === "ALL" ? all : all.filter((item) => item.status === filterStatus)
  const counts: Record<string, number> = { ALL: all.length }
  INCIDENT_STATUSES.slice(0, -1).forEach((status) => {
    counts[status] = all.filter((item) => item.status === status).length
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/incidents", {
        title: title.trim(),
        description: description.trim(),
        severity,
        priority,
        assigneeId: assigneeId || undefined
      })
      setLogOpen(false)
      setTitle("")
      setDescription("")
      setSeverity("MEDIUM")
      setPriority("medium")
      setAssigneeId("")
      qc.invalidateQueries({ queryKey: ["incidents"] })
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
            {INCIDENT_STATUSES.map((status) => {
              const count = counts[status] ?? 0
              return (
                <Tab
                  key={status}
                  value={status}
                  sx={{ minHeight: 44, fontSize: 13 }}
                  label={(
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{INCIDENT_STATUS_LABELS[status]}</span>
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
              Log incident
            </Button>
          ) : null}
        </Box>

        {isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {error ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load incidents" /></Box> : null}
        {!isLoading && !error && filtered.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState
              title={filterStatus === "ALL" ? "No incidents logged" : `No ${INCIDENT_STATUS_LABELS[filterStatus]?.toLowerCase()} incidents`}
              detail="Log an incident to get started."
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
                  <TableCell>Severity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Assignee</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((incident) => (
                  <TableRow key={incident.id} hover onClick={() => navigate(`/incidents/${incident.id}`)} sx={{ cursor: "pointer" }}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12, color: "#475569" }}>
                      {incident.reference}
                    </TableCell>
                    <TableCell><Typography variant="body2" fontWeight={500}>{incident.title}</Typography></TableCell>
                    <TableCell><Chip size="small" sx={severitySx(incident.severity)} label={incident.severity} /></TableCell>
                    <TableCell><Chip size="small" sx={chipSx(incident.status)} label={INCIDENT_STATUS_LABELS[incident.status] ?? incident.status} /></TableCell>
                    <TableCell><Chip size="small" sx={chipSx(incident.priority)} label={capitalize(incident.priority)} /></TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#64748b" }}>{incident.assignee?.email.split("@")[0] ?? "Unassigned"}</TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#94a3b8" }}>{new Date(incident.updatedAt).toLocaleDateString("en-GB")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log incident</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={(event) => setDescription(event.target.value)} required fullWidth multiline rows={3} />
            <Stack direction={{ xs: "column", md: "row" }} gap={2}>
              <TextField select label="Severity" value={severity} onChange={(event) => setSeverity(event.target.value)} fullWidth>
                {SEVERITIES.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>
              <TextField select label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)} fullWidth>
                {PRIORITIES.map((value) => <MenuItem key={value} value={value}>{capitalize(value)}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField select label="Assignee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} fullWidth>
              <MenuItem value="">Unassigned</MenuItem>
              {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.email}</MenuItem>)}
            </TextField>
            <Stack direction="row" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setLogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()}>
                {saving ? "Saving..." : "Log incident"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
