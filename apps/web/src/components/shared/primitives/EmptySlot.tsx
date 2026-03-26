import React from "react"
import { Box, Typography } from "@mui/material"

interface EmptySlotProps {
  message?: string
  action?: React.ReactNode
}

export function EmptySlot({ message = "No items yet", action }: EmptySlotProps) {
  return (
    <Box sx={{
      py: 1.5, textAlign: "center",
      border: "1px dashed var(--color-border-tertiary)",
      borderRadius: 1.5
    }}>
      <Typography variant="caption" color="text.secondary">
        {message}
      </Typography>
      {action ? <Box sx={{ mt: 1 }}>{action}</Box> : null}
    </Box>
  )
}