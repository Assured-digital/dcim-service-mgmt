import React from "react"
import { Box, Stack, Tooltip, Typography } from "@mui/material"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
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
      borderTop: "none",
      borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
      bgcolor: "var(--color-background-primary)",
      px: 1.5, pt: 0.75, pb: 1, mb
    }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
        <Typography sx={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
          color: "var(--color-text-tertiary)"
        }}>
          STATUS
        </Typography>
        <Tooltip
          title="Lifecycle progress for this record."
          placement="right"
          arrow
        >
          <InfoOutlinedIcon sx={{
            fontSize: 11, color: "var(--color-text-tertiary)", cursor: "help"
          }} />
        </Tooltip>
      </Stack>

      <Stack direction="row" spacing={0} alignItems="stretch">
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
                <Box
                  sx={{
                    flex: 1, px: 1, py: 0.75, borderRadius: 1,
                    cursor: "default",
                    bgcolor: isCurrent
                      ? specialColor!
                      : isPast ? "#f1f5f9"
                      : "transparent",
                    border: "1px solid",
                    borderColor: isCurrent
                      ? specialColor!
                      : isPast ? "var(--color-border-tertiary)"
                      : "transparent",
                    transition: "all 0.15s",
                    "&:hover": {}
                  }}
                >
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    {isCurrent ? (
                      <Box sx={{
                        width: 12, height: 12, borderRadius: "50%", bgcolor: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                      }}>
                        <CheckIcon sx={{ fontSize: 9, color: specialColor! }} />
                      </Box>
                    ) : isPast ? (
                      <Box sx={{
                        width: 12, height: 12, borderRadius: "50%", bgcolor: "#cbd5e1",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                      }}>
                        <CheckIcon sx={{ fontSize: 9, color: "#fff" }} />
                      </Box>
                    ) : (
                      <Box sx={{
                        width: 12, height: 12, borderRadius: "50%",
                        border: "1.25px solid #e2e8f0",
                        flexShrink: 0
                      }} />
                    )}
                    <Typography sx={{
                      fontSize: 11, fontWeight: isCurrent ? 700 : 500,
                      color: isCurrent ? "#fff"
                        : isPast ? "#94a3b8"
                        : "var(--color-text-tertiary)"
                    }}>
                      {stage.label}
                    </Typography>
                  </Stack>
                </Box>
              </Tooltip>

              {idx < stages.length - 1 ? (
                <Box sx={{
                  width: 10, display: "flex", alignItems: "center",
                  justifyContent: "center", flexShrink: 0
                }}>
                  <Box sx={{ width: 6, height: 1, bgcolor: "var(--color-border-tertiary)" }} />
                </Box>
              ) : null}
            </React.Fragment>
          )
        })}
      </Stack>
    </Box>
  )
}