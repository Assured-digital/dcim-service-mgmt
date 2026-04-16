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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@mui/material"
import HubIcon from "@mui/icons-material/Hub"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

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
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>From asset</TableCell>
                  <TableCell>To asset</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Label</TableCell>
                  <TableCell>Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(connections.data ?? []).map((connection) => (
                  <TableRow
                    key={connection.id}
                    hover
                    onClick={() => navigate(`/connections/${connection.id}`)}
                    sx={{ cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}
                  >
                    <TableCell>
                      <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                        {connection.fromAsset.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {connection.fromAsset.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                        {connection.toAsset.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {connection.toAsset.name}
                      </Typography>
                    </TableCell>
                    <TableCell>{connection.connectionType}</TableCell>
                    <TableCell>{connection.status}</TableCell>
                    <TableCell>{connection.label ?? "—"}</TableCell>
                    <TableCell>{new Date(connection.updatedAt).toLocaleDateString("en-GB")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
