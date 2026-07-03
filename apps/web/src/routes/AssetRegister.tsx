import React from "react"
import { Box, Stack, Typography } from "@mui/material"
import {
  DataGrid, GridColDef, GridRenderCellParams,
  GridToolbarContainer,
  GridToolbarColumnsButton, GridToolbarExport
} from "@mui/x-data-grid"
import { useThemeMode } from "../lib/theme"
import { Asset, assetTypeAccent, lifecycleGlyphColor } from "../lib/infrastructure"

export interface AssetRegisterProps {
  filteredRows: Asset[]
  onAssetClick?: (asset: Asset) => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────

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

const TOOLBAR_BTN_SX = {
  fontSize: 11.5, fontWeight: 600, textTransform: "none", px: 1.25, py: "3px",
  border: "1px solid", borderColor: "divider", borderRadius: "7px", color: "text.secondary",
  "&:hover": { borderColor: "primary.main", bgcolor: "transparent", color: "text.primary" },
} as const

function GridInnerToolbar() {
  return (
    <GridToolbarContainer sx={{ px: 1.5, py: 0.75, gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>
      <GridToolbarColumnsButton slotProps={{ button: { sx: TOOLBAR_BTN_SX } }} />
      <GridToolbarExport
        csvOptions={{ fileName: `assets-register-${new Date().toISOString().split("T")[0]}`, utf8WithBom: true }}
        printOptions={{ disableToolbarButton: true }}
        slotProps={{ button: { sx: TOOLBAR_BTN_SX } }}
      />
    </GridToolbarContainer>
  )
}

// ─── Main component ───────────────────────────────────────────────────────

const AssetRegister = React.memo(function AssetRegister({ filteredRows, onAssetClick }: AssetRegisterProps) {
  const { mode } = useThemeMode()

  // Power mini-bars are scaled against the heaviest draw in the current view —
  // a relative comparison aid, not an absolute capacity claim.
  const maxPowerW = React.useMemo(
    () => filteredRows.reduce((m, a) => Math.max(m, a.powerDrawW ?? 0), 0),
    [filteredRows]
  )

  const columns: GridColDef<Asset>[] = React.useMemo(() => [
    {
      field: "assetTag", headerName: "Tag", width: 110,
      renderCell: (p: GridRenderCellParams<Asset>) => (
        <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "text.secondary" }}>{p.value as string}</Typography>
      ),
    },
    {
      field: "name", headerName: "Name", flex: 1, minWidth: 160,
      renderCell: (p) => <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{p.value as string}</Typography>,
    },
    {
      field: "assetType", headerName: "Type", width: 130,
      renderCell: (p) => {
        const s = assetTypeAccent(p.value as string, mode)
        return <Box sx={{ display: "inline-block", fontSize: 11, fontWeight: 600, px: "8px", py: "2px", borderRadius: "6px", bgcolor: s.bg, color: s.fg, whiteSpace: "nowrap" }}>{p.value as string}</Box>
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
      field: "powerDrawW", headerName: "Power", width: 120, align: "right", headerAlign: "right",
      renderCell: (p) => {
        const w = p.value as number | null
        if (w == null || w <= 0) return <Typography sx={{ fontSize: 12.5, color: "text.tertiary" }}>—</Typography>
        const pct = maxPowerW > 0 ? Math.max(6, (w / maxPowerW) * 100) : 0
        return (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ width: "100%", justifyContent: "flex-end" }}>
            <Box sx={{ width: 46, height: 5, borderRadius: "3px", bgcolor: mode === "dark" ? "rgba(148,163,184,.16)" : "rgba(100,116,139,.15)", overflow: "hidden", flexShrink: 0 }}>
              <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: "3px", bgcolor: mode === "dark" ? "#f59e0b" : "#d97706" }} />
            </Box>
            <Typography sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "text.secondary", whiteSpace: "nowrap" }}>{Math.round(w)} W</Typography>
          </Stack>
        )
      },
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
  ], [mode, maxPowerW])

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
            border: "none", height: "100%", fontSize: 12.5,
            "& .MuiDataGrid-cell": { borderColor: "divider", cursor: onAssetClick ? "pointer" : "default", display: "flex", alignItems: "center" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "background.default", borderBottom: "1px solid", borderColor: "divider" },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary",
            },
            "& .MuiDataGrid-footerContainer": { borderTop: "1px solid", borderColor: "divider" },
            "& .MuiDataGrid-row:hover": { bgcolor: mode === "dark" ? "rgba(59,130,246,.07)" : "rgba(29,78,216,.05)" },
          }}
        />
      </Box>
    </Box>
  )
})

export default AssetRegister