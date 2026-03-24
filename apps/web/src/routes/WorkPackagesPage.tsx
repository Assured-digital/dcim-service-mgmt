import React from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogContent,
  DialogTitle, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import { statusChipSx } from "../lib/ui"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

type WorkPackage = {
  id: string
  reference: string
  title: string
  type: string
  status: string
  startDate: string | null
  endDate: string | null
  value: number | null
}

export default function WorkPackagesPage() {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [type, setType] = React.useState("MANAGED_SERVICE")
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [value, setValue] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["work-packages"],
    queryFn: async () => (await api.get<WorkPackage[]>("/work-packages")).data
  })

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await api.post("/work-packages", {
        title,
        description,
        type,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        value: value ? parseFloat(value) : undefined
      })
      setOpen(false)
      setTitle(""); setDescription(""); setStartDate(""); setEndDate(""); setValue("")
      refetch()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h4">Service Scope</Typography>
        <Button variant="contained" onClick={() => setOpen(true)}>New service scope</Button>
      </Stack>

      <Card>
        <CardContent>
          {isLoading ? <LoadingState /> : null}
          {error ? <ErrorState title="Failed to load work packages" /> : null}
          {!isLoading && !error && (data?.length ?? 0) === 0 ? (
            <EmptyState title="No work packages" detail="Create a work package to get started." />
          ) : null}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Start</TableCell>
                  <TableCell>End</TableCell>
                  <TableCell>Value</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data ?? []).map((wp) => (
                  <TableRow key={wp.id}>
                    <TableCell sx={{ fontWeight: 700, fontFamily: "monospace" }}>{wp.reference}</TableCell>
                    <TableCell>{wp.title}</TableCell>
                    <TableCell><Chip size="small" label={wp.type.replace("_", " ")} /></TableCell>
                    <TableCell><Chip size="small" sx={statusChipSx(wp.status)} label={wp.status} /></TableCell>
                    <TableCell>{wp.startDate ? new Date(wp.startDate).toLocaleDateString("en-GB") : "—"}</TableCell>
                    <TableCell>{wp.endDate ? new Date(wp.endDate).toLocaleDateString("en-GB") : "—"}</TableCell>
                    <TableCell>{wp.value ? `£${wp.value.toLocaleString()}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New service scope</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ mt: 1 }}>
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required fullWidth />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} />
            <TextField select label="Type" value={type} onChange={(e) => setType(e.target.value)} fullWidth>
              <MenuItem value="MANAGED_SERVICE">Managed service</MenuItem>
              <MenuItem value="PROJECT">Project</MenuItem>
              <MenuItem value="AUDIT">Audit</MenuItem>
              <MenuItem value="ADVISORY">Advisory</MenuItem>
              <MenuItem value="MIGRATION">Migration</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </TextField>
            <Stack direction="row" gap={2}>
              <TextField label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
              <TextField label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
            </Stack>
            <TextField label="Value (£)" type="number" value={value} onChange={(e) => setValue(e.target.value)} fullWidth />
            <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ mt: 1 }}>
              <Button onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim()}>
                {saving ? "Saving..." : "Create"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}