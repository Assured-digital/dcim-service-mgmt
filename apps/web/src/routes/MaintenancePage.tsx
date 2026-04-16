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
import BuildCircleIcon from "@mui/icons-material/BuildCircle"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"

type MaintenanceRecord = {
  id: string
  workType: string
  workTypeOther: string | null
  performedAt: string
  nextDueAt: string | null
  notes: string | null
  asset: {
    id: string
    assetTag: string
    name: string
    site: { id: string; name: string } | null
  }
  performedBy: { id: string; email: string } | null
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

export default function MaintenancePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const [open, setOpen] = React.useState(false)
  const [assetId, setAssetId] = React.useState("")
  const [workType, setWorkType] = React.useState("INSPECTION")
  const [workTypeOther, setWorkTypeOther] = React.useState("")
  const [performedAt, setPerformedAt] = React.useState("")
  const [nextDueAt, setNextDueAt] = React.useState("")
  const [performedById, setPerformedById] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [filterType, setFilterType] = React.useState("ALL")

  const records = useQuery({
    queryKey: ["maintenance", filterType],
    queryFn: async () =>
      (
        await api.get<MaintenanceRecord[]>("/maintenance", {
          params: { workType: filterType === "ALL" ? undefined : filterType }
        })
      ).data
  })

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<AssetOption[]>("/assets")).data
  })

  const users = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<UserOption[]>("/users")).data
  })

  async function handleCreate() {
    if (!assetId || !performedAt) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>("/maintenance", {
        assetId,
        workType,
        workTypeOther: workType === "OTHER" ? workTypeOther || undefined : undefined,
        performedAt,
        nextDueAt: nextDueAt || undefined,
        performedById: performedById || undefined,
        notes: notes || undefined
      })
      setOpen(false)
      setAssetId("")
      setWorkType("INSPECTION")
      setWorkTypeOther("")
      setPerformedAt("")
      setNextDueAt("")
      setPerformedById("")
      setNotes("")
      await qc.invalidateQueries({ queryKey: ["maintenance"] })
      navigate(`/maintenance/${res.data.id}`)
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
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              select
              size="small"
              label="Work type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="ALL">All work types</MenuItem>
              {WORK_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {type.replaceAll("_", " ")}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {canManage ? (
            <Button size="small" variant="contained" startIcon={<BuildCircleIcon sx={{ fontSize: 16 }} />} onClick={() => setOpen(true)}>
              Log maintenance
            </Button>
          ) : null}
        </Box>

        {records.isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {records.isError ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load maintenance records" /></Box> : null}
        {!records.isLoading && !records.isError && (records.data?.length ?? 0) === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState title="No maintenance records" detail="Log completed maintenance work to track operational history." />
          </Box>
        ) : null}

        {(records.data?.length ?? 0) > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Asset</TableCell>
                  <TableCell>Work type</TableCell>
                  <TableCell>Performed</TableCell>
                  <TableCell>Next due</TableCell>
                  <TableCell>By</TableCell>
                  <TableCell>Site</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(records.data ?? []).map((record) => (
                  <TableRow
                    key={record.id}
                    hover
                    onClick={() => navigate(`/maintenance/${record.id}`)}
                    sx={{ cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}
                  >
                    <TableCell>
                      <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
                        {record.asset.assetTag}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {record.asset.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {record.workType === "OTHER" && record.workTypeOther
                        ? record.workTypeOther
                        : record.workType.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell>{new Date(record.performedAt).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell>{record.nextDueAt ? new Date(record.nextDueAt).toLocaleDateString("en-GB") : "—"}</TableCell>
                    <TableCell>{record.performedBy?.email.split("@")[0] ?? "—"}</TableCell>
                    <TableCell>{record.asset.site?.name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log maintenance</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Asset" value={assetId} onChange={(e) => setAssetId(e.target.value)} required fullWidth>
              <MenuItem value="">Select asset...</MenuItem>
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
              label="Next due (optional)"
              InputLabelProps={{ shrink: true }}
              value={nextDueAt}
              onChange={(e) => setNextDueAt(e.target.value)}
              fullWidth
            />
            <TextField
              select
              label="Performed by (optional)"
              value={performedById}
              onChange={(e) => setPerformedById(e.target.value)}
              fullWidth
            >
              <MenuItem value="">Use current user</MenuItem>
              {(users.data ?? []).map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  {user.email}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={3}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving || !assetId || !performedAt || (workType === "OTHER" && !workTypeOther.trim())}
          >
            {saving ? "Saving..." : "Create record"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
