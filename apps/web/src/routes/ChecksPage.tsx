import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, Chip, Dialog, DialogContent, DialogTitle,
  MenuItem, Stack, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { chipSx } from "../components/shared"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type Check = {
  id: string
  reference: string
  title: string
  checkType: string
  status: string
  priority: string
  scheduledAt: string | null
  passRate: number | null
  createdAt: string
  site: { id: string; name: string } | null
  assignee: { id: string; email: string } | null
  template: { id: string; name: string; checkType: string } | null
  items: { id: string; response: string | null; isRequired: boolean }[]
}

type Template = { id: string; name: string; checkType: string }
type Site = { id: string; name: string }
type User = { id: string; email: string }

const CHECK_STATUSES = ["DRAFT", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED", "ALL"]

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  PENDING_REVIEW: "Pending review",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  ALL: "All"
}

function progressLabel(items: { response: string | null }[]) {
  const total = items.length
  if (total === 0) return null
  const answered = items.filter(i => i.response !== null).length
  return `${answered}/${total}`
}

function progressSx(items: { response: string | null }[]) {
  const total = items.length
  if (total === 0) return { bgcolor: "#f1f5f9", color: "#64748b" }
  const answered = items.filter(i => i.response !== null).length
  const failed = items.filter(i => i.response === "FAIL").length
  if (answered === total && failed === 0) return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 700 }
  if (failed > 0) return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 700 }
  if (answered > 0) return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 700 }
  return { bgcolor: "#f1f5f9", color: "#64748b" }
}

export default function ChecksPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [filterStatus, setFilterStatus] = React.useState("IN_PROGRESS")
  const [createOpen, setCreateOpen] = React.useState(false)
  const [templateId, setTemplateId] = React.useState("")
  const [siteId, setSiteId] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [scheduledAt, setScheduledAt] = React.useState("")
  const [scopeNotes, setScopeNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["checks"],
    queryFn: async () => (await api.get<Check[]>("/checks")).data
  })

  const { data: templates } = useQuery({
    queryKey: ["check-templates"],
    queryFn: async () => (await api.get<Template[]>("/checks/templates")).data
  })

  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/sites")).data
  })

  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data
  })

  const all = data ?? []
  const filtered = filterStatus === "ALL" ? all : all.filter(c => c.status === filterStatus)

  const counts: Record<string, number> = { ALL: all.length }
  CHECK_STATUSES.slice(0, -1).forEach(s => {
    counts[s] = all.filter(c => c.status === s).length
  })

  const selectedTemplate = (templates ?? []).find(t => t.id === templateId)

  async function handleCreate() {
    if (!templateId || !siteId) return
    setSaving(true)
    try {
      const res = await api.post("/checks", {
        templateId,
        siteId,
        assigneeId: assigneeId || undefined,
        scheduledAt: scheduledAt || undefined,
        scopeNotes: scopeNotes || undefined
      })
      setCreateOpen(false)
      setTemplateId(""); setSiteId(""); setAssigneeId("")
      setScheduledAt(""); setScopeNotes("")
      qc.invalidateQueries({ queryKey: ["checks"] })
      navigate(`/checks/${res.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
        <Typography variant="h4">Engineering Checks</Typography>
        {canManage ? (
          <Button variant="contained" onClick={() => setCreateOpen(true)}>
            Schedule check
          </Button>
        ) : null}
      </Stack>

      <Card>
        <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2 }}>
          <Tabs
            value={filterStatus}
            onChange={(_, v) => setFilterStatus(v)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ minHeight: 44 }}
            textColor="inherit"
            TabIndicatorProps={{ style: { backgroundColor: "#0f172a" } }}
          >
            {CHECK_STATUSES.map((s) => {
              const showBadge = (counts[s] ?? 0) > 0 && s !== "ALL"
              return (
                <Tab
                  key={s}
                  value={s}
                  sx={{ minHeight: 44, fontSize: 13 }}
                  label={
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{STATUS_LABELS[s]}</span>
                      {showBadge ? (
                        <Box sx={{
                          bgcolor: filterStatus === s ? "#0f172a" : "#e2e8f0",
                          color: filterStatus === s ? "#fff" : "#475569",
                          borderRadius: 10, px: 0.75, py: 0.1,
                          fontSize: 11, fontWeight: 700, lineHeight: 1.6
                        }}>
                          {counts[s]}
                        </Box>
                      ) : null}
                    </Stack>
                  }
                />
              )
            })}
          </Tabs>
        </Box>

        {isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {error ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load engineering checks" /></Box> : null}
        {!isLoading && !error && filtered.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState
              title={filterStatus === "ALL" ? "No checks yet" : `No ${STATUS_LABELS[filterStatus]?.toLowerCase()} checks`}
              detail={filterStatus === "ALL" ? "Schedule a check to get started." : "Try a different status filter."}
            />
          </Box>
        ) : null}

        {filtered.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Site</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Progress</TableCell>
                  <TableCell>Scheduled</TableCell>
                  <TableCell>Assignee</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((check) => (
                  <TableRow
                    key={check.id}
                    onClick={() => navigate(`/checks/${check.id}`)}
                    sx={{ cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12 }}>
                      {check.reference}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{check.title}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{check.checkType}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption">{check.site?.name ?? "—"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={chipSx(check.status)}
                        label={STATUS_LABELS[check.status] ?? check.status} />
                    </TableCell>
                    <TableCell>
                      {check.items.length > 0 ? (
                        <Chip size="small"
                          sx={progressSx(check.items)}
                          label={progressLabel(check.items)} />
                      ) : (
                        <Typography variant="caption" color="text.secondary">No items</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {check.scheduledAt
                          ? new Date(check.scheduledAt).toLocaleDateString("en-GB")
                          : "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {check.assignee?.email.split("@")[0] ?? "Unassigned"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule engineering check</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Template" value={templateId}
              onChange={(e) => setTemplateId(e.target.value)} required fullWidth>
              <MenuItem value="">Select a template...</MenuItem>
              {(templates ?? []).map(t => (
                <MenuItem key={t.id} value={t.id}>{t.name} — {t.checkType}</MenuItem>
              ))}
            </TextField>
            {templateId && (templates ?? []).find(t => t.id === templateId) === undefined ? null : null}
            <TextField select label="Site" value={siteId}
              onChange={(e) => setSiteId(e.target.value)} required fullWidth>
              <MenuItem value="">Select a site...</MenuItem>
              {(sites ?? []).map(s => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </TextField>
            <TextField select label="Assign engineer (optional)" value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)} fullWidth>
              <MenuItem value="">Unassigned</MenuItem>
              {(users ?? []).map(u => (
                <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>
              ))}
            </TextField>
            <TextField type="date" label="Scheduled date (optional)"
              InputLabelProps={{ shrink: true }}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)} fullWidth />
            <TextField label="Scope notes (optional)" multiline rows={2}
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)} fullWidth />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate}
                disabled={saving || !templateId || !siteId}>
                {saving ? "Creating..." : "Schedule check"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}