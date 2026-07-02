import React from "react"
import { Box, Tooltip, Typography } from "@mui/material"
import { useThemeMode } from "../../lib/theme"
import { semanticToken } from "../shared/tokens/colors"
import { RACK_U_HEIGHT } from "./constants"
import { TargetState } from "./useElevationModel"

// An empty U row (A3, spec §2.1). Two behaviours:
//  - normal mode + canManage: hover reveals "+ Add here — U{n}" (the NetBox
//    click-empty-slot interaction); click opens the add-asset dialog prefilled.
//  - move mode: renders the classified target state — valid (green outline),
//    reserved (amber — advisory, confirm places anyway), invalid (inert).
export const ElevationEmptySlot = React.memo(function ElevationEmptySlot({
  u, canAdd, target, onAdd, onPickTarget
}: {
  u: number
  canAdd: boolean
  target: TargetState | null // null = not in move mode
  onAdd: (u: number) => void
  onPickTarget: (u: number) => void
}) {
  const { mode } = useThemeMode()
  const isDark = mode === "dark"
  const baseBorder = isDark ? "rgba(71,85,105,0.4)" : "rgba(203,213,225,0.4)"

  if (target != null) {
    const ok = target === "valid"
    const reserved = target === "reserved"
    const token = ok ? semanticToken("success", mode) : reserved ? semanticToken("warning", mode) : null
    return (
      <Box
        onClick={() => (ok || reserved) && onPickTarget(u)}
        sx={{
          height: RACK_U_HEIGHT,
          borderBottom: token ? "none" : `1px solid ${baseBorder}`,
          ...(token ? {
            bgcolor: token.bg, border: `1px solid ${token.text}`, borderRadius: "2px",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            "&:hover": { boxShadow: `inset 0 0 0 1px ${token.text}` }
          } : { opacity: 0.35 })
        }}
      >
        {token ? (
          <Typography sx={{ fontSize: 9, fontWeight: 700, color: token.text, lineHeight: 1 }}>
            U{u}{reserved ? " · reserved" : ""}
          </Typography>
        ) : null}
      </Box>
    )
  }

  if (!canAdd) {
    return <Box sx={{ height: RACK_U_HEIGHT, borderBottom: `1px solid ${baseBorder}` }} />
  }

  return (
    <Tooltip title={`Add an asset at U${u}`} placement="right" arrow enterDelay={400}>
      <Box
        onClick={() => onAdd(u)}
        sx={{
          height: RACK_U_HEIGHT, borderBottom: `1px solid ${baseBorder}`,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          "& .addHint": { opacity: 0 },
          "&:hover": {
            bgcolor: isDark ? "rgba(59,130,246,0.12)" : "#eff6ff",
            borderRadius: "2px",
            "& .addHint": { opacity: 1 }
          }
        }}
      >
        <Typography className="addHint" sx={{ fontSize: 9, fontWeight: 700, color: isDark ? "#60a5fa" : "#1d4ed8", lineHeight: 1, transition: "opacity 120ms" }}>
          + Add here — U{u}
        </Typography>
      </Box>
    </Tooltip>
  )
})
