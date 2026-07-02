import React from "react"
import { Box, Tooltip, Typography } from "@mui/material"
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder"
import { useThemeMode } from "../../lib/theme"
import { semanticToken } from "../shared/tokens/colors"
import { CabinetReservation } from "../../lib/infrastructure"
import { RACK_U_HEIGHT } from "./constants"

// Hatched advisory-reservation block (DCIM spec §2.1 — NetBox's striped render).
// Hatching = repeating-linear-gradient over the warning tokens, mode-aware.
export const ReservationBlock = React.memo(function ReservationBlock({
  reservation, h
}: {
  reservation: CabinetReservation; h: number
}) {
  const { mode } = useThemeMode()
  const warn = semanticToken("warning", mode)
  const height = RACK_U_HEIGHT * h + Math.max(0, h - 1)
  const stripeAlt = mode === "dark" ? "rgba(251,191,36,0.14)" : "rgba(180,83,9,0.12)"
  const expiry = reservation.expiresAt
    ? `expires ${new Date(reservation.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "open-ended"
  const sideNote = reservation.rackSide ? ` · ${reservation.rackSide.toLowerCase()} face` : ""

  return (
    <Tooltip title={`Reserved — ${reservation.name} (${expiry}${sideNote})${reservation.notes ? ` — ${reservation.notes}` : ""}`} placement="right" arrow>
      <Box
        sx={{
          height, display: "flex", alignItems: "center", gap: "5px", px: "7px", mb: "1px",
          background: `repeating-linear-gradient(45deg, ${warn.bg}, ${warn.bg} 6px, ${stripeAlt} 6px, ${stripeAlt} 12px)`,
          border: "1px dashed", borderColor: warn.text,
          borderRadius: "2px", overflow: "hidden"
        }}
      >
        <BookmarkBorderIcon sx={{ fontSize: 12, color: warn.text, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: warn.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Reserved — {reservation.name}
          <Box component="span" sx={{ fontWeight: 400, ml: "5px" }}>{expiry}</Box>
        </Typography>
      </Box>
    </Tooltip>
  )
})
