import React from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogContent,
  DialogTitle, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { statusChipSx, priorityChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

type Change = {
  id: string
  reference: string
  title: string
  changeType: string
  status: string
  priority: string
  scheduledStart: string | null
  assignee: { id: string; email: string } | null
  updatedAt: string
}

export default function ChangesPage() {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [changeType, setChangeType] = React.useState("NORMAL")
  const [priority, setPriority] = React.useState("medium")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["changes"],
    queryFn: async () => (await api.get<Change[]>("/changes")).data
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/changes", { title, description, changeType, priority })
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
        <Typography variant="h4">Changes</Typography>
        <Button variant="contained" onClick={() => setOpen(true)}>Raise change</Button>
      </Stack>

      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load changes" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="No change requests" detail="Raise a change request to get started." />
          ) : null}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
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
                {(data ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>{c.reference}</TableCell>
                    <TableCell>{c.title}</TableCell>
                    <TableCell>
                      <Chip size="small" label={c.changeType} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={statusChipSx(c.status)} label={c.status.toLowerCase().replaceAll("_", " ")} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" sx={priorityChipSx(c.priority)} label={c.priority} />
                    </TableCell>
                    <TableCell>{c.assignee?.email ?? "—"}</TableCell>
                    <TableCell>
                      {c.scheduledStart ? new Date(c.scheduledStart).toLocaleDateString("en-GB") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Raise change request</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required fullWidth multiline rows={3} />
            <Stack direction="row" gap={2}>
              <TextField select label="Type" value={changeType} onChange={(e) => setChangeType(e.target.value)} fullWidth>
                <MenuItem value="NORMAL">Normal</MenuItem>
                <MenuItem value="STANDARD">Standard</MenuItem>
                <MenuItem value="EMERGENCY">Emergency</MenuItem>
              </TextField>
              <TextField select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} fullWidth>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </TextField>
            </Stack>
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1 }}>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()}>
                {saving ? "Saving..." : "Raise change"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}