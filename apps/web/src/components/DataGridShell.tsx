import React from "react"
import {
  GridToolbarContainer,
  GridToolbarColumnsButton,
  GridToolbarExport,
  GridToolbarQuickFilter,
} from "@mui/x-data-grid"

export function makeGridToolbar(fileName: string, { showSearch = true }: { showSearch?: boolean } = {}) {
  return function GridInnerToolbar() {
    return (
      <GridToolbarContainer sx={{ px: 1, py: 0.5, gap: 1, borderBottom: "1px solid #e2e8f0" }}>
        <GridToolbarColumnsButton slotProps={{ button: { sx: { fontSize: 12 } } }} />
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

export const dataGridSx = (clickable: boolean = true) => ({
  border: "none",
  height: "100%",
  "& .MuiDataGrid-cell": { borderColor: "#f1f5f9", cursor: clickable ? "pointer" : "default" },
  "& .MuiDataGrid-columnHeaders": { bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0", fontSize: 12 },
  "& .MuiDataGrid-columnHeaderTitle": { fontWeight: 500 },
  "& .MuiDataGrid-footerContainer": { borderTop: "1px solid #e2e8f0" },
  "& .MuiDataGrid-row:hover": { bgcolor: "#f8fafc" },
})