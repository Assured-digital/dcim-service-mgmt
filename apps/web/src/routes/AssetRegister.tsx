import React from "react"
import { Box, Stack, Typography } from "@mui/material"
import {
  DataGrid, GridColDef, GridRenderCellParams,
  GridToolbarContainer,
  GridToolbarColumnsButton, GridToolbarExport
} from "@mui/x-data-grid"
import { useThemeMode } from "../lib/theme"
import { Asset, lifecycleGlyphColor } from "../lib/infrastructure"

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
// Dark counterparts — same identity hue re-scaled to a deep, low-luminance
// fill with a light foreground (mirrors ASSET_TYPE_BG_DARK in infrastructure.ts).
const TYPE_CHIP_STYLES_DARK: Record<string, { bg: string; fg: string }> = {
  "Server": { bg: "#16294a", fg: "#93c5fd" },
  "Network Device": { bg: "#1e1b3a", fg: "#c4b5fd" },
  "Network Storage": { bg: "#13351f", fg: "#6ee7b7" },
  "Rack PDU": { bg: "#3a2c0f", fg: "#fcd34d" },
  "Patch Panel": { bg: "#1e293b", fg: "#cbd5e1" },
  "KVM Switch": { bg: "#311823", fg: "#f9a8d4" },
  "Blade Enclosure": { bg: "#3a1a1a", fg: "#fca5a5" },
  "In Row Cooling": { bg: "#13351f", fg: "#6ee7b7" },
}
const typeStyleFor = (type: string, mode: "light" | "dark") =>
  mode === "dark"
    ? (TYPE_CHIP_STYLES_DARK[type] ?? { bg: "#1e293b", fg: "#cbd5e1" })
    : (TYPE_CHIP_STYLES[type] ?? { bg: "#F1EFE8", fg: "#444441" })

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
    <GridToolbarContainer sx={{ px: 1, py: 0.5, gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>
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
  const { mode } = useThemeMode()

  const columns: GridColDef<Asset>[] = React.useMemo(() => [
    {
      field: "assetTag", headerName: "Tag", width: 110,
      renderCell: (p: GridRenderCellParams<Asset>) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}>{p.value as string}</Typography>
      ),
    },
    { field: "name", headerName: "Name", flex: 1, minWidth: 160 },
    {
      field: "assetType", headerName: "Type", width: 130,
      renderCell: (p) => {
        const s = typeStyleFor(p.value as string, mode)
        return <Box sx={{ display: "inline-block", fontSize: 11, fontWeight: 500, px: "8px", py: "2px", borderRadius: "4px", bgcolor: s.bg, color: s.fg }}>{p.value as string}</Box>
      },
    },
    {
      field: "modelNumber", headerName: "Model", width: 180,
      renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{(p.value as string) || "—"}</Typography>,
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
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: lifecycleGlyphColor(p.value as string, mode) }} />
          <Typography sx={{ fontSize: 12.5 }}>{LIFECYCLE_LABEL[p.value as string] ?? (p.value as string)}</Typography>
        </Stack>
      ),
    },
    {
      field: "warrantyExpiry", headerName: "Warranty", width: 130,
      renderCell: (p) => {
        const v = p.value as string | null
        if (!v) return <Typography sx={{ fontSize: 12.5, color: "text.tertiary" }}>—</Typography>
        const status = warrantyStatus(v)
        const label = status === "expired" ? "Expired" : new Date(v).toISOString().split("T")[0]
        const color = status === "expired" ? (mode === "dark" ? "#ef4444" : "#b91c1c") : status === "soon" ? (mode === "dark" ? "#f59e0b" : "#b45309") : "text.primary"
        return <Typography sx={{ fontSize: 12.5, color, fontWeight: status === "expired" || status === "soon" ? 500 : 400, whiteSpace: "nowrap" }}>{label}</Typography>
      },
    },
    { field: "manufacturer", headerName: "Manufacturer", width: 130 },
    {
      field: "serialNumber", headerName: "Serial", width: 140,
      renderCell: (p) => <Typography sx={{ fontFamily: "monospace", fontSize: 11.5, color: "text.secondary" }}>{(p.value as string) || "—"}</Typography>,
    },
    {
      field: "installDate", headerName: "Installed", width: 120,
      renderCell: (p) => <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{p.value ? new Date(p.value as string).toISOString().split("T")[0] : "—"}</Typography>,
    },
    {
      field: "deviceType", headerName: "Device Type", width: 180,
      valueGetter: () => "",
      renderCell: () => <Typography sx={{ fontSize: 12.5, color: "text.tertiary" }}>—</Typography>,
    },
  ], [mode])

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
            "& .MuiDataGrid-cell": { borderColor: "divider", cursor: onAssetClick ? "pointer" : "default" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", fontSize: 12 },
            "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 500 },
            "& .MuiDataGrid-footerContainer": { borderTop: "1px solid", borderColor: "divider" },
            "& .MuiDataGrid-row:hover": { bgcolor: "action.hover" },
          }}
        />
      </Box>
    </Box>
  )
})

export default AssetRegister