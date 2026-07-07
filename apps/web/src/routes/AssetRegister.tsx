import React from "react"
import { Box, Stack, Typography } from "@mui/material"
import { DataGrid, GridColDef, GridRenderCellParams, GridRowSelectionModel } from "@mui/x-data-grid"
import { useThemeMode } from "../lib/theme"
import { Asset, assetTypeAccent, lifecycleGlyphColor } from "../lib/infrastructure"
import { healthColor, HEALTH_LABEL } from "../lib/readings"
import { dataGridSx } from "../components/DataGridShell"
import { assetHealth, warrantyStatus } from "./assetRegisterFilters"

export interface AssetRegisterProps {
  filteredRows: Asset[]
  onAssetClick?: (asset: Asset) => void
  // Bulk selection (register power-feature). Omitted → no checkbox column.
  selectedIds?: Set<string>
  onSelectionChange?: (ids: string[]) => void
}

const LIFECYCLE_LABEL: Record<string, string> = {
  ACTIVE: "Active", STAGING: "Staging", PLANNED: "Planned", PROCUREMENT: "Procurement", RETIRED: "Retired",
}

// The register table — now a DataGrid so every column carries the shared flow:
// the header ⋮ menu (filter / sort / hide / manage columns) and drag-to-resize,
// consistent with the rest of the app's tables. The dense, colour-encoded cells
// (stacked name, type badge, power comparison bar, lifecycle/health dots, warranty
// tint) are preserved via renderCell; valueGetters keep sort/filter on the right
// underlying value. Rows navigate to the asset detail page.
const AssetRegister = React.memo(function AssetRegister({ filteredRows, onAssetClick, selectedIds, onSelectionChange }: AssetRegisterProps) {
  const { mode } = useThemeMode()
  const selectable = !!selectedIds && !!onSelectionChange
  const trackBg = mode === "dark" ? "rgba(148,163,184,.16)" : "rgba(100,116,139,.15)"

  // Power mini-bars are scaled against the heaviest draw in the current view — a
  // relative comparison aid, not an absolute capacity claim.
  const maxPowerW = React.useMemo(
    () => filteredRows.reduce((m, a) => Math.max(m, a.powerDrawW ?? 0), 0),
    [filteredRows]
  )

  const columns = React.useMemo<GridColDef<Asset>[]>(() => [
    {
      field: "name", headerName: "Asset", flex: 1.4, minWidth: 200,
      renderCell: (p: GridRenderCellParams<Asset>) => {
        const secondary = [p.row.assetTag, p.row.modelNumber].filter(Boolean).join(" · ")
        return (
          <Box sx={{ py: "6px", lineHeight: 1.25 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25 }}>{p.row.name}</Typography>
            {secondary ? (
              <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontFamily: "monospace" }}>{secondary}</Typography>
            ) : null}
          </Box>
        )
      },
    },
    {
      field: "assetType", headerName: "Type", width: 140,
      renderCell: (p) => {
        const t = assetTypeAccent(p.row.assetType, mode)
        return <Box sx={{ display: "inline-block", fontSize: 11, fontWeight: 600, px: "8px", py: "2px", borderRadius: "6px", bgcolor: t.bg, color: t.fg, whiteSpace: "nowrap" }}>{p.row.assetType}</Box>
      },
    },
    {
      field: "location", headerName: "Location", flex: 1, minWidth: 160,
      valueGetter: (_v, row) => `${row.site?.name ?? ""}${row.cabinet ? ` / ${row.cabinet.name}` : ""}`.trim(),
      renderCell: (p) => (
        <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
          {p.row.site?.name ?? "—"}{p.row.cabinet ? ` / ${p.row.cabinet.name}` : ""}
        </Typography>
      ),
    },
    {
      field: "uPosition", headerName: "U", width: 74, type: "number", align: "right", headerAlign: "right",
      renderCell: (p) => (
        <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: "text.secondary" }}>
          {p.row.uPosition != null ? `U${String(p.row.uPosition).padStart(2, "0")}` : "—"}
        </Typography>
      ),
    },
    {
      field: "powerDrawW", headerName: "Power", width: 128, type: "number", align: "right", headerAlign: "right",
      valueGetter: (_v, row) => row.powerDrawW ?? 0,
      renderCell: (p) => {
        const w = p.row.powerDrawW
        if (w == null || w <= 0) return <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>—</Typography>
        return (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ justifyContent: "flex-end", width: "100%" }}>
            <Box sx={{ width: 46, height: 5, borderRadius: "3px", bgcolor: trackBg, overflow: "hidden", flexShrink: 0 }}>
              <Box sx={{ width: `${maxPowerW > 0 ? Math.max(6, (w / maxPowerW) * 100) : 0}%`, height: "100%", borderRadius: "3px", bgcolor: mode === "dark" ? "#f59e0b" : "#d97706" }} />
            </Box>
            <Typography sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "text.secondary", whiteSpace: "nowrap" }}>{Math.round(w)} W</Typography>
          </Stack>
        )
      },
    },
    {
      field: "lifecycleState", headerName: "Lifecycle", width: 140,
      valueGetter: (_v, row) => LIFECYCLE_LABEL[row.lifecycleState] ?? row.lifecycleState,
      renderCell: (p) => (
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: lifecycleGlyphColor(p.row.lifecycleState, mode), flexShrink: 0 }} />
          <Typography sx={{ fontSize: 12 }}>{LIFECYCLE_LABEL[p.row.lifecycleState] ?? p.row.lifecycleState}</Typography>
        </Stack>
      ),
    },
    {
      field: "health", headerName: "Health", width: 130, sortable: true,
      valueGetter: (_v, row) => HEALTH_LABEL[assetHealth(row)],
      renderCell: (p) => {
        const h = assetHealth(p.row)
        return (
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: healthColor(h, mode), flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12, color: h === "UNKNOWN" ? "text.tertiary" : "text.primary" }}>{HEALTH_LABEL[h]}</Typography>
          </Stack>
        )
      },
    },
    {
      field: "warrantyExpiry", headerName: "Warranty", width: 130,
      renderCell: (p) => {
        const ws = warrantyStatus(p.row.warrantyExpiry)
        const warrantyColor = ws === "expired"
          ? (mode === "dark" ? "#ef4444" : "#b91c1c")
          : ws === "soon" ? (mode === "dark" ? "#f59e0b" : "#b45309") : "text.secondary"
        return (
          <Typography sx={{ fontSize: 12, color: warrantyColor, fontWeight: ws === "expired" || ws === "soon" ? 600 : 400, whiteSpace: "nowrap" }}>
            {p.row.warrantyExpiry ? (ws === "expired" ? "Expired" : p.row.warrantyExpiry.split("T")[0]) : "—"}
          </Typography>
        )
      },
    },
    {
      field: "serialNumber", headerName: "Serial", width: 150,
      renderCell: (p) => <Typography sx={{ fontSize: 11.5, fontFamily: "monospace", color: "text.secondary" }}>{p.row.serialNumber || "—"}</Typography>,
    },
  ], [mode, maxPowerW, trackBg])

  const selectionModel: GridRowSelectionModel = React.useMemo(
    () => (selectedIds ? Array.from(selectedIds) : []),
    [selectedIds]
  )

  return (
    <Box sx={{ height: "100%", width: "100%" }}>
      <DataGrid
        rows={filteredRows}
        columns={columns}
        density="compact"
        rowHeight={52}
        checkboxSelection={selectable}
        disableRowSelectionOnClick
        keepNonExistentRowsSelected
        rowSelectionModel={selectable ? selectionModel : undefined}
        onRowSelectionModelChange={selectable ? (model) => onSelectionChange!(model as string[]) : undefined}
        onRowClick={(p) => onAssetClick?.(p.row as Asset)}
        initialState={{ pagination: { paginationModel: { pageSize: 100 } } }}
        pageSizeOptions={[50, 100, 250]}
        slots={{
          noRowsOverlay: () => (
            <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>No assets match the current filters.</Typography>
            </Stack>
          ),
        }}
        sx={{
          ...dataGridSx(!!onAssetClick, mode),
          "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" },
        }}
      />
    </Box>
  )
})

export default AssetRegister
