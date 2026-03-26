import React from "react"
import { Button, Divider, Stack, Typography } from "@mui/material"
import EditIcon from "@mui/icons-material/Edit"
import { PanelCard } from "../primitives/PanelCard"
import { SectionHeader } from "../primitives/SectionHeader"

export interface PropertyRow {
  label: string
  value: React.ReactNode
}

interface PropertiesPanelProps {
  rows: PropertyRow[]
  onEdit?: () => void
  title?: string
  editDisabled?: boolean
}

export function PropertiesPanel({
  rows, onEdit, title = "PROPERTIES", editDisabled = false
}: PropertiesPanelProps) {
  return (
    <PanelCard>
      <SectionHeader
        label={title}
        action={onEdit && !editDisabled ? (
          <Button size="small" startIcon={<EditIcon sx={{ fontSize: 13 }} />}
            onClick={onEdit}>
            Edit
          </Button>
        ) : undefined}
      />
      <Stack spacing={0} divider={<Divider />} sx={{ mt: 1.5 }}>
        {rows.filter(Boolean).map((row) => (
          <Stack key={row.label} direction="row" justifyContent="space-between"
            alignItems="center" sx={{ py: 0.75 }}>
            <Typography variant="caption" color="text.secondary"
              sx={{ flexShrink: 0, mr: 1 }}>
              {row.label}
            </Typography>
            {row.value}
          </Stack>
        ))}
      </Stack>
    </PanelCard>
  )
}