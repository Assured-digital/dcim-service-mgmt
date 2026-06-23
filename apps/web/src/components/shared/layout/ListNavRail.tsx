import React from "react"
import { Box, Typography } from "@mui/material"
import type { ThemeMode } from "../tokens/colors"

// Shared list-page left rail: a titled column of single-select sections, each a
// list of icon + label (+ optional count badge) rows. Shared by the Service Desk
// queue (Tickets + Type sections) and Risks & Issues (Views + Type sections).
//
// Each section owns its own selection (activeId / onPick) so independent filters
// — e.g. saved-view vs type — coexist in one rail. The count badge renders only
// when an item supplies a numeric `count`, so count-less sections (Type) show no
// badge. `children` render below the sections — the slot for page-specific extra
// filters (e.g. R&I's multi-select Status/Severity/Review checkboxes).
export type RailItem = { id: string; label: string; count?: number; icon: React.ReactNode }
export type RailSection = {
  label: string
  items: RailItem[]
  activeId: string
  onPick: (id: string) => void
}

// Opt-in mode palette: the light branch reproduces the prior literal values
// exactly, so callers that don't pass a mode (e.g. Risks & Issues) are unchanged.
type RailPalette = ReturnType<typeof railPalette>
function railPalette(mode: ThemeMode) {
  const dark = mode === "dark"
  return {
    containerBg: dark ? "#1e293b" : "#fff",
    containerBorder: dark ? "#334155" : "#e2e8f0",
    headerBorder: dark ? "#1e293b" : "#f1f5f9",
    title: dark ? "#e2e8f0" : "#0f172a",
    sectionLabel: dark ? "#94a3b8" : "#64748b",
    rowActiveBg: dark ? "rgba(59,130,246,0.15)" : "#e8f1ff",
    rowActiveFg: dark ? "#3b82f6" : "#1d4ed8",
    rowInactiveFg: dark ? "#94a3b8" : "#475569",
    rowHoverBg: dark ? "#172033" : "#f8fafc",
    rowHoverFg: dark ? "#e2e8f0" : "#0f172a",
    iconInactive: dark ? "#64748b" : "#94a3b8",
    countActivePillBg: dark ? "#0b1220" : "#fff",
  }
}

const sectionLabelBaseSx = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase",
  px: 1.25, pt: 1.5, pb: 0.5,
}

function RailRow({ item, isActive, onPick, pal }: { item: RailItem; isActive: boolean; onPick: (id: string) => void; pal: RailPalette }) {
  return (
    <Box
      onClick={() => onPick(item.id)}
      sx={{
        display: "flex", alignItems: "center", gap: 1.25,
        px: 1.25, py: 0.875, borderRadius: 1, cursor: "pointer",
        bgcolor: isActive ? pal.rowActiveBg : "transparent",
        color: isActive ? pal.rowActiveFg : pal.rowInactiveFg,
        fontWeight: isActive ? 600 : 400,
        "&:hover": { bgcolor: isActive ? pal.rowActiveBg : pal.rowHoverBg, color: isActive ? pal.rowActiveFg : pal.rowHoverFg },
        "& .MuiSvgIcon-root": { color: isActive ? pal.rowActiveFg : pal.iconInactive }
      }}
    >
      {item.icon}
      <Typography sx={{ fontSize: 13, flex: 1 }}>{item.label}</Typography>
      {typeof item.count === "number" ? (
        <Typography sx={{
          fontSize: 11, fontWeight: isActive ? 700 : 500,
          color: isActive ? pal.rowActiveFg : pal.iconInactive,
          bgcolor: isActive ? pal.countActivePillBg : "transparent",
          borderRadius: 999, px: isActive ? 0.875 : 0,
        }}>
          {item.count}
        </Typography>
      ) : null}
    </Box>
  )
}

export function ListNavRail({
  title, sections, children, mode = "light",
}: {
  title: string
  sections: RailSection[]
  children?: React.ReactNode
  mode?: ThemeMode
}) {
  const pal = railPalette(mode)
  return (
    <Box sx={{
      width: 220, flexShrink: 0,
      borderRight: "1px solid", borderColor: pal.containerBorder, bgcolor: pal.containerBg,
      p: 1, display: "flex", flexDirection: "column", gap: 0.25,
      overflowY: "auto",
    }}>
      <Box sx={{
        px: 1.25, pt: 0.5, pb: 1.25,
        borderBottom: "1px solid", borderColor: pal.headerBorder,
        mb: 0.5,
      }}>
        <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 16, fontWeight: 700, color: pal.title }}>
          {title}
        </Typography>
      </Box>
      {sections.map(section => (
        <React.Fragment key={section.label}>
          <Typography sx={{ ...sectionLabelBaseSx, color: pal.sectionLabel }}>{section.label}</Typography>
          {section.items.map(item => (
            <RailRow key={item.id} item={item} isActive={item.id === section.activeId} onPick={section.onPick} pal={pal} />
          ))}
        </React.Fragment>
      ))}
      {children}
    </Box>
  )
}
