import React from "react"
import { Box, Stack, Tooltip, Typography } from "@mui/material"
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded"
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded"
import TrendingFlatRoundedIcon from "@mui/icons-material/TrendingFlatRounded"
import { useThemeMode } from "../../lib/theme"
import { ragToken } from "../shared"
import { scoreRagLevel, type ScoreSummary } from "../../lib/checksPanel"

// Shared dashboard presentational primitives — the card system + section header +
// the score/delta readout — used by every dashboard section so they read as one
// language (lifted out of DashboardPage when the checks panel needed to reuse them).

// ── One card system ─────────────────────────────────────────────────────────
// Paper ground, single hairline, one radius, flat. Inner padding uniform.
export const DASH_CARD_SX = {
  bgcolor: "background.paper",
  border: "0.5px solid",
  borderColor: "divider",
  borderRadius: "10px",
  boxShadow: "none",
} as const

export const CARD_CONTENT_SX = { p: "18px", "&:last-child": { pb: "18px" } } as const

// ── Section header ───────────────────────────────────────────────────────────
// Uppercase label + 0.5px hairline beneath — one treatment shared across the page's
// titled sections. Optional right-aligned content drops below the label on narrow
// widths (flex-wrap) rather than colliding.
export function SectionBar({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <Box sx={{
      display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: "8px", columnGap: "16px",
      pb: "8px", borderBottom: "0.5px solid", borderColor: "var(--color-border-primary)",
    }}>
      <Typography sx={{ flex: "1 1 auto", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      {right ? <Box sx={{ flexShrink: 0 }}>{right}</Box> : null}
    </Box>
  )
}

// ── Score + 90-day delta ───────────────────────────────────────────────────────
// A score is inherently RAG, so it carries colour even on the calm-by-exception checks
// panel; the delta is a directional hint (up good / down bad), explained ONLY on hover
// (DASHBOARD_SPEC §6), never inline.

// Short en-GB day for the "Next planned" slot ("2 Jul"). Calendar-style, no year noise.
export function fmtDay(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

function DeltaArrow({ delta }: { delta: number | null }) {
  const { mode } = useThemeMode()
  if (delta == null) {
    return (
      <Tooltip title="No 90-day baseline yet">
        <Box component="span" sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>—</Box>
      </Tooltip>
    )
  }
  if (delta === 0) {
    return (
      <Tooltip title="No change vs 90 days ago">
        <TrendingFlatRoundedIcon sx={{ fontSize: 15, color: "var(--color-text-muted)" }} />
      </Tooltip>
    )
  }
  const up = delta > 0
  const tok = ragToken(up ? "GREEN" : "RED", mode)
  const Icon = up ? TrendingUpRoundedIcon : TrendingDownRoundedIcon
  return (
    <Tooltip title={`${up ? "Up" : "Down"} ${Math.abs(delta)} pts vs 90 days ago`}>
      <Stack component="span" direction="row" alignItems="center" gap="1px">
        <Icon sx={{ fontSize: 15, color: tok.text }} />
        <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: tok.text }}>
          {Math.abs(delta)}
        </Typography>
      </Stack>
    </Tooltip>
  )
}

// `size="lg"` is the summary strip's headline number — kept neutral when good to stay
// calm (colour only escalates amber/red below threshold). "sm" is the denser site-row /
// drill-header read, where the green is shown so a healthy score is legible at a glance.
export function ScoreReadout({ score, size }: { score: ScoreSummary; size: "lg" | "sm" }) {
  const { mode } = useThemeMode()
  const lg = size === "lg"
  if (score.avg == null) {
    return (
      <Typography sx={{ fontSize: lg ? 22 : 13, fontWeight: lg ? 700 : 600, lineHeight: 1, color: "var(--color-text-muted)" }}>
        {lg ? "—" : "No score"}
      </Typography>
    )
  }
  const level = scoreRagLevel(score.avg)
  const color = lg
    ? level === "GREEN" ? "text.primary" : ragToken(level, mode).text
    : ragToken(level, mode).text
  return (
    <Stack direction="row" alignItems="baseline" gap="6px">
      <Typography sx={{ fontSize: lg ? 22 : 13, fontWeight: 700, lineHeight: 1, color }}>{score.avg}%</Typography>
      <DeltaArrow delta={score.delta} />
    </Stack>
  )
}
