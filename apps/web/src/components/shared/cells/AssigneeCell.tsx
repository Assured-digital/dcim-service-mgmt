import React from "react"
import { Box, Typography } from "@mui/material"
import { Avatar } from "../primitives/Avatar"

// Engine-agnostic assignee cell — the shared initials Avatar + display name, with
// a configurable empty fallback. Drops into a <TableCell> or a DataGrid renderCell.
export function AssigneeCell({
  user,
  emptyLabel = "Unassigned",
}: {
  user?: { displayName: string; email?: string | null } | null
  emptyLabel?: React.ReactNode
}) {
  if (!user) {
    return (
      <Typography component="span" sx={{ fontSize: 12, color: "#cbd5e1" }}>
        {emptyLabel}
      </Typography>
    )
  }
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <Avatar name={user.displayName} size="sm" variant="neutral" />
      <Typography component="span" sx={{ fontSize: 12, color: "#475569" }}>
        {user.displayName}
      </Typography>
    </Box>
  )
}
