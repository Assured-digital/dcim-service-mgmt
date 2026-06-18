import React from "react"
import { Box, Typography } from "@mui/material"
import { Avatar } from "../primitives/Avatar"
import { userLabel } from "../../../lib/userDisplay"

// Engine-agnostic assignee cell — the shared initials Avatar + display name, with
// a configurable empty fallback. Drops into a <TableCell> or a DataGrid renderCell.
// The name routes through the app-wide knownAs helper (userLabel) so it renders the
// same person-name convention as the rest of the app.
export function AssigneeCell({
  user,
  emptyLabel = "Unassigned",
}: {
  user?: { displayName?: string | null; email?: string | null } | null
  emptyLabel?: React.ReactNode
}) {
  if (!user) {
    return (
      <Typography component="span" sx={{ fontSize: 12, color: "#cbd5e1" }}>
        {emptyLabel}
      </Typography>
    )
  }
  const label = userLabel(user)
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <Avatar name={label} size="sm" variant="neutral" />
      <Typography component="span" sx={{ fontSize: 12, color: "#475569" }}>
        {label}
      </Typography>
    </Box>
  )
}
