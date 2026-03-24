import React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogContent,
  DialogTitle, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { statusChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

type Issue = {
  id: string
  reference: string
  title: string
  severity: string
  status: string
  reviewDate: string | null
  createdAt: string
}

function severitySx(severity: string) {
  if (severity === "RED") return { bgcolor: "#fee2e2", color: "#b91c1c", fontWeight: 700 }
  if (severity === "AMBER") return { bgcolor: "#fef3c7", color: "#b45309", fontWeight: 700 }
  return { bgcolor: "#dcfce7", color: "#15803d", fontWeight: 700 }
}

export default function IssuesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [severity, setSeverity] = React.useState("AMBER")
  const [reviewDate, setReviewDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ["issues"],
    queryFn: async () => (await api.get<Issue[]>("/issues")).data
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/issues", {
        title, description, severity,
        reviewDate: reviewDate || undefined
      })
      setOpen(false)
      setTitle(""); setDescription("")
      setSeverity("AMBER"); setReviewDate("")
      qc.invalidateQueries({ queryKey: ["issues"] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Issues</Typography>
        <Button variant="contained" onClick={() => setOpen(true)}>Log issue</Button>
      </Stack>

      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load issues" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="No issues logged" detail="Log an issue to get started." />
          ) : null}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Severity</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Review date</TableCell>
                  <TableCell>Logged</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((i) => (
                  <TableRow
                    key={i.id}
                    onClick={() => navigate(`/issues/${i.id}`)}
                    sx={{ cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}
                  >
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>
                      {i.reference}
                    </TableCell>
                    <TableCell>{i.title}</TableCell>
                    <TableCell>
                      <Chip size="small" sx={severitySx(i.severity)} label={i.severity} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(i.status)} label={i.status} />
                    </TableCell>
                    <TableCell>
                      {i.reviewDate
                        ? new Date(i.reviewDate).toLocaleDateString("en-GB")
                        : "—"}
                    </TableCell>
                    <TableCell>{new Date(i.createdAt).toLocaleDateString("en-GB")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log issue</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title}
              onChange={(e) => setTitle(e.target.value)} required fullWidth />
            <TextField label="Description" value={description}
              onChange={(e) => setDescription(e.target.value)}
              required fullWidth multiline rows={3} />
            <Stack direction="row" gap={2}>
              <TextField select label="Severity" value={severity}
                onChange={(e) => setSeverity(e.target.value)} fullWidth>
                <MenuItem value="GREEN">Green — low</MenuItem>
                <MenuItem value="AMBER">Amber — medium</MenuItem>
                <MenuItem value="RED">Red — high</MenuItem>
              </TextField>
              <TextField label="Review date" type="date"
                InputLabelProps={{ shrink: true }} value={reviewDate}
                onChange={(e) => setReviewDate(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate}
                disabled={saving || !title.trim() || !description.trim()}>
                {saving ? "Saving..." : "Log issue"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}