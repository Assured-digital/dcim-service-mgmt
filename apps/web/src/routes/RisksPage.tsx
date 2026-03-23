import React from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogContent,
  DialogTitle, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { statusChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

type Risk = {
  id: string
  reference: string
  title: string
  likelihood: string
  impact: string
  status: string
  createdAt: string
}

function riskLevelSx(level: string) {
  if (level === "HIGH") return { bgcolor: "#fdecec", color: "#b42318", fontWeight: 700 }
  if (level === "MEDIUM") return { bgcolor: "#fff5e8", color: "#b45309", fontWeight: 700 }
  return { bgcolor: "#eef2f7", color: "#475569", fontWeight: 700 }
}

export default function RisksPage() {
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [likelihood, setLikelihood] = React.useState("MEDIUM")
  const [impact, setImpact] = React.useState("MEDIUM")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["risks"],
    queryFn: async () => (await api.get<Risk[]>("/risks")).data
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/risks", { title, description, likelihood, impact })
      setOpen(false)
      setTitle(""); setDescription("")
      refetch()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Risks</Typography>
        <Button variant="contained" onClick={() => setOpen(true)}>Log risk</Button>
      </Stack>

      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load risks" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="No risks logged" detail="Log a risk to get started." />
          ) : null}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Likelihood</TableCell>
                  <TableCell>Impact</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Logged</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => navigate(`/risks/${r.id}`)}
                    sx={{ cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>{r.reference}</TableCell>
                    <TableCell>{r.title}</TableCell>
                    <TableCell><Chip size="small" sx={riskLevelSx(r.likelihood)} label={r.likelihood} /></TableCell>
                    <TableCell><Chip size="small" sx={riskLevelSx(r.impact)} label={r.impact} /></TableCell>
                    <TableCell><Chip size="small" sx={statusChipSx(r.status)} label={r.status} /></TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleDateString("en-GB")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log risk</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required fullWidth multiline rows={3} />
            <Stack direction="row" gap={2}>
              <TextField select label="Likelihood" value={likelihood} onChange={(e) => setLikelihood(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
              </TextField>
              <TextField select label="Impact" value={impact} onChange={(e) => setImpact(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem>
                <MenuItem value="MEDIUM">Medium</MenuItem>
                <MenuItem value="HIGH">High</MenuItem>
              </TextField>
            </Stack>
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1 }}>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
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