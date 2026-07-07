import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box,
  Button,
  Card,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material"
import { DataGrid, GridColDef, GridRenderCellParams } from "@mui/x-data-grid"
import BuildCircleIcon from "@mui/icons-material/BuildCircle"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { makeGridToolbar, dataGridSx } from "../components/DataGridShell"
import { ListToolbar, ToolbarButton } from "../components/shared/ListToolbar"
import { FormDialog, EnumSelect, DateField, AssigneePicker, FormTextField } from "../components/fields"
import { useAssignableUsers } from "../lib/useAssignableUsers"

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
  performedBy: { id: string; displayName: string } | null
}

type AssetOption = { id: string; assetTag: string; name: string }

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

const MaintenanceToolbar = makeGridToolbar("maintenance")

const maintenanceColumns: GridColDef<MaintenanceRecord>[] = [
  {
    field: "asset", headerName: "Asset", flex: 1, minWidth: 200,
    valueGetter: (_v, row) => `${row.asset.assetTag} ${row.asset.name}`,
    renderCell: (p: GridRenderCellParams<MaintenanceRecord>) => (
      <Stack sx={{ py: 0.5, lineHeight: 1.2 }}>
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{p.row.asset.assetTag}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{p.row.asset.name}</Typography>
      </Stack>
    ),
  },
  {
    field: "workType", headerName: "Work type", width: 180,
    valueGetter: (_v, row) => row.workType === "OTHER" && row.workTypeOther ? row.workTypeOther : row.workType.replaceAll("_", " "),
    renderCell: (p) => <Typography sx={{ fontSize: 12.5 }}>{p.value as string}</Typography>,
  },
  {
    field: "performedAt", headerName: "Performed", width: 120,
    valueGetter: (v) => v ? new Date(v as string) : null,
    renderCell: (p) => <Typography sx={{ fontSize: 12.5 }}>{p.value ? (p.value as Date).toLocaleDateString("en-GB") : "—"}</Typography>,
  },
  {
    field: "nextDueAt", headerName: "Next due", width: 120,
    valueGetter: (v) => v ? new Date(v as string) : null,
    renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: p.value ? "text.primary" : "text.tertiary" }}>{p.value ? (p.value as Date).toLocaleDateString("en-GB") : "—"}</Typography>,
  },
  {
    field: "performedBy", headerName: "By", width: 150,
    valueGetter: (_v, row) => row.performedBy?.displayName ?? "—",
    renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{p.value as string}</Typography>,
  },
  {
    field: "site", headerName: "Site", width: 160,
    valueGetter: (_v, row) => row.asset.site?.name ?? "—",
    renderCell: (p) => <Typography sx={{ fontSize: 12.5 }}>{p.value as string}</Typography>,
  },
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

  // Assignee picker source ("Performed by") — operational-callable &
  // client-scoped, replacing admin-only GET /users. value = id, label = displayName.
  const users = useAssignableUsers()

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
        <ListToolbar>
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
          <Box sx={{ flex: 1 }} />
          {canManage ? (
            <ToolbarButton variant="primary" startIcon={<BuildCircleIcon sx={{ fontSize: "15px !important" }} />} onClick={() => setOpen(true)}>
              Log maintenance
            </ToolbarButton>
          ) : null}
        </ListToolbar>

        {records.isLoading ? <Box sx={{ p: 2 }}><LoadingState /></Box> : null}
        {records.isError ? <Box sx={{ p: 2 }}><ErrorState title="Failed to load maintenance records" /></Box> : null}
        {!records.isLoading && !records.isError && (records.data?.length ?? 0) === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState title="No maintenance records" detail="Log completed maintenance work to track operational history." />
          </Box>
        ) : null}

        {(records.data?.length ?? 0) > 0 ? (
          <Box sx={{ height: 620 }}>
            <DataGrid
              rows={records.data ?? []}
              columns={maintenanceColumns}
              density="compact"
              initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
              pageSizeOptions={[25, 50, 100]}
              disableRowSelectionOnClick
              onRowClick={(params) => navigate(`/maintenance/${(params.row as MaintenanceRecord).id}`)}
              slots={{ toolbar: MaintenanceToolbar }}
              sx={dataGridSx(true)}
            />
          </Box>
        ) : null}
      </Card>

      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        title="Log maintenance"
        submitLabel="Create record"
        submittingLabel="Saving…"
        submitting={saving}
        canSubmit={!!assetId && !!performedAt && !(workType === "OTHER" && !workTypeOther.trim())}
        onSubmit={handleCreate}
      >
        <EnumSelect span="full" label="Asset" required value={assetId} onChange={setAssetId} includeEmpty="Select asset..."
          options={(assets.data ?? []).map((asset) => ({ value: asset.id, label: `${asset.assetTag} - ${asset.name}` }))} />
        <EnumSelect span="full" label="Work type" required value={workType} onChange={setWorkType}
          options={WORK_TYPES.map((type) => ({ value: type, label: type.replaceAll("_", " ") }))} />
        {workType === "OTHER" ? (
          <FormTextField span="full" label="Custom work type" required value={workTypeOther} onChange={(e) => setWorkTypeOther(e.target.value)} />
        ) : null}
        <DateField span="full" label="Performed at" required value={performedAt} onChange={setPerformedAt} />
        <DateField span="full" label="Next due (optional)" value={nextDueAt} onChange={setNextDueAt} />
        <AssigneePicker span="full" label="Performed by (optional)" value={performedById} onChange={setPerformedById}
          users={users.data} emptyLabel="Use current user" />
        <FormTextField span="full" label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={3} />
      </FormDialog>
    </Box>
  )
}
