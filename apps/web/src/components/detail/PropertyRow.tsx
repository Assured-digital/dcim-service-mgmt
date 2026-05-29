import React from "react"
import { Box, Stack, Typography } from "@mui/material"

interface PropertyRowProps {
  label: string
  value: React.ReactNode
  onClick?: () => void
}

function isEmpty(value: React.ReactNode): boolean {
  return value === null || value === undefined || value === ""
}

function PropertyRowImpl({ label, value, onClick }: PropertyRowProps) {
  const handleClick = React.useCallback(() => {
    if (onClick) onClick()
  }, [onClick])

  const display: React.ReactNode = isEmpty(value) ? "—" : value
  const clickable = !!onClick

  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{ py: 0.75, gap: 1 }}
    >
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", flexShrink: 0, mr: 1 }}
      >
        {label}
      </Typography>
      <Box
        onClick={clickable ? handleClick : undefined}
        sx={{
          fontSize: "0.8125rem",
          color: "text.primary",
          textAlign: "right",
          lineHeight: 1.45,
          minWidth: 0,
          cursor: clickable ? "pointer" : "default",
          borderRadius: 0.5,
          px: clickable ? 0.5 : 0,
          mx: clickable ? -0.5 : 0,
          transition: "background-color 0.12s",
          "&:hover": clickable ? { bgcolor: "action.hover" } : undefined,
        }}
      >
        {display}
      </Box>
    </Stack>
  )
}

export const PropertyRow = React.memo(PropertyRowImpl)
