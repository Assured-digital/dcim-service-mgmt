import React from "react"
import { Box } from "@mui/material"
import {
  PILL_RADIUS,
  resolveIntent,
  semanticToken,
  priorityToken,
  type SemanticIntent,
} from "../tokens/colors"

// ── The one shared pill ─────────────────────────────────────────────────────
// A pastel, intent-coloured pill: tinted fill + same-hue text + label, with an
// optional trailing affordance (e.g. an edit chevron). Presentational and
// engine-agnostic — drops straight into a <TableCell> (Tasks) or a DataGrid
// renderCell (Service Desk). The caller (the Status/Priority wrappers below)
// resolves the colour and passes bg/text in, so there is ONE pill implementation,
// not two parallel ones. Radius is the shared PILL_RADIUS (the app's ~6px
// baseline), so status and priority pills always match each other and the
// surrounding UI — not the old fully-rounded lozenge.
// `size`: "md" (default) is the baseline h24/px10/fs11; "sm" is a denser h20/px8/fs10
// for tight rows (per-item checks, properties panels, list cells).
// `minWidth`: a floor (+ centred content) for IN-PLACE pills (e.g. a detail-header
// status) so the pill keeps one width and does NOT reflow as the status word changes.
export function IntentPill({
  bg,
  text,
  label,
  trailing,
  size = "md",
  minWidth,
}: {
  bg: string
  text: string
  label: React.ReactNode
  trailing?: React.ReactNode
  size?: "sm" | "md"
  minWidth?: number
}) {
  const dims = size === "sm" ? { height: 20, px: "8px", fontSize: 10 } : { height: 24, px: "10px", fontSize: 11 }
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: minWidth ? "center" : undefined,
        gap: "2px",
        height: dims.height,
        px: dims.px,
        minWidth,
        borderRadius: `${PILL_RADIUS}px`,
        bgcolor: bg,
        color: text,
        fontSize: dims.fontSize,
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

// Status pill — intent reads the single source of truth (resolveIntent ->
// semanticTokens), so a status is the same colour here as on the detail pill,
// the Service Desk queue and Risks/Issues. Label is caller-supplied (humanised,
// per-domain); pass `trailing` for an inline edit affordance (e.g. a caret).
export function StatusPill({
  value,
  intent,
  label,
  trailing,
  size,
  minWidth,
}: {
  value?: string
  intent?: SemanticIntent
  label: React.ReactNode
  trailing?: React.ReactNode
  size?: "sm" | "md"
  minWidth?: number
}) {
  // Mode-aware: semanticToken() reads the active theme mode, so a status pill is
  // the correct colour in both light and dark without each call site passing mode.
  const tok = semanticToken(intent ?? resolveIntent(value ?? ""))
  return (
    <IntentPill bg={tok.bg} text={tok.text} label={label} trailing={trailing} size={size} minWidth={minWidth} />
  )
}

// Priority pill — the SAME pill, fed the 4-step priority ramp (priorityToken),
// so a priority is the same colour here as on the detail-page priority chips.
// Replaces the old dot+text PriorityCell. `trailing` carries the edit caret.
export function PriorityPill({
  priority,
  label,
  trailing,
  size,
  minWidth,
}: {
  priority: string
  label: React.ReactNode
  trailing?: React.ReactNode
  size?: "sm" | "md"
  minWidth?: number
}) {
  const tok = priorityToken(priority)
  return (
    <IntentPill bg={tok.bg} text={tok.text} label={label} trailing={trailing} size={size} minWidth={minWidth} />
  )
}
