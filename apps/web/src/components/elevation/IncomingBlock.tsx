import React from "react"
import { Box, Tooltip, Typography } from "@mui/material"
import LoginIcon from "@mui/icons-material/Login"
import { useThemeMode } from "../../lib/theme"
import { IncomingMove } from "../../lib/infrastructure"
import { RACK_U_HEIGHT } from "./constants"

// Incoming MOVE ghost (MAC Phase 2 — dual-position shadow). A dashed blue block
// at the target slot while the asset still physically sits at its current
// cabinet, until the linked Task/Change completes and applies the move.
export const IncomingBlock = React.memo(function IncomingBlock({
  incoming, h
}: {
  incoming: IncomingMove; h: number
}) {
  const { mode } = useThemeMode()
  const height = RACK_U_HEIGHT * h + Math.max(0, h - 1)
  const fg = mode === "dark" ? "#60a5fa" : "#1d4ed8"
  const bg = mode === "dark" ? "rgba(37,99,235,0.14)" : "rgba(29,78,216,0.07)"
  const stripeAlt = mode === "dark" ? "rgba(37,99,235,0.20)" : "rgba(29,78,216,0.12)"
  const from = incoming.fromCabinet ? ` from ${incoming.fromCabinet.name}` : ""

  return (
    <Tooltip title={`Incoming — ${incoming.name} (${incoming.assetType})${from} · pending move work order`} placement="right" arrow>
      <Box
        sx={{
          height, display: "flex", alignItems: "center", gap: "5px", px: "7px", mb: "1px",
          background: `repeating-linear-gradient(45deg, ${bg}, ${bg} 6px, ${stripeAlt} 6px, ${stripeAlt} 12px)`,
          border: "1.5px dashed", borderColor: fg,
          borderRadius: "2px", overflow: "hidden"
        }}
      >
        <LoginIcon sx={{ fontSize: 12, color: fg, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Incoming — {incoming.name}
          <Box component="span" sx={{ fontWeight: 400, ml: "5px" }}>{from.trim()}</Box>
        </Typography>
      </Box>
    </Tooltip>
  )
})
