import React from "react"
import { Box } from "@mui/material"
import { typeBadgeTokens } from "../tokens/colors"

export type TicketKind = "SR" | "INC" | "CHG"

export function TypeBadge({ kind }: { kind: TicketKind }) {
  const token = typeBadgeTokens[kind]
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 30,
        height: 20,
        px: "7px",
        borderRadius: "4px",
        bgcolor: token.bg,
        color: token.text,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        fontFamily: "inherit",
        lineHeight: 1,
      }}
    >
      {kind}
    </Box>
  )
}
