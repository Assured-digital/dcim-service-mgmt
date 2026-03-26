import React from "react"
import { Box, Chip, Typography } from "@mui/material"
import { chipSx } from "../tokens/colors"

interface DetailHeaderProps {
  reference: string
  status: string
  statusLabel?: string
  priority?: string
  extras?: React.ReactNode
}

export function DetailHeader({
  reference, status, statusLabel, priority, extras
}: DetailHeaderProps) {
  return (
    <Box sx={{
      display: "flex", alignItems: "center", gap: 1,
      px: 1.5, py: 0.75, borderRadius: 2, flexShrink: 0,
      bgcolor: "var(--color-background-primary)",
      border: "1px solid var(--color-border-secondary)",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)"
    }}>
      <Typography sx={{
        fontFamily: "monospace", fontSize: 12, fontWeight: 700,
        color: "var(--color-text-secondary)", whiteSpace: "nowrap"
      }}>
        {reference}
      </Typography>
      <Box sx={{ width: 1, height: 14, bgcolor: "var(--color-border-tertiary)" }} />
      <Chip size="small" sx={chipSx(status)}
        label={statusLabel ?? status} />
      {priority ? (
        <Chip size="small" sx={chipSx(priority)} label={priority} />
      ) : null}
      {extras ?? null}
    </Box>
  )
}