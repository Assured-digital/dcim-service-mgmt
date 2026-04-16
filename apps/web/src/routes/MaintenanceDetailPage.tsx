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

type MaintenanceRecord = {
  id: string
  workType: string
  workTypeOther: string | null
  performedAt: string
  nextDueAt: string | null
  notes: string | null
  performedById: string | null
  performedBy: { id: string; email: string } | null
  asset: {
    id: string
    assetTag: string
    name: string
    site: { id: string; name: string } | null
  }
}

type AssetOption = { id: string; assetTag: string; name: string }
type UserOption = { id: string; email: string }

const WORK_TYPES = [
  "INSPECTION",
  "PSU_REPLACEMENT",
  "FIRMWARE_UPGRADE",
  "PAT_INSPECTION",
  "COOLING_CHECK",
  "CABLE_AUDIT",
  "REPAIR",
  "UPGRADE",
  "OTHER"
]

export default function MaintenanceDetailPage() {
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

  const [assetId, setAssetId] = React.useState("")
  const [workType, setWorkType] = React.useState("")
  const [workTypeOther, setWorkTypeOther] = React.useState("")
  const [performedAt, setPerformedAt] = React.useState("")
  const [nextDueAt, setNextDueAt] = React.useState("")
  const [performedById, setPerformedById] = React.useState("")
  const [notes, setNotes] = React.useState("")

  const record = useQuery({
    queryKey: ["maintenance", id],
    queryFn: async () => (await api.get<MaintenanceRecord>(`/maintenance/${id}`)).data,
    enabled: !!id
  })

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<AssetOption[]>("/assets")).data
  })

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserOption[]>("/users")).data
  })

  React.useEffect(() => {
    if (!record.data) return
    setRecordLabel(`${record.data.asset.assetTag} maintenance`)
    setAssetId(record.data.asset.id)
    setWorkType(record.data.workType)
    setWorkTypeOther(record.data.workTypeOther ?? "")
    setPerformedAt(record.data.performedAt.slice(0, 10))
    setNextDueAt(record.data.nextDueAt ? record.data.nextDueAt.slice(0, 10) : "")
    setPerformedById(record.data.performedById ?? "")
    setNotes(record.data.notes ?? "")
  }, [record.data, setRecordLabel])

  async function handleSave() {
    if (!id || !assetId || !performedAt) return
    setSaving(true)
    setError("")
    try {
      await api.put(`/maintenance/${id}`, {
        assetId,
        workType,
        workTypeOther: workType === "OTHER" ? workTypeOther || undefined : undefined,
        performedAt,
        nextDueAt: nextDueAt || null,
        performedById: performedById || null,
        notes
      })
      setEditing(false)
      await qc.invalidateQueries({ queryKey: ["maintenance"] })
      await qc.invalidateQueries({ queryKey: ["maintenance", id] })
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to save maintenance record")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    setDeleting(true)
    setError("")
    try {
      await api.delete(`/maintenance/${id}`)
      await qc.invalidateQueries({ queryKey: ["maintenance"] })
      navigate("/maintenance")
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to delete maintenance record")
    } finally {
      setDeleting(false)
    }
  }

  if (record.isLoading) return <LoadingState />
  if (!record.data) return <ErrorState title="Maintenance record not found" />

  return (
    <Box>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      <Card>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                {record.data.asset.assetTag}
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, mb: 0.5 }}>
                {record.data.asset.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {record.data.asset.site?.name ?? "No site assigned"}
              </Typography>
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

          <Stack spacing={1.25} sx={{ mt: 3 }}>
            <Typography variant="body2">
              <strong>Work type:</strong>{" "}
              {record.data.workType === "OTHER" && record.data.workTypeOther
                ? record.data.workTypeOther
                : record.data.workType.replaceAll("_", " ")}
            </Typography>
            <Typography variant="body2">
              <strong>Performed:</strong> {new Date(record.data.performedAt).toLocaleDateString("en-GB")}
            </Typography>
            <Typography variant="body2">
              <strong>Next due:</strong>{" "}
              {record.data.nextDueAt ? new Date(record.data.nextDueAt).toLocaleDateString("en-GB") : "—"}
            </Typography>
            <Typography variant="body2">
              <strong>Performed by:</strong> {record.data.performedBy?.email ?? "—"}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              <strong>Notes:</strong> {record.data.notes ?? "—"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={editing} onClose={() => setEditing(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit maintenance record</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Asset" value={assetId} onChange={(e) => setAssetId(e.target.value)} required fullWidth>
              {(assets.data ?? []).map((asset) => (
                <MenuItem key={asset.id} value={asset.id}>
                  {asset.assetTag} - {asset.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Work type" value={workType} onChange={(e) => setWorkType(e.target.value)} required fullWidth>
              {WORK_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </MenuItem>
              ))}
            </TextField>
            {workType === "OTHER" ? (
              <TextField
                label="Custom work type"
                value={workTypeOther}
                onChange={(e) => setWorkTypeOther(e.target.value)}
                required
                fullWidth
              />
            ) : null}
            <TextField
              type="date"
              label="Performed at"
              InputLabelProps={{ shrink: true }}
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
              required
              fullWidth
            />
            <TextField
              type="date"
              label="Next due"
              InputLabelProps={{ shrink: true }}
              value={nextDueAt}
              onChange={(e) => setNextDueAt(e.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Performed by"
              value={performedById}
              onChange={(e) => setPerformedById(e.target.value)}
              fullWidth
            >
              <MenuItem value="">No assignee</MenuItem>
              {(users.data ?? []).map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.email}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={3} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !assetId || !performedAt || (workType === "OTHER" && !workTypeOther.trim())}
          >
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
