import React from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

// ── Types ──────────────────────────────────────────────────────────────────
type SR = {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  updatedAt: string
  assignee: { id: string; email: string } | null
}

// ── Constants ──────────────────────────────────────────────────────────────
const SR_STATUSES = [
  { value: "NEW", label: "New" },
  { value: "ASSIGNED", label: "Assigned" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_CUSTOMER", label: "Waiting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CLOSED", label: "Closed" },
  { value: "ALL", label: "All" },
]

// ── Create Service Request Modal ──────────────────────────────────────────
// Creates a ServiceRequest directly — no triage step. Exported so detail
// pages can raise a request pre-linked to the record being viewed.
export function CreateServiceRequestModal({
  open, onClose, linkedEntityType, linkedEntityId, linkedEntityLabel, onSuccess, navigateAfterCreate = true
}: {
  open: boolean
  onClose: () => void
  linkedEntityType?: string
  linkedEntityId?: string
  linkedEntityLabel?: string
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useNotification()
  const [subject, setSubject] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")

  async function handleSubmit() {
    if (!subject.trim() || description.trim().length < 5) return
    try {
      const res = await api.post<{ id: string }>("/service-requests", {
        subject: subject.trim(),
        description: description.trim(),
        priority,
        linkedEntityType: linkedEntityType || undefined,
        linkedEntityId: linkedEntityId || undefined
      })
      setSubject(""); setDescription(""); setPriority("medium")
      onClose()
      qc.invalidateQueries({ queryKey: ["service-requests"] })
      await onSuccess?.()
      if (navigateAfterCreate) navigate(`/service-desk/${res.data.id}`)
      notify.success("Service request created")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to create request")
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Raise service request</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {linkedEntityLabel ? (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#f0f9ff", border: "1px solid #bae6fd" }}>
              <Typography variant="caption" color="#0369a1">Linked to: <strong>{linkedEntityLabel}</strong></Typography>
            </Box>
          ) : null}
          <TextField
            label="Subject" value={subject} onChange={e => setSubject(e.target.value)}
            fullWidth required placeholder="Brief description of the request"
          />
          <TextField
            label="Description" value={description}
            onChange={e => setDescription(e.target.value)}
            multiline minRows={4} fullWidth required
            placeholder="Provide as much detail as possible..."
          />
          <TextField select label="Priority" value={priority}
            onChange={e => setPriority(e.target.value)} fullWidth>
            <MenuItem value="low">Low</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!subject.trim() || description.trim().length < 5}
        >
          Submit request
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ServiceDeskPage() {
  const navigate = useNavigate()
  const canRaise = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER])
  const [activeTab, setActiveTab] = React.useState("NEW")
  const [raiseOpen, setRaiseOpen] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["service-requests"],
    queryFn: async () => (await api.get<SR[]>("/service-requests")).data
  })

  const allData = data ?? []
  const filtered = activeTab === "ALL" ? allData : allData.filter(sr => sr.status === activeTab)

  function countFor(status: string) {
    if (status === "ALL") return allData.length
    return allData.filter(sr => sr.status === status).length
  }

  return (
    <Box>
      <Card>
        {/* Status tabs + action button inline */}
        <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2, display: "flex", alignItems: "center" }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            variant="scrollable" scrollButtons="auto"
            sx={{ minHeight: 44, flex: 1 }}
            textColor="inherit"
            TabIndicatorProps={{ style: { backgroundColor: "#1d4ed8" } }}
          >
            {SR_STATUSES.map(s => {
              const count = countFor(s.value)
              return (
                <Tab
                  key={s.value} value={s.value}
                  sx={{ minHeight: 44, fontSize: 13 }}
                  label={
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{s.label}</span>
                      {count > 0 && s.value !== "ALL" ? (
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
          {canRaise ? (
            <Button
              size="small" variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 13 }} />}
              onClick={() => setRaiseOpen(true)}
              sx={{ ml: 2, flexShrink: 0, fontSize: 12 }}
            >
              Raise request
            </Button>
          ) : null}
        </Box>

        {/* States */}
        {isLoading ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}
        {error ? <Box sx={{ p: 3 }}><ErrorState title="Failed to load service requests" /></Box> : null}
        {!isLoading && !error && filtered.length === 0 ? (
          <Box sx={{ p: 3 }}>
            <EmptyState
              title={activeTab === "ALL" ? "No service requests yet" : `No ${SR_STATUSES.find(s => s.value === activeTab)?.label.toLowerCase()} requests`}
              detail={activeTab === "ALL" ? "Raise a request using the button above." : "Try selecting a different status tab."}
            />
          </Box>
        ) : null}

        {/* Table */}
        {filtered.length > 0 ? (
          <TableContainer>
            <Table sx={{ minWidth: 700 }}>
              <TableHead>
                <TableRow sx={{ "& th": { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc" } }}>
                  <TableCell>Reference</TableCell>
                  <TableCell>Subject</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Priority</TableCell>
                  <TableCell>Assignee</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(sr => (
                  <TableRow
                    key={sr.id} hover
                    onClick={() => navigate(`/service-desk/${sr.id}`)}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12, color: "#475569" }}>
                      {sr.reference}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>{sr.subject}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(sr.status)}
                        label={sr.status.toLowerCase().replaceAll("_", " ")} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={priorityChipSx(sr.priority)} label={sr.priority} />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={sr.assignee ? "text.primary" : "text.secondary"} sx={{ fontSize: 13 }}>
                        {sr.assignee?.email.split("@")[0] ?? "Unassigned"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#94a3b8" }}>
                      {new Date(sr.updatedAt).toLocaleDateString("en-GB")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      <CreateServiceRequestModal open={raiseOpen} onClose={() => setRaiseOpen(false)} />
    </Box>
  )
}