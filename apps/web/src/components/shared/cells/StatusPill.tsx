import React from "react"
import { Box } from "@mui/material"
import { resolveIntent, semanticTokens, type SemanticIntent } from "../tokens/colors"

// Engine-agnostic status pill — drops into a <TableCell> (Tasks) or a DataGrid
// renderCell. Colour reads the single source of truth (resolveIntent ->
// semanticTokens), so a status is the same colour here as on the detail pill,
// the Service Desk queue and Risks/Issues. Label is caller-supplied (humanised,
// per-domain); pass `trailing` for an inline edit affordance (e.g. a caret).
export function StatusPill({
  value,
  intent,
  label,
  trailing,
}: {
  value?: string
  intent?: SemanticIntent
  label: React.ReactNode
  trailing?: React.ReactNode
}) {
  const tok = semanticTokens[intent ?? resolveIntent(value ?? "")]
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        height: 24,
        px: "10px",
        borderRadius: "12px",
        bgcolor: tok.bg,
        color: tok.text,
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      {trailing}
    </Box>
  )
}
