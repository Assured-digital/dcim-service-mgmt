import React from "react"
import { Box, Typography } from "@mui/material"
import { Avatar } from "../primitives/Avatar"
import type { ThemeMode } from "../tokens/colors"
import { userLabel } from "../../../lib/userDisplay"

// Engine-agnostic assignee cell — the shared initials Avatar + display name, with
// a configurable empty fallback. Drops into a <TableCell> or a DataGrid renderCell.
// The name routes through the app-wide knownAs helper (userLabel) so it renders the
// same person-name convention as the rest of the app.
//
// Opt-in `mode` (default "light"): the light branch reproduces the prior literals
// EXACTLY (name #475569, unassigned-dash #cbd5e1) so any caller that doesn't pass
// `mode` is byte-identical. In dark, the name routes to the theme's text.secondary
// and the dash to text.tertiary so both read on the dark surface. (NB: the dash's
// light literal #cbd5e1 is slate-300 — LIGHTER than text.tertiary #94a3b8 — so it is
// kept as a literal in light rather than routed to the token, which would have
// darkened the light dash and broken light parity; the token is used only in dark.)
export function AssigneeCell({
  user,
  emptyLabel = "Unassigned",
  mode = "light",
}: {
  user?: { displayName?: string | null; email?: string | null } | null
  emptyLabel?: React.ReactNode
  mode?: ThemeMode
}) {
  const isDark = mode === "dark"
  if (!user) {
    return (
      <Typography component="span" sx={{ fontSize: 12, color: isDark ? "text.tertiary" : "#cbd5e1" }}>
        {emptyLabel}
      </Typography>
    )
  }
  const label = userLabel(user)
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <Avatar name={label} size="sm" variant="neutral" mode={mode} />
      <Typography component="span" sx={{ fontSize: 12, color: isDark ? "text.secondary" : "#475569" }}>
        {label}
      </Typography>
    </Box>
  )
}
