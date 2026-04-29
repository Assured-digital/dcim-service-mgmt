import React from "react"
import { Box, Stack, Typography } from "@mui/material"
import {
  DataGrid, GridColDef, GridRenderCellParams,
  GridToolbarContainer,
  GridToolbarColumnsButton, GridToolbarExport
} from "@mui/x-data-grid"
import { Asset } from "../lib/infrastructure"

export interface AssetRegisterProps {
  filteredRows: Asset[]
  onAssetClick?: (asset: Asset) => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const TYPE_CHIP_STYLES: Record<string, { bg: string; fg: string }> = {
  "Server": { bg: "#E6F1FB", fg: "#0C447C" },
  "Network Device": { bg: "#EEEDFE", fg: "#3C3489" },
  "Network Storage": { bg: "#E1F5EE", fg: "#085041" },
  "Rack PDU": { bg: "#FAEEDA", fg: "#633806" },
  "Patch Panel": { bg: "#F1EFE8", fg: "#444441" },
  "KVM Switch": { bg: "#FBEAF0", fg: "#72243E" },
  "Blade Enclosure": { bg: "#FAECE7", fg: "#4A1B0C" },
  "In Row Cooling": { bg: "#E1F5EE", fg: "#085041" },
}
const typeStyleFor = (type: string) => TYPE_CHIP_STYLES[type] ?? { bg: "#F1EFE8", fg: "#444441" }

const LIFECYCLE_COLOR: Record<string, string> = {
  ACTIVE: "#639922", STAGING: "#BA7517", PLANNED: "#378ADD", PROCUREMENT: "#378ADD", RETIRED: "#888780",
}
const LIFECYCLE_LABEL: Record<string, string> = {
  ACTIVE: "Active", STAGING: "Staging", PLANNED: "Planned", PROCUREMENT: "Procurement", RETIRED: "Retired",
}

function warrantyStatus(expiry: string | null): "expired" | "soon" | "ok" | "none" {
  if (!expiry) return "none"
  const d = new Date(expiry)
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 86400000)
  if (d < now) return "expired"
  if (d < in30) return "soon"
  return "ok"
}

function formatLocation(a: Asset): string {
  const site = a.site?.name
  const cab = a.cabinet?.name
  if (site && cab) return `${site} / ${cab}`
  if (site) return site
  if (cab) return cab
  return "—"
}

// ─── Grid toolbar ─────────────────────────────────────────────────────────

function GridInnerToolbar() {
  return (
    <GridToolbarContainer sx={{ px: 1, py: 0.5, gap: 1, borderBottom: "1px solid #e2e8f0" }}>
      <GridToolbarColumnsButton slotProps={{ button: { sx: { fontSize: 12 } } }} />
      <GridToolbarExport
        csvOptions={{ fileName: `assets-register-${new Date().toISOString().split("T")[0]}`, utf8WithBom: true }}
        printOptions={{ disableToolbarButton: true }}
        slotProps={{ button: { sx: { fontSize: 12 } } }}
      />
    </GridToolbarContainer>
  )
}

// ─── Main component ───────────────────────────────────────────────────────

const AssetRegister = React.memo(function AssetRegister({ filteredRows, onAssetClick }: AssetRegisterProps) {

  const columns: GridColDef<Asset>[] = React.useMemo(() => [
    {
      field: "assetTag", headerName: "Tag", width: 110,
      renderCell: (p: GridRenderCellParams<Asset>) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "#475569" }}>{p.value as string}</Typography>
      ),
    },
    { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
    {
      field: "assetType", headerName: "Type", width: 130,
      renderCell: (p) => {
        const s = typeStyleFor(p.value as string)
        return <Box sx={{ display: "inline-block", fontSize: 11, fontWeight: 500, px: "8px", py: "2px", borderRadius: "4px", bgcolor: s.bg, color: s.fg }}>{p.value as string}</Box>
      },
    },
    {
      field: "modelNumber", headerName: "Model", width: 180,
      renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: "#64748b" }}>{(p.value as string) || "—"}</Typography>,
    },
    {
      field: "location", headerName: "Location", width: 170, sortable: false,
      valueGetter: (_v, row) => formatLocation(row),
      renderCell: (p) => <Typography sx={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{p.value as string}</Typography>,
    },
    {
      field: "uPosition", headerName: "U pos", width: 80, align: "right", headerAlign: "right",
      renderCell: (p) => <Typography sx={{ fontFamily: "monospace", fontSize: 12 }}>{p.value != null ? `U${String(p.value).padStart(2, "0")}` : "—"}</Typography>,
    },
    {
      field: "powerDrawW", headerName: "Power", width: 90, align: "right", headerAlign: "right",
      renderCell: (p) => <Typography sx={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{p.value != null ? `${Math.round(p.value as number)} W` : "—"}</Typography>,
    },
    {
      field: "lifecycleState", headerName: "Lifecycle", width: 120,
      renderCell: (p) => (
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: LIFECYCLE_COLOR[p.value as string] ?? "#888780" }} />
          <Typography sx={{ fontSize: 12.5 }}>{LIFECYCLE_LABEL[p.value as string] ?? (p.value as string)}</Typography>
        </Stack>
      ),
    },
    {
      field: "warrantyExpiry", headerName: "Warranty", width: 130,
      renderCell: (p) => {
        const v = p.value as string | null
        if (!v) return <Typography sx={{ fontSize: 12.5, color: "#94a3b8" }}>—</Typography>
        const status = warrantyStatus(v)
        const label = status === "expired" ? "Expired" : new Date(v).toISOString().split("T")[0]
        const color = status === "expired" ? "#b91c1c" : status === "soon" ? "#b45309" : "#0f172a"
        return <Typography sx={{ fontSize: 12.5, color, fontWeight: status === "expired" || status === "soon" ? 500 : 400, whiteSpace: "nowrap" }}>{label}</Typography>
      },
    },
    { field: "manufacturer", headerName: "Manufacturer", width: 130 },
    {
      field: "serialNumber", headerName: "Serial", width: 140,
      renderCell: (p) => <Typography sx={{ fontFamily: "monospace", fontSize: 11.5, color: "#64748b" }}>{(p.value as string) || "—"}</Typography>,
    },
    {
      field: "installDate", headerName: "Installed", width: 120,
      renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: "#64748b" }}>{p.value ? new Date(p.value as string).toISOString().split("T")[0] : "—"}</Typography>,
    },
    {
      field: "deviceType", headerName: "Device Type", width: 180,
      valueGetter: () => "",
      renderCell: () => <Typography sx={{ fontSize: 12.5, color: "#94a3b8" }}>—</Typography>,
    },
  ], [])

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* DataGrid (toolbar is inline via slots.toolbar) */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <DataGrid
          rows={filteredRows}
          columns={columns}
          density="compact"
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            columns: { columnVisibilityModel: { manufacturer: false, serialNumber: false, installDate: false, deviceType: false, warrantyExpiry: false } },
          }}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          onRowClick={onAssetClick ? (params) => onAssetClick(params.row as Asset) : undefined}
          slots={{ toolbar: GridInnerToolbar }}
          sx={{
            border: "none", height: "100%",
            "& .MuiDataGrid-cell": { borderColor: "#f1f5f9", cursor: onAssetClick ? "pointer" : "default" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0", fontSize: 12 },
            "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 500 },
            "& .MuiDataGrid-footerContainer": { borderTop: "1px solid #e2e8f0" },
            "& .MuiDataGrid-row:hover": { bgcolor: "#f8fafc" },
          }}
        />
      </Box>
    </Box>
  )
})

export default AssetRegister