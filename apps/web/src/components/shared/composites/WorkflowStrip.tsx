import React from "react"
import { Box, Stack, Tooltip, Typography } from "@mui/material"
import CheckIcon from "@mui/icons-material/Check"

export interface WorkflowStage {
  id: string
  label: string
  description?: string
}

interface WorkflowStripProps {
  stages: WorkflowStage[]
  currentStage: string
  mb?: number
  specialStageColors?: Record<string, string>
}

// A slim, passive lifecycle indicator — a single flat row of stages (dot + label) with
// the current one highlighted. Deliberately non-interactive (cursor:default, no chip /
// button affordance, no help-cursor icon): the record's editable status lives elsewhere
// (e.g. the Details panel), so this is purely a visual cue of where the record sits in
// its lifecycle and shouldn't read as clickable.
export function WorkflowStrip({
  stages,
  currentStage,
  mb = 3,
  specialStageColors = {}
}: WorkflowStripProps) {
  const currentIndex = stages.findIndex(s => s.id === currentStage)

  return (
    <Box sx={{
      border: "0.5px solid var(--color-border-tertiary)",
      borderRadius: 2,
      bgcolor: "var(--color-background-primary)",
      px: 1.25, py: 0.6, mb
    }}>
      <Stack direction="row" spacing={0} alignItems="center">
        {stages.map((stage, idx) => {
          const isCurrent = stage.id === currentStage
          const isPast = idx < currentIndex
          const specialColor = isCurrent ? (specialStageColors[stage.id] ?? "#0f172a") : null

          return (
            <React.Fragment key={stage.id}>
              <Tooltip
                title={stage.description ?? ""}
                placement="bottom"
                arrow
                disableHoverListener={!stage.description}
              >
                <Stack direction="row" spacing={0.6} alignItems="center" sx={{
                  flex: 1, justifyContent: "center", px: 0.75, py: 0.3, cursor: "default"
                }}>
                  {isCurrent ? (
                    <Box sx={{
                      width: 14, height: 14, borderRadius: "50%", bgcolor: specialColor!,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      <CheckIcon sx={{ fontSize: 9, color: "#fff" }} />
                    </Box>
                  ) : isPast ? (
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: "#cbd5e1", flexShrink: 0 }} />
                  ) : (
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", border: "1.25px solid #e2e8f0", flexShrink: 0 }} />
                  )}
                  <Typography sx={{
                    fontSize: 10.5, fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? "#0f172a" : isPast ? "#94a3b8" : "text.tertiary",
                    whiteSpace: "nowrap"
                  }}>
                    {stage.label}
                  </Typography>
                </Stack>
              </Tooltip>

              {idx < stages.length - 1 ? (
                <Box sx={{ width: 12, height: 1, bgcolor: "var(--color-border-tertiary)", flexShrink: 0 }} />
              ) : null}
            </React.Fragment>
          )
        })}
      </Stack>
    </Box>
  )
}
