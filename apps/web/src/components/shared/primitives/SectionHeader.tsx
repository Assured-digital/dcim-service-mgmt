import React from "react"
import { Box, Stack, Tooltip, Typography } from "@mui/material"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"

interface SectionHeaderProps {
  label: string
  action?: React.ReactNode
  tooltip?: string
}

export function SectionHeader({ label, action, tooltip }: SectionHeaderProps) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Typography sx={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
          color: "var(--color-text-tertiary)"
        }}>
          {label}
        </Typography>
        {tooltip ? (
          <Tooltip title={tooltip} placement="right" arrow>
            <InfoOutlinedIcon sx={{
              fontSize: 13, color: "var(--color-text-tertiary)", cursor: "help"
            }} />
          </Tooltip>
        ) : null}
      </Stack>
      {action ? <Box>{action}</Box> : null}
    </Stack>
  )
}