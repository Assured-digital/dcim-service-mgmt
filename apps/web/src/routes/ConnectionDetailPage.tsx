import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { ErrorState, LoadingState } from "../components/PageState"
import { StatusPill, entityStatusIntent } from "../components/shared"

type Connection = {
  id: string
  connectionType: string
  status: "PLANNED" | "ACTIVE" | "DEGRADED" | "RETIRED"
  label: string | null
  notes: string | null
  installedAt: string | null
  lastValidatedAt: string | null
  fromAssetId: string
  toAssetId: string
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
}

type AssetOption = { id: string; assetTag: string; name: string; siteId: string | null }

const STATUS_OPTIONS = ["PLANNED", "ACTIVE", "DEGRADED", "RETIRED"] as const

function assetPath(asset: { id: string; site: { id: string } | null }) {
  if (!asset.site?.id) return "/asset-hierarchy"
  return `/asset-hierarchy/${asset.site.id}?assetId=${asset.id}`
}

export default function ConnectionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  const canDelete = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const [fromAssetId, setFromAssetId] = React.useState("")
  const [toAssetId, setToAssetId] = React.useState("")
  const [connectionType, setConnectionType] = React.useState("")
  const [status, setStatus] = React.useState<typeof STATUS_OPTIONS[number]>("ACTIVE")
  const [label, setLabel] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [installedAt, setInstalledAt] = React.useState("")
  const [lastValidatedAt, setLastValidatedAt] = React.useState("")

  const connection = useQuery({
    queryKey: ["connections", id],
    queryFn: async () => (await api.get<Connection>(`/connections/${id}`)).data,
    enabled: !!id
  })

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<AssetOption[]>("/assets")).data
  })

  React.useEffect(() => {
    if (!connection.data) return
    setRecordLabel(`${connection.data.fromAsset.assetTag} -> ${connection.data.toAsset.assetTag}`)
    setFromAssetId(connection.data.fromAssetId)
    setToAssetId(connection.data.toAssetId)
    setConnectionType(connection.data.connectionType)
    setStatus(connection.data.status)
    setLabel(connection.data.label ?? "")
    setNotes(connection.data.notes ?? "")
    setInstalledAt(connection.data.installedAt ? connection.data.installedAt.slice(0, 10) : "")
    setLastValidatedAt(connection.data.lastValidatedAt ? connection.data.lastValidatedAt.slice(0, 10) : "")
  }, [connection.data, setRecordLabel])

  async function handleSave() {
    if (!id || !fromAssetId || !toAssetId || !connectionType.trim()) return
    setSaving(true)
    setError("")
    try {
      await api.put(`/connections/${id}`, {
        fromAssetId,
        toAssetId,
        connectionType: connectionType.trim(),
        status,
        label: label || null,
        notes: notes || null,
        installedAt: installedAt || null,
        lastValidatedAt: lastValidatedAt || null
      })
      setEditing(false)
      await qc.invalidateQueries({ queryKey: ["connections"] })
      await qc.invalidateQueries({ queryKey: ["connections", id] })
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to update connection")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setError("")
    try {
      await api.delete(`/connections/${id}`)
      await qc.invalidateQueries({ queryKey: ["connections"] })
      navigate("/connections")
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete connection")
    } finally {
      setDeleting(false)
    }
  }

  if (connection.isLoading) return <LoadingState />
  if (!connection.data) return <ErrorState title="Connection not found" />

  return (
    <Box>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" sx={{ mb: 0.75 }}>
                {connection.data.connectionType}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" color="text.secondary">Status</Typography>
                <StatusPill
                  intent={entityStatusIntent(connection.data.status)}
                  label={connection.data.status.toLowerCase()}
                  size="sm"
                />
              </Stack>
            </Box>
            {canManage ? (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => setEditing(true)}>Edit</Button>
                {canDelete ? (
                  <Button size="small" color="error" variant="outlined" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting..." : "Delete"}
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </Stack>

          <Stack spacing={1.5} sx={{ mt: 3 }}>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                From asset
              </Typography>
              <Button
                size="small"
                sx={{ px: 0, textTransform: "none" }}
                onClick={() => navigate(assetPath(connection.data.fromAsset))}
              >
                {connection.data.fromAsset.assetTag} - {connection.data.fromAsset.name}
              </Button>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                To asset
              </Typography>
              <Button
                size="small"
                sx={{ px: 0, textTransform: "none" }}
                onClick={() => navigate(assetPath(connection.data.toAsset))}
              >
                {connection.data.toAsset.assetTag} - {connection.data.toAsset.name}
              </Button>
            </Box>
            <Typography variant="body2">
              <strong>Label:</strong> {connection.data.label ?? "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Installed:</strong>{" "}
              {connection.data.installedAt ? new Date(connection.data.installedAt).toLocaleDateString("en-GB") : "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Last validated:</strong>{" "}
              {connection.data.lastValidatedAt ? new Date(connection.data.lastValidatedAt).toLocaleDateString("en-GB") : "—"}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              <strong>Notes:</strong> {connection.data.notes ?? "—"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={editing} onClose={() => setEditing(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit connection</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="From asset" value={fromAssetId} onChange={(e) => setFromAssetId(e.target.value)} required fullWidth>
              {(assets.data ?? []).map((asset) => (
                <MenuItem key={asset.id} value={asset.id}>
                  {asset.assetTag} - {asset.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="To asset" value={toAssetId} onChange={(e) => setToAssetId(e.target.value)} required fullWidth>
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
            <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth />
            <TextField
              type="date"
              label="Installed at"
              InputLabelProps={{ shrink: true }}
              value={installedAt}
              onChange={(e) => setInstalledAt(e.target.value)}
              fullWidth
            />
            <TextField
              type="date"
              label="Last validated"
              InputLabelProps={{ shrink: true }}
              value={lastValidatedAt}
              onChange={(e) => setLastValidatedAt(e.target.value)}
              fullWidth
            />
            <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={3} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !fromAssetId || !toAssetId || !connectionType.trim() || fromAssetId === toAssetId}
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
