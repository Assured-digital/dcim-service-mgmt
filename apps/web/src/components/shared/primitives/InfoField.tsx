import React from "react"
import { Box, Typography } from "@mui/material"

interface InfoFieldProps {
  label: string
  children: React.ReactNode
}

export function InfoField({ label, children }: InfoFieldProps) {
  return (
    <Box>
      <Typography sx={{
        fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
        color: "var(--color-text-tertiary)", mb: 0.5
      }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}