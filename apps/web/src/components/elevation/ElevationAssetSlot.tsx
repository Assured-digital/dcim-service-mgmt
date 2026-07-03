import React from "react"
import { Box, Tooltip, Typography } from "@mui/material"
import { useThemeMode } from "../../lib/theme"
import { Asset, assetSlotText, assetTypeAccent, normalizeRackSide, stripeBg } from "../../lib/infrastructure"
import { RACK_U_HEIGHT } from "./constants"

// One asset block in the elevation. Solid on its own face; `ghost` renders the
// muted dashed outline shown on the OPPOSITE face of a full-depth asset
// (DCIM spec §2.1). All colours come from the mode-aware helpers — no inline
// light-only hex (spec §6.2 dark-mode constraint).
export const ElevationAssetSlot = React.memo(function ElevationAssetSlot({
  asset, h, ghost, isSelected, onSelect
}: {
  asset: Asset; h: number; ghost: boolean; isSelected: boolean; onSelect: (id: string) => void
}) {
  const { mode } = useThemeMode()
  const isDark = mode === "dark"
  const text = assetSlotText(mode)
  const height = RACK_U_HEIGHT * h + Math.max(0, h - 1)

  if (ghost) {
    const side = normalizeRackSide(asset.rackSide).toLowerCase()
    return (
      <Tooltip title={`${asset.name} — occupies this range (full depth, ${side}-mounted)`} placement="right" arrow>
        <Box
          onClick={() => onSelect(asset.id)}
          sx={{
            height, display: "flex", alignItems: "center", px: "7px", mb: "1px",
            border: "1px dashed", borderColor: isDark ? "#475569" : "#cbd5e1",
            borderRadius: "2px", cursor: "pointer", overflow: "hidden",
            bgcolor: isDark ? "rgba(30,41,59,0.4)" : "rgba(241,245,249,0.5)"
          }}
        >
          <Typography sx={{ fontSize: 10.5, fontStyle: "italic", color: text.subtitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.name} — {side}-mounted
          </Typography>
        </Box>
      </Tooltip>
    )
  }

  // Retired-but-racked interim state (DCIM_SCHEMA_SPEC §4.1): drawn greyed —
  // still physically in the rack — but excluded from capacity maths server-side.
  const retired = asset.lifecycleState === "RETIRED"
  // A pending MAC work order (install/decommission) draws a dashed amber outline
  // "shadow" until the linked Task/Change completes and applies the op.
  const pending = !!(asset as { pendingOp?: string | null }).pendingOp
  // Type identity (redesign mock): tinted fill + left accent stripe + icon
  // square, alias-matched so raw values ("SWITCH", "ROUTER") get real colours.
  // The RIGHT stripe stays lifecycle — two encodings, two edges.
  const accent = assetTypeAccent(asset.assetType, mode)

  const pendingBorder = mode === "dark" ? "#f59e0b" : "#d97706"

  return (
    <Tooltip title={`${asset.name} · ${asset.assetType}${asset.manufacturer ? ` · ${asset.manufacturer}` : ""}${retired ? " · retired — awaiting removal" : pending ? " · pending work order" : ""}`} placement="right" arrow>
      <Box
        onClick={() => onSelect(asset.id)}
        sx={{
          height, display: "flex", alignItems: "stretch",
          opacity: retired ? 0.45 : 1,
          filter: retired ? "grayscale(0.8)" : "none",
          bgcolor: accent.bg,
          borderLeft: `3px solid ${accent.fg}`,
          border: isSelected ? "2px solid #2563eb" : pending ? `1.5px dashed ${pendingBorder}` : undefined,
          borderTop: isSelected || pending ? undefined : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          borderRight: isSelected || pending ? undefined : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          borderBottom: isSelected || pending ? undefined : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          boxShadow: isSelected ? "0 0 0 1px #2563eb" : "none",
          borderRadius: "3px", mb: "1px", cursor: "pointer", overflow: "hidden",
          "&:hover": { filter: retired ? "grayscale(0.8) brightness(1.1)" : "brightness(1.08)" }
        }}
      >
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", px: "7px", overflow: "hidden" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: accent.fg, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: text.title, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
              {asset.name}
            </Typography>
            {h > 1 && asset.modelNumber ? (
              <Typography sx={{ fontSize: 9, color: text.subtitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2 }}>
                {asset.modelNumber}
              </Typography>
            ) : null}
          </Box>
        </Box>
        <Box sx={{ width: 5, flexShrink: 0, bgcolor: stripeBg(asset.lifecycleState, mode) }} />
      </Box>
    </Tooltip>
  )
})
