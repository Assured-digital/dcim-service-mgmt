import React from "react"
import { Box } from "@mui/material"
import { priorityDot } from "../tokens/colors"

export function PriorityDot({ priority, size = 8 }: { priority: string; size?: number }) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: priorityDot(priority),
        flexShrink: 0,
      }}
    />
  )
}
