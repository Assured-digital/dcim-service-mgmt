import React from "react"
import { Box, Typography } from "@mui/material"
import { PriorityDot } from "../primitives/PriorityDot"

// Engine-agnostic priority cell — the shared PriorityDot (canonical priorityDots
// token) + a caller-supplied label, matching the dot+text treatment used by the
// Service Desk queue. Pass `trailing` for an inline edit affordance (e.g. a caret).
export function PriorityCell({
  priority,
  label,
  trailing,
}: {
  priority: string
  label: React.ReactNode
  trailing?: React.ReactNode
}) {
  return (
    <Box
      component="span"
      sx={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}
    >
      <PriorityDot priority={priority} />
      <Typography component="span" sx={{ fontSize: 12.5, color: "#475569", lineHeight: 1 }}>
        {label}
      </Typography>
      {trailing}
    </Box>
  )
}
