import React from "react"
import {
  GridToolbarContainer,
  GridToolbarExport,
  GridToolbarQuickFilter,
} from "@mui/x-data-grid"
import type { ThemeMode } from "./shared/tokens/colors"

// Column visibility + per-column filter/sort are driven by each column header's
// own menu (the ⋮ → Manage columns / Filter / Sort / Hide) — the single, consistent
// way to shape a table across the app — so the toolbar carries only Export + search.
export function makeGridToolbar(fileName: string, { showSearch = true }: { showSearch?: boolean } = {}) {
  return function GridInnerToolbar() {
    return (
      <GridToolbarContainer sx={{ px: 1, py: 0.5, gap: 1, borderBottom: "1px solid #e2e8f0" }}>
        <GridToolbarExport
          csvOptions={{ fileName: `${fileName}-${new Date().toISOString().split("T")[0]}`, utf8WithBom: true }}
          printOptions={{ disableToolbarButton: true }}
          slotProps={{ button: { sx: { fontSize: 12 } } }}
        />
        {showSearch ? (
          <GridToolbarQuickFilter
            sx={{ ml: "auto", "& .MuiInputBase-input": { fontSize: 12 } }}
            debounceMs={200}
          />
        ) : null}
      </GridToolbarContainer>
    )
  }
}

// `mode` is OPT-IN and defaults to "light" → every existing caller renders the
// exact prior light values unchanged. Only callers that pass mode (Service Desk)
// get the dark branch, so other grids stay light until they migrate.
export const dataGridSx = (clickable: boolean = true, mode: ThemeMode = "light") => {
  const dark = mode === "dark"
  return {
    border: "none",
    height: "100%",
    "& .MuiDataGrid-cell": { borderColor: dark ? "#1e293b" : "#f1f5f9", cursor: clickable ? "pointer" : "default" },
    "& .MuiDataGrid-columnHeaders": { bgcolor: dark ? "#172033" : "#ffffff", borderBottom: dark ? "1px solid #334155" : "1px solid #e2e8f0", fontSize: 12 },
    "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 500 },
    "& .MuiDataGrid-footerContainer": { borderTop: dark ? "1px solid #334155" : "1px solid #e2e8f0" },
    "& .MuiDataGrid-row:hover": { bgcolor: dark ? "#172033" : "#f8fafc" },
  }
}