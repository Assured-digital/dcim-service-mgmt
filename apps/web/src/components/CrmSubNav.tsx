import React from "react"
import { Box, Typography } from "@mui/material"
import HandshakeIcon from "@mui/icons-material/Handshake"
import SpaceDashboardOutlinedIcon from "@mui/icons-material/SpaceDashboardOutlined"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import ContactsIcon from "@mui/icons-material/Contacts"
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined"
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined"
import FolderSharedOutlinedIcon from "@mui/icons-material/FolderSharedOutlined"
import InsightsOutlinedIcon from "@mui/icons-material/InsightsOutlined"
import { ORG_SUPER_ROLES, ROLES, hasAnyRole } from "../lib/rbac"

// CRM sub-nav — the "app within the app" panel, mirroring DcimSubNav (DCIM
// brief §1). Renders beside the collapsed main icon rail while on a /crm route;
// the rail keeps every other module one click away, this panel owns within-CRM
// movement. Navy in BOTH themes (chrome, like the sidebar). Unlike DCIM, CRM
// items have mixed role gating (Reports is commercial-only), so destinations
// carry `roles` and the panel + the mobile drawer filter by the current user.

export const CRM_SUBNAV_WIDTH = 214
const ICON = 18

const AD_STAFF = [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]
const COMMERCIAL = [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER]

export type CrmDestination = {
  label: string
  path: string
  icon: React.ReactNode
  roles: string[]
  // Account is /crm and prefixes every child route, so it must match exactly.
  exact?: boolean
}

// Canonical CRM destinations — the SINGLE source of truth shared by the desktop
// sub-nav (here) and the mobile drawer's inline CRM section (Shell).
export const CRM_DESTINATIONS: CrmDestination[] = [
  { label: "Account", path: "/crm", icon: <SpaceDashboardOutlinedIcon sx={{ fontSize: ICON }} />, roles: AD_STAFF, exact: true },
  { label: "Pipeline", path: "/crm/pipeline", icon: <TrendingUpIcon sx={{ fontSize: ICON }} />, roles: AD_STAFF },
  { label: "Contacts", path: "/crm/contacts", icon: <ContactsIcon sx={{ fontSize: ICON }} />, roles: AD_STAFF },
  { label: "Activity", path: "/crm/activity", icon: <ForumOutlinedIcon sx={{ fontSize: ICON }} />, roles: AD_STAFF },
  { label: "Quotes", path: "/crm/quotes", icon: <RequestQuoteOutlinedIcon sx={{ fontSize: ICON }} />, roles: AD_STAFF },
  { label: "Documents", path: "/crm/documents", icon: <FolderSharedOutlinedIcon sx={{ fontSize: ICON }} />, roles: AD_STAFF },
  { label: "Reports", path: "/crm/reports", icon: <InsightsOutlinedIcon sx={{ fontSize: ICON }} />, roles: COMMERCIAL },
]

function isItemActive(item: CrmDestination, pathname: string): boolean {
  if (item.exact) return pathname === item.path
  return pathname === item.path || pathname.startsWith(item.path + "/")
}

export default function CrmSubNav({ pathname, onNavigate }: {
  pathname: string
  onNavigate: (path: string) => void
}) {
  const items = CRM_DESTINATIONS.filter(d => hasAnyRole(d.roles))
  return (
    <Box sx={{
      width: CRM_SUBNAV_WIDTH, flexShrink: 0, height: "100%",
      bgcolor: "#0f1b30",
      borderRight: "1px solid rgba(255,255,255,0.06)",
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      {/* Module header */}
      <Box sx={{ px: "16px", pt: "16px", pb: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
        <Box sx={{ width: 30, height: 30, borderRadius: "8px", bgcolor: "rgba(59,130,246,0.16)", color: "#7db4f5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <HandshakeIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.1 }}>CRM</Typography>
          <Typography sx={{ fontSize: 10.5, color: "#64748b", lineHeight: 1.2 }}>Client relationships</Typography>
        </Box>
      </Box>

      <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mx: "12px", mb: "6px" }} />

      {/* Destinations */}
      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", px: "8px" }}>
        {items.map(item => {
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
      </Box>
    </Box>
  )
}
