import React from "react"
import { Box, Chip, Stack, Typography } from "@mui/material"

export interface DialogField {
  key: string
  label: string
  type: "text" | "textarea" | "select"
  options?: string[]
  required: boolean
}

export interface Transition {
  from: string
  to: string
  label: string
  color?: "primary" | "error" | "warning" | "success"
  requiresDialog: boolean
  dialogFields?: DialogField[]
}

interface WorkflowStripProps {
  currentStatus: string
  transitions: Transition[]
  onTransition: (to: string) => void
}

function WorkflowStripImpl({ currentStatus, transitions, onTransition }: WorkflowStripProps) {
  const available = React.useMemo(
    () => transitions.filter((t) => t.from === currentStatus),
    [transitions, currentStatus]
  )

  const handleClick = React.useCallback(
    (to: string) => () => onTransition(to),
    [onTransition]
  )

  if (available.length === 0) {
    return (
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "text.secondary",
          }}
        >
          STATUS
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {currentStatus} — no further transitions
        </Typography>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        px: 2,
        py: 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "text.secondary",
            mr: 0.5,
          }}
        >
          STATUS · {currentStatus}
        </Typography>
        {available.map((t) => (
          <Chip
            key={t.to}
            label={t.label}
            color={t.color ?? "primary"}
            variant="outlined"
            size="small"
            clickable
            onClick={handleClick(t.to)}
            sx={{ fontWeight: 600 }}
          />
        ))}
      </Stack>
    </Box>
  )
}

export const WorkflowStrip = React.memo(WorkflowStripImpl)
