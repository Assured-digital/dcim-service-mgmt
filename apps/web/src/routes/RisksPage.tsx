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

// ── Types ──────────────────────────────────────────────────────────────────
type Risk = {
  id: string
  reference: string
  title: string
  description: string
  likelihood: string
  impact: string
  status: string
  mitigationPlan: string | null
  source: string | null
  reviewDate: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

// ── Constants ──────────────────────────────────────────────────────────────
const RISK_STATUSES = ["IDENTIFIED", "UNDER_REVIEW", "MITIGATING", "ACCEPTED", "CLOSED", "ALL"]
const RISK_STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: "Identified", UNDER_REVIEW: "Under review",
  MITIGATING: "Mitigating", ACCEPTED: "Accepted", CLOSED: "Closed", ALL: "All"
}

// ── Helpers ────────────────────────────────────────────────────────────────
function deriveRag(likelihood: string, impact: string): "RED" | "AMBER" | "GREEN" {
  const score = (v: string) => v === "HIGH" ? 3 : v === "MEDIUM" ? 2 : 1
  const s = score(likelihood) * score(impact)
  return s >= 6 ? "RED" : s >= 3 ? "AMBER" : "GREEN"
}

function ragSx(rag: string) {
  if (rag === "RED") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 600, fontSize: 11 }
  if (rag === "AMBER") return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 600, fontSize: 11 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 600, fontSize: 11 }
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function RisksPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])

  const [filterStatus, setFilterStatus] = React.useState("IDENTIFIED")
  const [logOpen, setLogOpen] = React.useState(false)

  // Log form
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [likelihood, setLikelihood] = React.useState("MEDIUM")
  const [impact, setImpact] = React.useState("MEDIUM")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["risks"],
    queryFn: async () => (await api.get<Risk[]>("/risks")).data
  })

  const all = data ?? []
  const filtered = filterStatus === "ALL" ? all : all.filter(r => r.status === filterStatus)

  const counts: Record<string, number> = { ALL: all.length }
  RISK_STATUSES.slice(0, -1).forEach(s => { counts[s] = all.filter(r => r.status === s).length })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/risks", { title, description, likelihood, impact, source: "MANUAL" })
      setLogOpen(false)
      setTitle(""); setDescription(""); setLikelihood("MEDIUM"); setImpact("MEDIUM")
      qc.invalidateQueries({ queryKey: ["risks"] })
    } finally { setSaving(false) }
  }

  return (
    <Box>
      <Card>
        {/* Tab bar + action button inline */}
        <Box sx={{ borderBottom: "1px solid #e2e8f0", px: 2, display: "flex", alignItems: "center" }}>
          <Tabs value={filterStatus} onChange={(_, v) => setFilterStatus(v)}
            variant="scrollable" scrollButtons="auto" sx={{ minHeight: 44, flex: 1 }}
            textColor="inherit" TabIndicatorProps={{ style: { backgroundColor: "#1d4ed8" } }}>
            {RISK_STATUSES.map(s => {
              const count = counts[s] ?? 0
              return (
                <Tab key={s} value={s} sx={{ minHeight: 44, fontSize: 13 }}
                  label={
                    <Stack direction="row" spacing={0.75} alignItems="center">
                      <span>{RISK_STATUS_LABELS[s]}</span>
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
            <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
              onClick={() => setLogOpen(true)} sx={{ ml: 2, flexShrink: 0, fontSize: 12 }}>
              Log risk
            </Button>
          ) : null}
        </Box>

        {isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {error ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load risks" /></Box> : null}
        {!isLoading && !error && filtered.length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState
              title={filterStatus === "ALL" ? "No risks logged" : `No ${RISK_STATUS_LABELS[filterStatus]?.toLowerCase()} risks`}
              detail="Log a risk to get started." />
          </Box>
        ) : null}

        {filtered.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ "& th": { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc" } }}>
                  <TableCell>Reference</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Overall</TableCell>
                  <TableCell>Likelihood</TableCell>
                  <TableCell>Impact</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Logged</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(r => {
                  const rag = deriveRag(r.likelihood, r.impact)
                  return (
                    <TableRow key={r.id} hover onClick={() => navigate(`/risks/${r.id}`)} sx={{ cursor: "pointer" }}>
                      <TableCell sx={{ fontWeight: 700, fontFamily: "monospace", fontSize: 12, color: "#475569" }}>{r.reference}</TableCell>
                      <TableCell><Typography variant="body2" fontWeight={500}>{r.title}</Typography></TableCell>
                      <TableCell><Chip size="small" sx={ragSx(rag)} label={rag === "RED" ? "High" : rag === "AMBER" ? "Medium" : "Low"} /></TableCell>
                      <TableCell><Chip size="small" sx={ragSx(r.likelihood)} label={r.likelihood} /></TableCell>
                      <TableCell><Chip size="small" sx={ragSx(r.impact)} label={r.impact} /></TableCell>
                      <TableCell><Chip size="small" sx={chipSx(r.status)} label={RISK_STATUS_LABELS[r.status] ?? r.status} /></TableCell>
                      <TableCell sx={{ fontSize: 12, color: "#94a3b8" }}>{new Date(r.createdAt).toLocaleDateString("en-GB")}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      {/* Log risk dialog */}
      <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log risk</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} required fullWidth multiline rows={3} />
            <Stack direction="row" gap={2}>
              <TextField select label="Likelihood" value={likelihood} onChange={e => setLikelihood(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
              </TextField>
              <TextField select label="Impact" value={impact} onChange={e => setImpact(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
              </TextField>
            </Stack>
            <Stack direction="row" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setLogOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()}>
                {saving ? "Saving..." : "Log risk"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}