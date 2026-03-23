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

type Issue = {
  id: string
  reference: string
  title: string
  priority: string
  status: string
  createdAt: string
}

export default function IssuesPage() {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("MEDIUM")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["issues"],
    queryFn: async () => (await api.get<Issue[]>("/issues")).data
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      await api.post("/issues", { title, description, priority })
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
                  <TableCell>Priority</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Logged</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((i) => (
                  <TableRow key={i.id}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>{i.reference}</TableCell>
                    <TableCell>{i.title}</TableCell>
                    <TableCell><Chip size="small" sx={priorityChipSx(i.priority.toLowerCase())} label={i.priority} /></TableCell>
                    <TableCell><Chip size="small" sx={statusChipSx(i.status)} label={i.status} /></TableCell>
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
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} required fullWidth multiline rows={3} />
            <TextField select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} fullWidth>
              <MenuItem value="LOW">Low</MenuItem>
              <MenuItem value="MEDIUM">Medium</MenuItem>
              <MenuItem value="HIGH">High</MenuItem>
              <MenuItem value="CRITICAL">Critical</MenuItem>
            </TextField>
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1 }}>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
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