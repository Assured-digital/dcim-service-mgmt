import React from "react"
import { Box } from "@mui/material"
import { useThemeMode } from "../../lib/theme"
import { barColor } from "../../lib/infrastructure"

// Small SVG donut showing a utilisation percentage, coloured on the shared RAG
// ramp (barColor). Used on cabinet cards and capacity KPIs — the at-a-glance
// "how full" glyph from the DCIM redesign mock.
export default function CapacityRing({ pct, size = 42, stroke = 4 }: {
  pct: number; size?: number; stroke?: number
}) {
  const { mode } = useThemeMode()
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const r = (size - stroke) / 2 - 1
  const c = 2 * Math.PI * r
  const colour = barColor(clamped, mode)
  const track = mode === "dark" ? "rgba(148,163,184,.16)" : "rgba(100,116,139,.14)"
  return (
    <Box component="svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} sx={{ flexShrink: 0, display: "block" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={colour} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - clamped / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fontSize={size * 0.26} fontWeight={700} fontFamily="inherit"
        fill={mode === "dark" ? "#e7edf9" : "#0f172a"}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >{clamped}%</text>
    </Box>
  )
}
