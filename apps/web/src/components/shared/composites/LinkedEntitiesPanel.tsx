import React from "react"
import { Box, Button, Chip, Stack, Typography } from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import { PanelCard } from "../primitives/PanelCard"
import { SectionHeader } from "../primitives/SectionHeader"
import { EmptySlot } from "../primitives/EmptySlot"
import { chipSx, priorityDot } from "../tokens/colors"

export interface LinkedTask {
  id: string
  reference: string
  title: string
  status: string
  priority: string
}

interface LinkedEntitiesPanelProps {
  items: LinkedTask[]
  onNavigate: (item: LinkedTask) => void
  onCreate?: () => void
  title?: string
  emptyMessage?: string
}

export function LinkedEntitiesPanel({
  items, onNavigate, onCreate,
  title = "LINKED TASKS",
  emptyMessage = "No tasks linked yet"
}: LinkedEntitiesPanelProps) {
  return (
    <PanelCard>
      <SectionHeader
        label={title}
        action={onCreate ? (
          <Button size="small" startIcon={<AddIcon />} onClick={onCreate}>
            Create
          </Button>
        ) : undefined}
      />
      <Box sx={{ mt: 1.25 }}>
        {items.length === 0 ? (
          <EmptySlot message={emptyMessage} />
        ) : (
          <Stack spacing={0.75}>
            {items.map((task) => (
              <Box key={task.id}
                onClick={() => onNavigate(task)}
                sx={{
                  p: 1, borderRadius: 1.5, cursor: "pointer",
                  border: "0.5px solid var(--color-border-tertiary)",
                  bgcolor: "var(--color-background-secondary)",
                  "&:hover": { bgcolor: "var(--color-background-primary)" },
                  transition: "background 0.1s"
                }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                  <Box sx={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    bgcolor: priorityDot(task.priority)
                  }} />
                  <Typography variant="caption" fontWeight={600} sx={{
                    flex: 1, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap"
                  }}>
                    {task.title}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ ml: 1.75 }}>
                  <Typography variant="caption" sx={{
                    fontFamily: "monospace", fontSize: 10, color: "text.secondary"
                  }}>
                    {task.reference}
                  </Typography>
                  <Chip size="small"
                    label={task.status.toLowerCase().replace("_", " ")}
                    sx={{ ...chipSx(task.status), height: 16, fontSize: 10 }} />
                </Stack>
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </PanelCard>
  )
}