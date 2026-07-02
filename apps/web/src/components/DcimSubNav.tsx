import React from "react"
import { Box, Tooltip, Typography } from "@mui/material"
import DnsIcon from "@mui/icons-material/Dns"
import DashboardIcon from "@mui/icons-material/Dashboard"
import AccountTreeIcon from "@mui/icons-material/AccountTree"
import ViewListIcon from "@mui/icons-material/ViewList"
import HubIcon from "@mui/icons-material/Hub"
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing"
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep"
import MapOutlinedIcon from "@mui/icons-material/MapOutlined"
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined"
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined"
import SummarizeOutlinedIcon from "@mui/icons-material/SummarizeOutlined"
import { shellTokens } from "./shared"

// DCIM sub-nav — the "app within the app" panel (DCIM_DESIGN_BRIEF §1). Renders
// beside the collapsed main icon rail while on a DCIM route; the rail keeps every
// module one click away (cross-module ITSM jumps), this panel owns within-DCIM
// movement. Navy in BOTH themes — it is chrome, like the sidebar/top bar, so no
// mode-awareness is needed. Deferred items (Floor plan / Catalogue / Monitoring)
// are shown visibly-but-muted under a "Later" heading per the brief — the seam
// for the hero floor plan (its own build) and workstream B's catalogue.

export const DCIM_SUBNAV_WIDTH = 214

export type DcimDestination = { label: string; path: string; icon: React.ReactNode; match?: string[] }
type SubNavItem = DcimDestination

const ICON = 18

// The canonical DCIM destinations — the SINGLE source of truth shared by the
// desktop sub-nav (here) and the mobile drawer's inline DCIM section (Shell), so
// the two never drift.
export const DCIM_DESTINATIONS: DcimDestination[] = [
  { label: "Overview", path: "/dcim/overview", icon: <DashboardIcon sx={{ fontSize: ICON }} /> },
  { label: "Floor plan", path: "/dcim/floor-plan", icon: <MapOutlinedIcon sx={{ fontSize: ICON }} /> },
  { label: "Sites & cabinets", path: "/asset-hierarchy", icon: <AccountTreeIcon sx={{ fontSize: ICON }} /> },
  { label: "Asset register", path: "/asset-register", icon: <ViewListIcon sx={{ fontSize: ICON }} /> },
  { label: "Catalogue", path: "/dcim/catalogue", icon: <Inventory2OutlinedIcon sx={{ fontSize: ICON }} /> },
  { label: "Connections", path: "/connections", icon: <HubIcon sx={{ fontSize: ICON }} /> },
  { label: "Maintenance", path: "/maintenance", icon: <PrecisionManufacturingIcon sx={{ fontSize: ICON }} /> },
  { label: "Report", path: "/dcim/report", icon: <SummarizeOutlinedIcon sx={{ fontSize: ICON }} /> },
  { label: "Pending deletions", path: "/pending-deletions", icon: <DeleteSweepIcon sx={{ fontSize: ICON }} /> },
]
const PRIMARY = DCIM_DESTINATIONS

// Visibly-deferred — the future surface (brief §1 / §6b). Non-clickable until built.
const DEFERRED: { label: string; icon: React.ReactNode; note: string }[] = [
  { label: "Monitoring", icon: <MonitorHeartOutlinedIcon sx={{ fontSize: ICON }} />, note: "Live power & environmental" },
]

function isItemActive(item: SubNavItem, pathname: string): boolean {
  const paths = item.match ?? [item.path]
  return paths.some(p => pathname === p || pathname.startsWith(p + "/"))
}

export default function DcimSubNav({ pathname, onNavigate }: {
  pathname: string
  onNavigate: (path: string) => void
}) {
  return (
    <Box sx={{
      width: DCIM_SUBNAV_WIDTH, flexShrink: 0, height: "100%",
      // A touch lighter than the icon rail (shellTokens.bg) so it reads as the
      // panel opened beside it; a hairline seam reinforces the depth.
      bgcolor: "#0f1b30",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      {/* Module header */}
      <Box sx={{ px: "16px", pt: "16px", pb: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Box sx={{ width: 30, height: 30, borderRadius: "8px", bgcolor: "rgba(59,130,246,0.16)", color: "#7db4f5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <DnsIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.1 }}>DCIM</Typography>
          <Typography sx={{ fontSize: 10.5, color: "#64748b", lineHeight: 1.2 }}>Data centre estate</Typography>
        </Box>
      </Box>

      <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mx: "12px", mb: "6px" }} />

      {/* Primary destinations */}
      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", px: "8px" }}>
        {PRIMARY.map(item => {
          const active = isItemActive(item, pathname)
          return (
            <Box key={item.path} onClick={() => onNavigate(item.path)} sx={{
              display: "flex", alignItems: "center", gap: "11px",
              px: "10px", py: "8px", mb: "1px", borderRadius: "7px", cursor: "pointer",
              bgcolor: active ? "rgba(59,130,246,0.15)" : "transparent",
              color: active ? "#e2e8f0" : "#a3b4c9",
              transition: "background-color 0.12s, color 0.12s",
              "&:hover": { bgcolor: active ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)", color: active ? "#e2e8f0" : "#cbd5e1" }
            }}>
              <Box sx={{ display: "flex", flexShrink: 0, color: active ? "#7db4f5" : "#64748b", transition: "color 0.12s" }}>{item.icon}</Box>
              <Typography sx={{ fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: "nowrap" }}>{item.label}</Typography>
            </Box>
          )
        })}

        {/* Later — visibly deferred */}
        <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#475569", px: "10px", pt: "16px", pb: "6px" }}>
          Later
        </Typography>
        {DEFERRED.map(d => (
          <Tooltip key={d.label} title={`${d.note} — coming soon`} placement="right" arrow>
            <Box sx={{
              display: "flex", alignItems: "center", gap: "11px",
              px: "10px", py: "8px", mb: "1px", borderRadius: "7px",
              cursor: "default", color: "#475569", opacity: 0.85
            }}>
              <Box sx={{ display: "flex", flexShrink: 0, color: "#3a4a63" }}>{d.icon}</Box>
              <Typography sx={{ fontSize: 13, fontWeight: 400, whiteSpace: "nowrap", flex: 1 }}>{d.label}</Typography>
              <Box sx={{ px: "6px", py: "1px", borderRadius: "4px", bgcolor: "rgba(255,255,255,0.04)", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", color: "#64748b" }}>SOON</Box>
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  )
}
