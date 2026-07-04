import React from "react"
import {
  Box, Button, Checkbox, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography
} from "@mui/material"
import { useThemeMode } from "../lib/theme"
import { Asset, assetTypeAccent, lifecycleGlyphColor } from "../lib/infrastructure"
import { warrantyStatus } from "./assetRegisterFilters"

export interface AssetRegisterProps {
  filteredRows: Asset[]
  onAssetClick?: (asset: Asset) => void
  // Bulk selection (register power-features). Omitted → no checkbox column.
  selectedIds?: Set<string>
  onToggleRow?: (id: string) => void
  onToggleAll?: (ids: string[], checked: boolean) => void
}

const LIFECYCLE_LABEL: Record<string, string> = {
  ACTIVE: "Active", STAGING: "Staging", PLANNED: "Planned", PROCUREMENT: "Procurement", RETIRED: "Retired",
}

const PAGE = 100

const HEAD_SX = {
  fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "text.secondary", bgcolor: "background.default", whiteSpace: "nowrap",
  borderBottom: "1px solid", borderColor: "divider", py: "9px",
} as const

// The register table — Catalogue-style dense MUI table (the DataGrid and its
// second toolbar/footer chrome are retired). Stacked lead cell (name over
// tag · model), type/lifecycle/warranty encoded in colour, power as a
// comparison mini-bar. Rows navigate to the asset detail page.
const AssetRegister = React.memo(function AssetRegister({ filteredRows, onAssetClick, selectedIds, onToggleRow, onToggleAll }: AssetRegisterProps) {
  const { mode } = useThemeMode()
  const [visible, setVisible] = React.useState(PAGE)
  React.useEffect(() => { setVisible(PAGE) }, [filteredRows])

  const selectable = !!selectedIds && !!onToggleRow && !!onToggleAll
  const allIds = React.useMemo(() => filteredRows.map(a => a.id), [filteredRows])
  const selectedCount = selectable ? allIds.filter(id => selectedIds!.has(id)).length : 0
  const colCount = selectable ? 9 : 8

  // Power mini-bars are scaled against the heaviest draw in the current view —
  // a relative comparison aid, not an absolute capacity claim.
  const maxPowerW = React.useMemo(
    () => filteredRows.reduce((m, a) => Math.max(m, a.powerDrawW ?? 0), 0),
    [filteredRows]
  )

  const rows = filteredRows.slice(0, visible)
  const trackBg = mode === "dark" ? "rgba(148,163,184,.16)" : "rgba(100,116,139,.15)"

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <TableContainer sx={{ flex: 1, minHeight: 0 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {selectable ? (
                <TableCell padding="checkbox" sx={{ ...HEAD_SX, width: 42 }}>
                  <Checkbox size="small" sx={{ p: 0.5 }}
                    checked={selectedCount > 0 && selectedCount === allIds.length}
                    indeterminate={selectedCount > 0 && selectedCount < allIds.length}
                    onChange={e => onToggleAll!(allIds, e.target.checked)} />
                </TableCell>
              ) : null}
              <TableCell sx={HEAD_SX}>Asset</TableCell>
              <TableCell sx={HEAD_SX}>Type</TableCell>
              <TableCell sx={HEAD_SX}>Location</TableCell>
              <TableCell sx={HEAD_SX} align="right">U</TableCell>
              <TableCell sx={HEAD_SX} align="right">Power</TableCell>
              <TableCell sx={HEAD_SX}>Lifecycle</TableCell>
              <TableCell sx={HEAD_SX}>Warranty</TableCell>
              <TableCell sx={HEAD_SX}>Serial</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(a => {
              const t = assetTypeAccent(a.assetType, mode)
              const w = a.powerDrawW
              const ws = warrantyStatus(a.warrantyExpiry)
              const warrantyColor = ws === "expired"
                ? (mode === "dark" ? "#ef4444" : "#b91c1c")
                : ws === "soon" ? (mode === "dark" ? "#f59e0b" : "#b45309") : "text.secondary"
              const secondary = [a.assetTag, a.modelNumber].filter(Boolean).join(" · ")
              const isSel = selectable && selectedIds!.has(a.id)
              return (
                <TableRow key={a.id} hover onClick={() => onAssetClick?.(a)} selected={isSel}
                  sx={{ cursor: onAssetClick ? "pointer" : "default", "&:hover": { bgcolor: mode === "dark" ? "rgba(59,130,246,.07)" : "rgba(29,78,216,.05)" } }}>
                  {selectable ? (
                    <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                      <Checkbox size="small" sx={{ p: 0.5 }} checked={isSel} onChange={() => onToggleRow!(a.id)} />
                    </TableCell>
                  ) : null}
                  <TableCell sx={{ py: "7px" }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.25 }}>{a.name}</Typography>
                    {secondary ? (
                      <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontFamily: "monospace" }}>{secondary}</Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "inline-block", fontSize: 11, fontWeight: 600, px: "8px", py: "2px", borderRadius: "6px", bgcolor: t.bg, color: t.fg, whiteSpace: "nowrap" }}>{a.assetType}</Box>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12, color: "text.secondary", whiteSpace: "nowrap" }}>
                      {a.site?.name ?? "—"}{a.cabinet ? ` / ${a.cabinet.name}` : ""}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: 12, fontFamily: "monospace", color: "text.secondary" }}>
                      {a.uPosition != null ? `U${String(a.uPosition).padStart(2, "0")}` : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {w != null && w > 0 ? (
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ justifyContent: "flex-end" }}>
                        <Box sx={{ width: 46, height: 5, borderRadius: "3px", bgcolor: trackBg, overflow: "hidden", flexShrink: 0 }}>
                          <Box sx={{ width: `${maxPowerW > 0 ? Math.max(6, (w / maxPowerW) * 100) : 0}%`, height: "100%", borderRadius: "3px", bgcolor: mode === "dark" ? "#f59e0b" : "#d97706" }} />
                        </Box>
                        <Typography sx={{ fontSize: 12, fontVariantNumeric: "tabular-nums", color: "text.secondary", whiteSpace: "nowrap" }}>{Math.round(w)} W</Typography>
                      </Stack>
                    ) : (
                      <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: lifecycleGlyphColor(a.lifecycleState, mode), flexShrink: 0 }} />
                      <Typography sx={{ fontSize: 12 }}>{LIFECYCLE_LABEL[a.lifecycleState] ?? a.lifecycleState}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 12, color: warrantyColor, fontWeight: ws === "expired" || ws === "soon" ? 600 : 400, whiteSpace: "nowrap" }}>
                      {a.warrantyExpiry ? (ws === "expired" ? "Expired" : a.warrantyExpiry.split("T")[0]) : "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: 11.5, fontFamily: "monospace", color: "text.secondary" }}>{a.serialNumber || "—"}</Typography>
                  </TableCell>
                </TableRow>
              )
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} sx={{ py: 6, textAlign: "center", border: 0 }}>
                  <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>No assets match the current filters.</Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
      {filteredRows.length > visible ? (
        <Box sx={{ flexShrink: 0, borderTop: "1px solid", borderColor: "divider", px: "16px", py: "7px", display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
            Showing {rows.length} of {filteredRows.length}
          </Typography>
          <Button size="small" onClick={() => setVisible(v => v + PAGE)} sx={{ fontSize: 11.5, textTransform: "none", minWidth: 0 }}>Show {Math.min(PAGE, filteredRows.length - visible)} more</Button>
          <Button size="small" onClick={() => setVisible(filteredRows.length)} sx={{ fontSize: 11.5, textTransform: "none", minWidth: 0, color: "text.secondary" }}>Show all</Button>
        </Box>
      ) : null}
    </Box>
  )
})

export default AssetRegister
