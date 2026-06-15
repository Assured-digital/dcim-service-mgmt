import React from "react"
import { Box } from "@mui/material"
import { typeBadgeTokens } from "../tokens/colors"

export type TicketKind = "SR" | "INC" | "CHG"
// The badge also serves Risks/Issues (not tickets) and Tasks (no list indicator,
// but used full-label in the detail panel) — widen the prop (not TicketKind itself,
// which feeds exhaustive ticket maps elsewhere).
export type BadgeKind = TicketKind | "RSK" | "ISS" | "TASK"

// `label` renders the full type word ("Service Request") in the type's colour for the
// detail-panel "Type" row; omit it for the compact abbreviation badge used in lists.
export function TypeBadge({ kind, label }: { kind: BadgeKind; label?: string }) {
  const token = typeBadgeTokens[kind]
  const full = label != null
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: full ? "auto" : 30,
        height: 20,
        px: full ? "8px" : "7px",
        borderRadius: "4px",
        bgcolor: token.bg,
        color: token.text,
        fontSize: full ? 11 : 10,
        fontWeight: full ? 600 : 700,
        letterSpacing: full ? "0.01em" : "0.05em",
        fontFamily: "inherit",
        lineHeight: 1,
      }}
    >
      {label ?? kind}
    </Box>
  )
}
