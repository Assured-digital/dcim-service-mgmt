import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
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

type Issue = {
  id: string
  reference: string
  title: string
  description: string
  severity: string
  status: string
  resolution: string | null
  reviewDate: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ALL"]
const ISSUE_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed", ALL: "All"
}

function severitySx(severity: string) {
  if (severity === "RED") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 600, fontSize: 11 }
  if (severity === "AMBER") return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 600, fontSize: 11 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 600, fontSize: 11 }
}

function severityLabel(severity: string) {
  if (severity === "RED") return "High"
  if (severity === "AMBER") return "Medium"
  return "Low"
}

function applyViewFilter(issues: Issue[], view: string) {
  const now = new Date()
  if (view === "urgent") return issues.filter((i) => i.severity === "RED")
  if (view === "review_due") {
    return issues.filter((i) => i.reviewDate && new Date(i.reviewDate) <= now && i.status !== "CLOSED")
  }
  if (view === "assigned") {
    // Placeholder deterministic mapping until user-level ownership is introduced for issues.
    return issues.filter((i) => i.status === "OPEN" || i.status === "IN_PROGRESS")
  }
  return issues
}

export default function RisksIssuesIssuesListPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [filterStatus, setFilterStatus] = React.useState("OPEN")
  const [logOpen, setLogOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [severity, setSeverity] = React.useState("AMBER")
  const [reviewDate, setReviewDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["issues"],
    queryFn: async () => (await api.get<Issue[]>("/issues")).data
  })

  const all = applyViewFilter(data ?? [], searchParams.get("view") ?? "all")
  const filtered = filterStatus === "ALL" ? all : all.filter(i => i.status === filterStatus)

  const counts: Record<string, number> = { ALL: all.length }
  ISSUE_STATUSES.slice(0, -1).forEach(s => {
    counts[s] = all.filter(i => i.status === s).length
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/issues", { title, description, severity, reviewDate: reviewDate || undefined })
      setLogOpen(false)
      setTitle("")
      setDescription("")
      setSeverity("AMBER")
      setReviewDate("")
      qc.invalidateQueries({ queryKey: ["issues"] })
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
            onChange={(_, v) => setFilterStatus(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 44, flex: 1 }}
            textColor="inherit"
            TabIndicatorProps={{ style: { backgroundColor: "#1d4ed8" } }}
          >
            {ISSUE_STATUSES.map((s) => {
              const count = counts[s] ?? 0
              return (
                <Tab
                  key={s}
                  value={s}
                  sx={{ minHeight: 44, fontSize: 13 }}
                  label={
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{ISSUE_STATUS_LABELS[s]}</span>
                      {count > 0 && s !== "ALL" ? (
                        <Box sx={{ bgcolor: filterStatus === s ? "#1d4ed8" : "#e2e8f0", color: filterStatus === s ? "#fff" : "#475569", borderRadius: 10, px: 0.75, py: 0.1, fontSize: 11, fontWeight: 700, lineHeight: 1.6 }}>
                          {count}
                        </Box>
                      ) : null}
                    </Stack>
                  }
                />
              )
            })}
          </Tabs>
          {canManage ? (
            <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={() => setLogOpen(true)} sx={{ ml: 2, flexShrink: 0, fontSize: 12 }}>
              Log issue
            </Button>
          ) : null}
        </Box>

        {isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {error ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load issues" /></Box> : null}
        {!isLoading && !error && filtered.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState title={filterStatus === "ALL" ? "No issues logged" : `No ${ISSUE_STATUS_LABELS[filterStatus]?.toLowerCase()} issues`} detail="Log an issue to get started." />
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
                  <TableCell>Review date</TableCell>
                  <TableCell>Logged</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(i => (
                  <TableRow key={i.id} hover onClick={() => navigate(`/risks-issues/issues/${i.id}`)} sx={{ cursor: "pointer" }}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12, color: "#475569" }}>{i.reference}</TableCell>
                    <TableCell><Typography variant="body2" fontWeight={500}>{i.title}</Typography></TableCell>
                    <TableCell><Chip size="small" sx={severitySx(i.severity)} label={severityLabel(i.severity)} /></TableCell>
                    <TableCell><Chip size="small" sx={chipSx(i.status)} label={ISSUE_STATUS_LABELS[i.status] ?? i.status} /></TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#64748b" }}>
                      {i.reviewDate ? new Date(i.reviewDate).toLocaleDateString("en-GB") : "—"}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: "#94a3b8" }}>{new Date(i.createdAt).toLocaleDateString("en-GB")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log issue</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} required fullWidth multiline rows={3} />
            <Stack direction="row" gap={2}>
              <TextField select label="Severity" value={severity} onChange={e => setSeverity(e.target.value)} fullWidth>
                <MenuItem value="GREEN">Green — low</MenuItem>
                <MenuItem value="AMBER">Amber — medium</MenuItem>
                <MenuItem value="RED">Red — high</MenuItem>
              </TextField>
              <TextField label="Review date" type="date" InputLabelProps={{ shrink: true }}
                value={reviewDate} onChange={e => setReviewDate(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setLogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()}>
                {saving ? "Saving..." : "Log issue"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
