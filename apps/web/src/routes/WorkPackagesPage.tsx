import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Card, Chip, Dialog, DialogContent,
  DialogTitle, MenuItem, Stack, TextField, Typography
} from "@mui/material"
import { DataGrid, GridColDef } from "@mui/x-data-grid"
import AddIcon from "@mui/icons-material/Add"
import AutorenewIcon from "@mui/icons-material/Autorenew"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { EmptyState, ErrorState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import { useThemeMode } from "../lib/theme"
import { daysUntilRenewal } from "../lib/workPackages"

const WpToolbar = makeGridToolbar("work-packages")

type WorkPackage = {
  id: string
  reference: string
  title: string
  type: string
  status: string
  startDate: string | null
  endDate: string | null
  value: number | null
  renewalDate: string | null
}

export default function WorkPackagesPage() {
  const navigate = useNavigate()
  const { mode: themeMode } = useThemeMode()
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

  const columns: GridColDef<WorkPackage>[] = React.useMemo(() => [
    { field: "reference", headerName: "Reference", width: 140,
      renderCell: p => <Typography sx={{ fontSize: 12.5, fontWeight: 700, fontFamily: "monospace" }}>{p.value as string}</Typography> },
    { field: "title", headerName: "Title", flex: 1, minWidth: 220,
      renderCell: p => <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{p.value as string}</Typography> },
    { field: "type", headerName: "Type", width: 150,
      renderCell: p => <Chip size="small" label={(p.value as string).replace("_", " ").toLowerCase()} sx={{ fontSize: 11, height: 20, textTransform: "capitalize" }} /> },
    { field: "status", headerName: "Status", width: 120,
      renderCell: p => <StatusPill intent={entityStatusIntent(p.value as string)} label={(p.value as string).toLowerCase()} size="sm" /> },
    { field: "startDate", headerName: "Start", width: 110,
      renderCell: p => <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{p.value ? new Date(p.value as string).toLocaleDateString("en-GB") : "—"}</Typography> },
    { field: "endDate", headerName: "End", width: 110,
      renderCell: p => <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{p.value ? new Date(p.value as string).toLocaleDateString("en-GB") : "—"}</Typography> },
    { field: "renewalDate", headerName: "Renewal", width: 130,
      renderCell: p => {
        if (!p.value) return <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>—</Typography>
        const days = daysUntilRenewal(p.row)
        return (
          <Chip size="small" icon={<AutorenewIcon sx={{ fontSize: 13 }} />}
            label={days !== null && days < 0 ? `${-days}d overdue` : `${days}d`}
            sx={{ fontSize: 11, height: 20, bgcolor: days !== null && days <= 90 ? "rgba(234,179,8,0.12)" : "transparent", color: days !== null && days < 0 ? "#dc2626" : undefined }} />
        )
      } },
    { field: "value", headerName: "Value", width: 120,
      renderCell: p => <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{p.value ? `£${(p.value as number).toLocaleString()}` : "—"}</Typography> }
  ], [])

  return (
    <Box>
      <Card>
        <Box sx={{
          borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.25,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5
        }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: themeMode === "dark" ? "#e2e8f0" : "#334155" }}>Service scope</Typography>
          <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => setOpen(true)}>New service scope</Button>
        </Box>

        {error ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load work packages" /></Box> : null}

        <Box sx={{ height: 620 }}>
          <DataGrid
            rows={data ?? []}
            columns={columns}
            loading={isLoading}
            density="compact"
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            pageSizeOptions={[25, 50, 100]}
            disableRowSelectionOnClick
            onRowClick={p => navigate(`/work-packages/${p.id}`)}
            slots={{
              toolbar: WpToolbar,
              noRowsOverlay: () => (
                <Box sx={{ p: 2 }}>
                  <EmptyState title="No work packages" detail="Create a work package to get started." />
                </Box>
              )
            }}
            sx={dataGridSx(true, themeMode)}
          />
        </Box>
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