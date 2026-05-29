import React from "react"
import { Box, IconButton, Stack, Typography } from "@mui/material"
import EditIcon from "@mui/icons-material/Edit"

interface PropertiesPanelShellProps {
  title?: string
  onEdit?: () => void
  children?: React.ReactNode
}

function PropertiesPanelShellImpl({
  title = "PROPERTIES",
  onEdit,
  children,
}: PropertiesPanelShellProps) {
  const handleEdit = React.useCallback(() => {
    if (onEdit) onEdit()
  }, [onEdit])

  return (
    <Box
      sx={{
        width: 280,
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 2,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1.25 }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            color: "text.secondary",
          }}
        >
          {title}
        </Typography>
        {onEdit ? (
          <IconButton
            size="small"
            onClick={handleEdit}
            aria-label="Edit properties"
            sx={{ p: 0.5 }}
          >
            <EditIcon sx={{ fontSize: 14 }} />
          </IconButton>
        ) : null}
      </Stack>
      <Box>{children}</Box>
    </Box>
  )
}

export const PropertiesPanelShell = React.memo(PropertiesPanelShellImpl)
