import React from "react"
import { Box } from "@mui/material"
import type { ThemeMode } from "../tokens/colors"

export type AvatarVariant = "engineer" | "client" | "neutral"
export type AvatarSize = "sm" | "md" | "lg"

const sizeMap: Record<AvatarSize, { box: number; font: number }> = {
  sm: { box: 20, font: 9 },
  md: { box: 24, font: 10 },
  lg: { box: 32, font: 12 },
}

const variantColours: Record<AvatarVariant, { bg: string; color: string }> = {
  engineer: { bg: "#dcfce7", color: "#15803d" },
  client:   { bg: "#fef3c7", color: "#b45309" },
  neutral:  { bg: "#e8f1ff", color: "#1d4ed8" },
}

// Dark counterparts for all three variants — a deep, low-luminance fill + bright,
// same-hue initials, matching the app's other dark tint groups (semantic/priority/
// accent *Dark) and legible at 20–24px. Neutral is a flat slate circle (done in
// Batch C); engineer/client are the green/amber identity washes re-scaled for dark.
// Opt-in: callers that don't pass `mode` (default "light") render the exact prior
// light washes, byte-identical.
const variantColoursDark: Record<AvatarVariant, { bg: string; color: string }> = {
  engineer: { bg: "#13351f", color: "#4ade80" }, // green
  client:   { bg: "#3a2c0f", color: "#fbbf24" }, // amber
  neutral:  { bg: "#334155", color: "#cbd5e1" }, // slate
}

function initialsFrom(input: string): string {
  const cleaned = input.trim()
  if (!cleaned) return "?"
  if (!cleaned.includes("@") && !cleaned.includes(" ")) return cleaned.slice(0, 2).toUpperCase()
  const emailLocal = cleaned.includes("@") ? cleaned.split("@")[0] : cleaned
  const parts = emailLocal.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function Avatar({
  name,
  size = "md",
  variant = "neutral",
  mode = "light",
}: {
  name: string
  size?: AvatarSize
  variant?: AvatarVariant
  mode?: ThemeMode
}) {
  const { box, font } = sizeMap[size]
  const palette = mode === "dark" ? variantColoursDark[variant] : variantColours[variant]
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: box,
        height: box,
        borderRadius: "50%",
        bgcolor: palette.bg,
        color: palette.color,
        fontSize: font,
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {initialsFrom(name)}
    </Box>
  )
}
