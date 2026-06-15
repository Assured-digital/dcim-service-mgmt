import React from "react"
import { Box, Typography } from "@mui/material"

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

const sectionLabelSx = {
  fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase", color: "#64748b",
  px: 1.25, pt: 1.5, pb: 0.5,
}

function RailRow({ item, isActive, onPick }: { item: RailItem; isActive: boolean; onPick: (id: string) => void }) {
  return (
    <Box
      onClick={() => onPick(item.id)}
      sx={{
        display: "flex", alignItems: "center", gap: 1.25,
        px: 1.25, py: 0.875, borderRadius: 1, cursor: "pointer",
        bgcolor: isActive ? "#e8f1ff" : "transparent",
        color: isActive ? "primary.main" : "#475569",
        fontWeight: isActive ? 600 : 400,
        "&:hover": { bgcolor: isActive ? "#e8f1ff" : "#f8fafc", color: isActive ? "primary.main" : "#0f172a" },
        "& .MuiSvgIcon-root": { color: isActive ? "primary.main" : "#94a3b8" }
      }}
    >
      {item.icon}
      <Typography sx={{ fontSize: 13, flex: 1 }}>{item.label}</Typography>
      {typeof item.count === "number" ? (
        <Typography sx={{
          fontSize: 11, fontWeight: isActive ? 700 : 500,
          color: isActive ? "primary.main" : "#94a3b8",
          bgcolor: isActive ? "#fff" : "transparent",
          borderRadius: 999, px: isActive ? 0.875 : 0,
        }}>
          {item.count}
        </Typography>
      ) : null}
    </Box>
  )
}

export function ListNavRail({
  title, sections, children,
}: {
  title: string
  sections: RailSection[]
  children?: React.ReactNode
}) {
  return (
    <Box sx={{
      width: 220, flexShrink: 0,
      borderRight: "1px solid #e2e8f0", bgcolor: "#fff",
      p: 1, display: "flex", flexDirection: "column", gap: 0.25,
      overflowY: "auto",
    }}>
      <Box sx={{
        px: 1.25, pt: 0.5, pb: 1.25,
        borderBottom: "1px solid #f1f5f9",
        mb: 0.5,
      }}>
        <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
          {title}
        </Typography>
      </Box>
      {sections.map(section => (
        <React.Fragment key={section.label}>
          <Typography sx={sectionLabelSx}>{section.label}</Typography>
          {section.items.map(item => (
            <RailRow key={item.id} item={item} isActive={item.id === section.activeId} onPick={section.onPick} />
          ))}
        </React.Fragment>
      ))}
      {children}
    </Box>
  )
}
