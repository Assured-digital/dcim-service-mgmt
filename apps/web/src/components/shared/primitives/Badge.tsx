import React from "react"
import { Box, Typography } from "@mui/material"

interface BadgeProps {
  count: number
  max?: number
  variant?: "default" | "active"
}

export function Badge({ count, max = 99, variant = "default" }: BadgeProps) {
  const display = count > max ? `${max}+` : String(count)
  return (
    <Box sx={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 18, height: 18, borderRadius: 9, px: 0.75,
      bgcolor: variant === "active" ? "primary.main" : "var(--color-background-tertiary, #e2e8f0)",
      ml: 0.75
    }}>
      <Typography sx={{
        fontSize: 10.5, fontWeight: 700,
        color: variant === "active" ? "#fff" : "var(--color-text-secondary, #475569)",
        lineHeight: 1
      }}>
        {display}
      </Typography>
    </Box>
  )
}