import React from "react"
import { Box } from "@mui/material"

// Minimal inline-SVG sparkline for a reading series (newest-last). Area fill +
// emphasized endpoint, no axes — the Hyperview "rack power over time" glyph at
// card scale. Points are [value] in chronological order.
export default function Sparkline({ values, color, width = 160, height = 40 }: {
  values: number[]; color: string; width?: number; height?: number
}) {
  if (values.length === 0) return null
  const pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = values.length
  const x = (i: number) => (n === 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2))
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const area = `${line} L${x(n - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`
  const gid = React.useId()
  return (
    <Box component="svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} sx={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(n - 1)} cy={y(values[n - 1])} r={2.5} fill={color} />
    </Box>
  )
}
