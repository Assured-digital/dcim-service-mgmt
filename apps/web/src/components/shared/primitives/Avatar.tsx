import React from "react"
import { Box } from "@mui/material"

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
}: {
  name: string
  size?: AvatarSize
  variant?: AvatarVariant
}) {
  const { box, font } = sizeMap[size]
  const palette = variantColours[variant]
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
