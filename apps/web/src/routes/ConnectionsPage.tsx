import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material"
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid"
import HubIcon from "@mui/icons-material/Hub"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import { StatusPill, entityStatusIntent } from "../components/shared"

type Connection = {
  id: string
  connectionType: string
  status: "PLANNED" | "ACTIVE" | "DEGRADED" | "RETIRED"
  label: string | null
  fromAsset: {
    id: string
    assetTag: string
    name: string
    site: { id: string; name: string } | null
  }
  toAsset: {
    id: string
    assetTag: string
    name: string
    site: { id: string; name: string } | null
  }
  updatedAt: string
}

type AssetOption = { id: string; assetTag: string; name: string }

const STATUS_OPTIONS = ["PLANNED", "ACTIVE", "DEGRADED", "RETIRED"] as const

const ConnectionsToolbar = makeGridToolbar("connections")

const connectionColumns: GridColDef<Connection>[] = [
  {
    field: "fromAsset", headerName: "From asset", flex: 1, minWidth: 200,
    valueGetter: (_v, row) => `${row.fromAsset.assetTag} ${row.fromAsset.name}`,
    renderCell: (p: GridRenderCellParams<Connection>) => (
      <Stack sx={{ py: 0.5, lineHeight: 1.2 }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{p.row.fromAsset.assetTag}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "#64748b" }}>{p.row.fromAsset.name}</Typography>
      </Stack>
    ),
  },
  {
    field: "toAsset", headerName: "To asset", flex: 1, minWidth: 200,
    valueGetter: (_v, row) => `${row.toAsset.assetTag} ${row.toAsset.name}`,
    renderCell: (p) => (
      <Stack sx={{ py: 0.5, lineHeight: 1.2 }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{p.row.toAsset.assetTag}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "#64748b" }}>{p.row.toAsset.name}</Typography>
      </Stack>
    ),
  },
  {
    field: "connectionType", headerName: "Type", width: 140,
    renderCell: (p) => <Typography sx={{ fontSize: 12.5 }}>{p.value as string}</Typography>,
  },
  {
    field: "status", headerName: "Status", width: 120,
    renderCell: (p) => (
      <StatusPill
        intent={entityStatusIntent(p.value as string)}
        label={(p.value as string).toLowerCase()}
        size="sm"
      />
    ),
  },
  {
    field: "label", headerName: "Label", width: 160,
    renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: p.value ? "#0f172a" : "#94a3b8" }}>{(p.value as string) ?? "—"}</Typography>,
  },
  {
    field: "updatedAt", headerName: "Updated", width: 120,
    valueGetter: (v) => v ? new Date(v as string) : null,
    renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: "#64748b" }}>{p.value ? (p.value as Date).toLocaleDateString("en-GB") : "—"}</Typography>,
  },
]

export default function ConnectionsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const [open, setOpen] = React.useState(false)
  const [fromAssetId, setFromAssetId] = React.useState("")
  const [toAssetId, setToAssetId] = React.useState("")
  const [connectionType, setConnectionType] = React.useState("")
  const [status, setStatus] = React.useState<typeof STATUS_OPTIONS[number]>("ACTIVE")
  const [label, setLabel] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [installedAt, setInstalledAt] = React.useState("")
  const [lastValidatedAt, setLastValidatedAt] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState("ALL")

  const connections = useQuery({
    queryKey: ["connections", statusFilter],
    queryFn: async () =>
      (
        await api.get<Connection[]>("/connections", {
          params: { status: statusFilter === "ALL" ? undefined : statusFilter }
        })
      ).data
  })

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<AssetOption[]>("/assets")).data
  })

  async function handleCreate() {
    if (!fromAssetId || !toAssetId || !connectionType.trim()) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>("/connections", {
        fromAssetId,
        toAssetId,
        connectionType: connectionType.trim(),
        status,
        label: label || undefined,
        notes: notes || undefined,
        installedAt: installedAt || undefined,
        lastValidatedAt: lastValidatedAt || undefined
      })
      setOpen(false)
      setFromAssetId("")
      setToAssetId("")
      setConnectionType("")
      setStatus("ACTIVE")
      setLabel("")
      setNotes("")
      setInstalledAt("")
      setLastValidatedAt("")
      await qc.invalidateQueries({ queryKey: ["connections"] })
      navigate(`/connections/${res.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Card>
        <Box
          sx={{
            borderBottom: "1px solid #e2e8f0",
            px: 2,
            py: 1.25,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5
          }}
        >
          <TextField
            select
            size="small"
            label="Status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="ALL">All statuses</MenuItem>
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
          {canManage ? (
            <Button size="small" variant="contained" startIcon={<HubIcon sx={{ fontSize: 16 }} />} onClick={() => setOpen(true)}>
              New connection
            </Button>
          ) : null}
        </Box>

        {connections.isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {connections.isError ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load connections" /></Box> : null}
        {!connections.isLoading && !connections.isError && (connections.data?.length ?? 0) === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState title="No connections defined" detail="Create links between assets to represent live infrastructure topology." />
          </Box>
        ) : null}

        {(connections.data?.length ?? 0) > 0 ? (
          <Box sx={{ height: 620 }}>
            <DataGrid
              rows={connections.data ?? []}
              columns={connectionColumns}
              density="compact"
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              pageSizeOptions={[25, 50, 100]}
              disableRowSelectionOnClick
              onRowClick={(params) => navigate(`/connections/${(params.row as Connection).id}`)}
              slots={{ toolbar: ConnectionsToolbar }}
              sx={dataGridSx(true)}
            />
          </Box>
        ) : null}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create connection</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              label="From asset"
              value={fromAssetId}
              onChange={(e) => setFromAssetId(e.target.value)}
              required
              fullWidth
            >
              <MenuItem value="">Select asset...</MenuItem>
              {(assets.data ?? []).map((asset) => (
                <MenuItem key={asset.id} value={asset.id}>
                  {asset.assetTag} - {asset.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="To asset" value={toAssetId} onChange={(e) => setToAssetId(e.target.value)} required fullWidth>
              <MenuItem value="">Select asset...</MenuItem>
              {(assets.data ?? []).map((asset) => (
                <MenuItem key={asset.id} value={asset.id}>
                  {asset.assetTag} - {asset.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Connection type" value={connectionType} onChange={(e) => setConnectionType(e.target.value)} required fullWidth />
            <TextField select label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} required fullWidth>
              {STATUS_OPTIONS.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
            <TextField
              type="date"
              label="Installed at (optional)"
              InputLabelProps={{ shrink: true }}
              value={installedAt}
              onChange={(e) => setInstalledAt(e.target.value)}
              fullWidth
            />
            <TextField
              type="date"
              label="Last validated (optional)"
              InputLabelProps={{ shrink: true }}
              value={lastValidatedAt}
              onChange={(e) => setLastValidatedAt(e.target.value)}
              fullWidth
            />
            <TextField label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={3} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving || !fromAssetId || !toAssetId || !connectionType.trim() || fromAssetId === toAssetId}
          >
            {saving ? "Saving..." : "Create connection"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
