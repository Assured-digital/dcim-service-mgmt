import React, { Suspense, useEffect, useRef, useState } from "react"
import type { NavigateFunction } from "react-router-dom"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, MenuItem, Select, Switch, Tooltip, Typography, useMediaQuery, useTheme
} from "@mui/material"
import MenuIcon from "@mui/icons-material/Menu"
import DashboardIcon from "@mui/icons-material/Dashboard"
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts"
import ApartmentIcon from "@mui/icons-material/Apartment"
import HistoryIcon from "@mui/icons-material/History"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import ReportProblemIcon from "@mui/icons-material/ReportProblem"
import WorkIcon from "@mui/icons-material/Work"
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck"
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd"
import WorkspacesIcon from "@mui/icons-material/Workspaces"
import AutorenewIcon from "@mui/icons-material/Autorenew"
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant"
import LogoutIcon from "@mui/icons-material/Logout"
import SettingsIcon from "@mui/icons-material/Settings"
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import SupportAgentIcon from "@mui/icons-material/SupportAgent"
import EngineeringIcon from "@mui/icons-material/Engineering"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import BusinessIcon from "@mui/icons-material/Business"
import DnsIcon from "@mui/icons-material/Dns"
import HandshakeIcon from "@mui/icons-material/Handshake"
import ContactsIcon from "@mui/icons-material/Contacts"
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing"
import HubIcon from "@mui/icons-material/Hub"
import AccountTreeIcon from "@mui/icons-material/AccountTree"
import ViewListIcon from "@mui/icons-material/ViewList"
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep"
import { api, revokeAndLogout } from "../lib/api"
import { PAGE_GUTTER } from "../lib/layout"
import DcimSubNav, { DCIM_DESTINATIONS } from "../components/DcimSubNav"
import NotificationBell from "../components/NotificationBell"
import { LoadingState } from "../components/PageState"
import { shellTokens } from "../components/shared"
import { getCurrentUser, isOrgSuperRole } from "../lib/auth"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getSelectedClientId, setSelectedClientId } from "../lib/scope"
import { useThemeMode } from "../lib/theme"
import { personName, userInitials } from "../lib/userDisplay"
import { useMe } from "../lib/useMe"

// ── Breadcrumb context ─────────────────────────────────────────────────────
// Detail pages call setRecordLabel(record.reference) to populate the top bar
// For deep hierarchies, call setBreadcrumbs([{label, path?}, ...]) instead
type Crumb = { label: string; path?: string; onClick?: () => void }
const BreadcrumbCtx = React.createContext<{
  setRecordLabel: (l: string | null) => void
  // The single record-ref slot for the URL's primary record. Unlike setRecordLabel
  // (which writes the shared breadcrumbs[] reset on every pathname change), this is
  // NOT reset on navigation — it's owned by the detail shell via mount/unmount, so a
  // record kept mounted across a drill (Service Desk navigator) keeps its crumb and a
  // drawer rendered over it does not overwrite it. Takes precedence over breadcrumbs[].
  setPrimaryRecordLabel: (l: string | null) => void
  setBreadcrumbs: (crumbs: Crumb[]) => void
  setHideModuleLabel: (hide: boolean) => void
  setPageFullBleed: (fullBleed: boolean) => void
  // Drill-down navigator requests the app sidebar collapse when a record opens.
  setNavCollapsed: (collapsed: boolean) => void
}>({ setRecordLabel: () => {}, setPrimaryRecordLabel: () => {}, setBreadcrumbs: () => {}, setHideModuleLabel: () => {}, setPageFullBleed: () => {}, setNavCollapsed: () => {} })
export function useBreadcrumb() { return React.useContext(BreadcrumbCtx) }

const RECORD_CRUMB_SEP_SX = { color: "#64748b", fontSize: 16, lineHeight: 1, userSelect: "none" as const, flexShrink: 0, mx: "2px" }

function RecordBreadcrumbTrail({ breadcrumbs, nav }: { breadcrumbs: Crumb[]; nav: NavigateFunction }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [menuOpen])

  function navigateCrumb(crumb: Crumb) {
    if (crumb.onClick) crumb.onClick()
    else if (crumb.path) nav(crumb.path)
    setMenuOpen(false)
  }

  const n = breadcrumbs.length
  // Condense when the trail has more than 4 crumbs (5+). Simple count rule.
  const isCondensed = n > 4

  useEffect(() => {
    if (!isCondensed) setMenuOpen(false)
  }, [isCondensed])

  if (n === 0) return null

  if (!isCondensed) {
    return (
      <Box ref={viewportRef} sx={{ position: "relative", minWidth: 0, flexShrink: 1, display: "flex", alignItems: "center", overflow: "hidden" }}>
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === n - 1
          const isClickable = !isLast && !!(crumb.path || crumb.onClick)
          return (
            <React.Fragment key={idx}>
              <Typography sx={RECORD_CRUMB_SEP_SX}>›</Typography>
              {isClickable ? (
                <Box
                  onClick={() => navigateCrumb(crumb)}
                  sx={{
                    px: "8px", py: "5px", borderRadius: "6px",
                    cursor: "pointer", flexShrink: 1, minWidth: 0,
                    transition: "background-color 0.12s",
                    "&:hover": { bgcolor: "rgba(255,255,255,0.08)" }
                  }}
                >
                  <Typography sx={{ fontSize: 14, color: "#a3b4c9", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {crumb.label}
                  </Typography>
                </Box>
              ) : (
                <Typography sx={{
                  fontSize: 14,
                  color: isLast ? "#e2e8f0" : "#a3b4c9",
                  fontWeight: isLast ? 600 : 500,
                  whiteSpace: "nowrap",
                  flexShrink: isLast ? 0 : 1,
                  px: "4px",
                  ...(!isLast ? { overflow: "hidden", textOverflow: "ellipsis" } : {})
                }}>
                  {crumb.label}
                </Typography>
              )}
            </React.Fragment>
          )
        })}
      </Box>
    )
  }

  const prior = breadcrumbs.slice(0, -1)
  const last = breadcrumbs[n - 1]

  return (
    <Box ref={viewportRef} sx={{ position: "relative", minWidth: 0, flexShrink: 1, display: "flex", alignItems: "center", overflow: "hidden" }}>
      <Typography sx={RECORD_CRUMB_SEP_SX}>›</Typography>

      <Box ref={menuRef} sx={{ position: "relative", flexShrink: 0 }}>
        <Box
          component="button"
          type="button"
          onClick={() => setMenuOpen(o => !o)}
          sx={{
            appearance: "none",
            WebkitAppearance: "none",
            border: "none",
            margin: 0,
            font: "inherit",
            px: "10px",
            py: "5px",
            borderRadius: "6px",
            cursor: "pointer",
            flexShrink: 0,
            bgcolor: menuOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)",
            color: "#a3b4c9",
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.2,
            transition: "background-color 0.12s",
            "&:hover": { bgcolor: "rgba(255,255,255,0.08)" }
          }}
        >
          …
        </Box>
        {menuOpen ? (
          <Box sx={{
            position: "absolute",
            top: "100%",
            left: 0,
            mt: "6px",
            zIndex: 2000,
            minWidth: 220,
            py: "6px",
            borderRadius: "8px",
            bgcolor: "#1e293b",
            border: "1px solid #334155",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)"
          }}>
            {prior.map((crumb, i) => {
              const clickable = !!(crumb.path || crumb.onClick)
              return (
                <Box
                  key={i}
                  onClick={clickable ? () => navigateCrumb(crumb) : undefined}
                  sx={{
                    px: "14px",
                    py: "8px",
                    cursor: clickable ? "pointer" : "default",
                    color: "#94a3b8",
                    fontSize: 13,
                    lineHeight: 1.35,
                    wordBreak: "break-word",
                    display: "flex", alignItems: "center", gap: "8px",
                    ...(clickable ? { "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#e2e8f0" } } : {})
                  }}
                >
                  <Box component="span" sx={{ color: "#475569", fontSize: 11, minWidth: 14 }}>{i + 1}.</Box>
                  <Box component="span" sx={{ flex: 1 }}>{crumb.label}</Box>
                </Box>
              )
            })}
          </Box>
        ) : null}
      </Box>

      <Typography sx={RECORD_CRUMB_SEP_SX}>›</Typography>
      <Typography sx={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, px: "4px" }}>{last.label}</Typography>
    </Box>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────
const SIDEBAR_EXPANDED = 236
const SIDEBAR_COLLAPSED = 56
const HEADER_HEIGHT = 56
const ICON_SIZE = 20
const SCOPE_INDEPENDENT_PATHS = ["/my-work", "/overview", "/audit", "/clients", "/admin/users"]

// DCIM = "app within the app" (DCIM_DESIGN_BRIEF §1). On any of these routes the
// main sidebar auto-collapses to its icon rail and the DcimSubNav panel opens
// beside it; leaving restores the prior sidebar state.
const DCIM_ROUTE_PREFIXES = [
  "/dcim", "/asset-hierarchy", "/asset-register", "/asset-management",
  "/connections", "/maintenance", "/pending-deletions",
]
const DCIM_LANDING = "/dcim/overview"

type NavItem = { label: string; path: string; icon: React.ReactNode; roles: string[] }
type NavGroup = { kind: "group"; label: string; icon: React.ReactNode; matchPaths: string[]; roles: string[]; items: NavItem[] }
type NavSectionEntry = NavItem | NavGroup
type NavSection = { title: string; icon?: React.ReactNode; items: NavSectionEntry[] }

const personalItems: NavItem[] = [
  { label: "My Work", path: "/my-work", icon: <AssignmentIndIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
  { label: "Overview", path: "/overview", icon: <WorkspacesIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] }
]

const scopeIndependentSections: NavSection[] = [
  {
    title: "Admin", icon: <AdminPanelSettingsIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Audit Trail", path: "/audit", icon: <HistoryIcon sx={{ fontSize: ICON_SIZE }} />, roles: [ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.SERVICE_MANAGER] },
      { label: "Clients", path: "/clients", icon: <ApartmentIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] },
      { label: "Users", path: "/admin/users", icon: <ManageAccountsIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] },
    ]
  }
]

const clientSections: NavSection[] = [
  { title: "", items: [{ label: "Dashboard", path: "/dashboard", icon: <DashboardIcon sx={{ fontSize: ICON_SIZE }} />, roles: Object.values(ROLES) }] },
  {
    title: "Service Management", icon: <SupportAgentIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Service Desk", path: "/service-desk", icon: <ConfirmationNumberIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Risks & Issues", path: "/risks-issues", icon: <ReportProblemIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
      // Changes + Incidents are unified into Service Desk — they no longer have their own nav entries.
    ]
  },
  {
    // CRM (CRM_DESIGN.md §7) — AD-staff only, never CLIENT_VIEWER.
    title: "CRM", icon: <HandshakeIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Pipeline", path: "/crm/pipeline", icon: <TrendingUpIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Contacts", path: "/crm/contacts", icon: <ContactsIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Activity", path: "/crm/activity", icon: <ForumOutlinedIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
    ]
  },
  {
    // DCIM is gated to ORG-super roles only — the module is unfinished, so it's hidden
    // from non-admin roles in nav. Routes stay reachable by direct URL (deliberate: not
    // route-guarded — DCIM isn't sensitive, just not ready for general use yet).
    // Items derived from the shared DCIM_DESTINATIONS (single source of truth with
    // the desktop DcimSubNav). On desktop the DCIM section is a launcher and these
    // aren't rendered inline (the sub-nav is used); on mobile the section expands
    // inline in the drawer so every DCIM page is reachable there too.
    title: "DCIM", icon: <DnsIcon sx={{ fontSize: ICON_SIZE }} />,
    items: DCIM_DESTINATIONS.map(d => ({ label: d.label, path: d.path, icon: d.icon, roles: [...ORG_SUPER_ROLES] })),
  },
  {
    title: "Operations", icon: <EngineeringIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Field Work", path: "/checks", icon: <FactCheckIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Templates", path: "/check-templates", icon: <PlaylistAddCheckIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
    ]
  },
  {
    title: "Client Admin", icon: <AdminPanelSettingsIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Service Scope", path: "/work-packages", icon: <WorkIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Users", path: "/users", icon: <ManageAccountsIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] },
    ]
  }
]

// ── Shared helpers ─────────────────────────────────────────────────────────
function SbDivider() {
  return <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mx: 2, my: "6px" }} />
}

// CSS fade box — animates maxWidth + opacity, never removes from DOM
function FadeBox({ visible, children, maxW = 200 }: { visible: boolean; children: React.ReactNode; maxW?: number }) {
  return (
    <Box sx={{
      overflow: "hidden",
      maxWidth: visible ? maxW : 0,
      opacity: visible ? 1 : 0,
      transition: "max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease",
      whiteSpace: "nowrap"
    }}>
      {children}
    </Box>
  )
}

function SectionFlyout({ title, items, anchorEl, onClose, onNavigate, pathname }: {
  title: string; items: NavItem[]; anchorEl: HTMLElement
  onClose: () => void; onNavigate: (path: string) => void; pathname: string
}) {
  const rect = anchorEl.getBoundingClientRect()
  return (
    <>
      <Box onClick={onClose} sx={{ position: "fixed", inset: 0, zIndex: 1500 }} />
      <Box sx={{
        position: "fixed", top: rect.top, left: SIDEBAR_COLLAPSED + 4, zIndex: 1501,
        bgcolor: shellTokens.bg, border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        minWidth: 200, py: "6px"
      }}>
        <Typography sx={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#475569", px: "12px", pt: "4px", pb: "6px" }}>
          {title}
        </Typography>
        <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mb: "4px" }} />
        {items.map(item => {
          const isActive = item.path === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.path)
          return (
            <Box key={item.path} onClick={() => { onNavigate(item.path); onClose() }} sx={{
              display: "flex", alignItems: "center", gap: "10px", px: "12px", py: "8px", cursor: "pointer",
              bgcolor: isActive ? "rgba(59,130,246,0.15)" : "transparent",
              color: isActive ? "#e2e8f0" : "#94a3b8",
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#cbd5e1" }
            }}>
              <Box sx={{ color: isActive ? "#7db4f5" : "#475569", display: "flex" }}>{item.icon}</Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: isActive ? 500 : 400 }}>{item.label}</Typography>
            </Box>
          )
        })}
      </Box>
    </>
  )
}

function ClientFlyout({ anchorEl, clients, selectedClientId, onSelect, onClose }: {
  anchorEl: HTMLElement; clients: { id: string; name: string; lifecycleStage?: string }[]
  selectedClientId: string; onSelect: (id: string) => void; onClose: () => void
}) {
  const rect = anchorEl.getBoundingClientRect()
  return (
    <>
      <Box onClick={onClose} sx={{ position: "fixed", inset: 0, zIndex: 1500 }} />
      <Box sx={{
        position: "fixed", top: rect.top, left: SIDEBAR_COLLAPSED + 4, zIndex: 1501,
        bgcolor: shellTokens.bg, border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        minWidth: 200, py: "6px"
      }}>
        <Typography sx={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#475569", px: "12px", pt: "4px", pb: "6px" }}>
          Client scope
        </Typography>
        <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mb: "4px" }} />
        {clients.map(c => {
          const isSelected = selectedClientId === c.id
          return (
            <Box key={c.id} onClick={() => { onSelect(c.id); onClose() }} sx={{
              display: "flex", alignItems: "center", gap: "10px", px: "12px", py: "8px", cursor: "pointer",
              bgcolor: isSelected ? "rgba(59,130,246,0.15)" : "transparent",
              color: isSelected ? "#e2e8f0" : "#94a3b8",
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#cbd5e1" }
            }}>
              <BusinessIcon sx={{ fontSize: ICON_SIZE, color: isSelected ? "#7db4f5" : "#475569" }} />
              <Typography sx={{ fontSize: 13.5, fontWeight: isSelected ? 500 : 400, flex: 1 }}>
                {c.name}{c.lifecycleStage === "PROSPECT" ? " · prospect" : c.lifecycleStage === "ONBOARDING" ? " · onboarding" : ""}
              </Typography>
              {isSelected ? <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#22c55e", flexShrink: 0 }} /> : null}
            </Box>
          )
        })}
      </Box>
    </>
  )
}

// CollapsibleSection — same DOM always, CSS controls text/chevron visibility.
// `launcher` mode (DCIM): the row is a MODULE LAUNCHER, not an expandable group —
// it navigates into its own nav world (the DcimSubNav) instead of expanding
// inline or opening a rail flyout. So it renders no expand chevron and no inline
// children, and a right-arrow hints "enters" rather than "expands" (brief §1).
function CollapsibleSection({ title, icon, isOpen, hasActive, onToggle, children, expanded, launcher = false }: {
  title: string; icon?: React.ReactNode; isOpen: boolean; hasActive: boolean
  onToggle: (e: React.MouseEvent) => void; children: React.ReactNode; expanded: boolean; launcher?: boolean
}) {
  return (
    <Box>
      <Tooltip title={!expanded ? title : ""} placement="right">
        <Box onClick={onToggle} sx={{
          display: "flex", alignItems: "center",
          mx: "10px", px: "8px", py: "7px", borderRadius: "6px", cursor: "pointer", mb: "1px",
          bgcolor: isOpen ? "rgba(255,255,255,0.06)" : hasActive ? "rgba(59,130,246,0.08)" : "transparent",
          "&:hover": { bgcolor: isOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)" },
          transition: "background-color 0.15s"
        }}>
          {icon ? (
            <Box sx={{ color: isOpen ? "#7db4f5" : hasActive ? "#7db4f5" : "#64748b", display: "flex", flexShrink: 0, width: ICON_SIZE, transition: "color 0.15s" }}>
              {icon}
            </Box>
          ) : null}
          <FadeBox visible={expanded} maxW={160}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", ml: "14px", color: isOpen ? "#cbd5e1" : hasActive ? "#7db4f5" : "#94a3b8", transition: "color 0.15s" }}>
              {title}
            </Typography>
          </FadeBox>
          <Box sx={{
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
            width: expanded ? 16 : 0, height: 16, flexShrink: 0,
            ml: "auto", // right-align every section's chevron (matches DCIM)
            opacity: expanded ? (launcher ? 0.7 : 1) : 0,
            transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease, transform 0.2s ease",
            transform: !launcher && isOpen ? "rotate(90deg)" : "rotate(0deg)",
            color: launcher ? (hasActive ? "#7db4f5" : "#475569") : isOpen ? "#475569" : "#334155",
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Box>
        </Box>
      </Tooltip>
      {launcher ? null : <Collapse in={isOpen && expanded} timeout={220}>{children}</Collapse>}
    </Box>
  )
}

// NavItem — same DOM always, text fades via CSS
function NavItem({ item, selected, onClick, expanded }: { item: NavItem; selected: boolean; onClick: () => void; expanded: boolean }) {
  return (
    <Tooltip title={!expanded ? item.label : ""} placement="right">
      <ListItemButton selected={selected} onClick={onClick} sx={{
        borderRadius: "6px", mb: "1px", py: "7px", px: "10px", minHeight: 0,
        color: "#a3b4c9", justifyContent: "flex-start",
        "& .MuiListItemIcon-root": { color: "#64748b", minWidth: 0, mr: expanded ? "12px" : 0, transition: "margin 0.22s cubic-bezier(0.4,0,0.2,1)" },
        "&.Mui-selected": { bgcolor: "rgba(59,130,246,0.15)", color: "#e2e8f0", "& .MuiListItemIcon-root": { color: "#7db4f5" } },
        "&.Mui-selected:hover": { bgcolor: "rgba(59,130,246,0.22)" },
        "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#cbd5e1" }
      }}>
        <ListItemIcon><Box sx={{ display: "flex", alignItems: "center", width: ICON_SIZE, height: ICON_SIZE }}>{item.icon}</Box></ListItemIcon>
        <FadeBox visible={expanded} maxW={180}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 400, lineHeight: 1.3, whiteSpace: "nowrap" }}>{item.label}</Typography>
        </FadeBox>
      </ListItemButton>
    </Tooltip>
  )
}

function NavSubGroup({ group, open, onToggle, pathname, onNavigate, expanded }: {
  group: NavGroup; open: boolean; onToggle: () => void
  pathname: string; onNavigate: (path: string) => void; expanded: boolean
}) {
  const hasActive = group.matchPaths.some(p => pathname.startsWith(p))
  return (
    <Box>
      <Box onClick={onToggle} sx={{
        display: "flex", alignItems: "center", borderRadius: "6px", mb: "1px",
        mx: 0, px: "10px", py: "7px", cursor: "pointer",
        bgcolor: open ? "rgba(255,255,255,0.04)" : hasActive && !open ? "rgba(59,130,246,0.08)" : "transparent",
        color: hasActive ? "#7db4f5" : "#a3b4c9",
        "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#cbd5e1" },
        transition: "background-color 0.15s"
      }}>
        <Box sx={{ color: hasActive ? "#7db4f5" : "#64748b", display: "flex", flexShrink: 0, width: ICON_SIZE, transition: "color 0.15s" }}>
          {group.icon}
        </Box>
        <Box sx={{
          overflow: "hidden", maxWidth: expanded ? 140 : 0,
          opacity: expanded ? 1 : 0,
          transition: "max-width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease",
          ml: expanded ? "12px" : 0,
        }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", color: "inherit" }}>
            {group.label}
          </Typography>
        </Box>
        <Box sx={{
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden",
          width: expanded ? 16 : 0, height: 16, flexShrink: 0, ml: "auto",
          opacity: expanded ? 1 : 0,
          transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease, transform 0.2s ease",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          color: open ? "#475569" : "#334155",
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Box>
      </Box>
      <Collapse in={open && expanded} timeout={220}>
        <List dense disablePadding sx={{
          pt: "2px", pb: "4px",
          position: "relative", pl: "18px", ml: "8px",
          "&::before": {
            content: "\"\"", position: "absolute",
            left: "12px", top: "4px", bottom: "6px",
            width: "1px", bgcolor: "rgba(148,163,184,0.25)"
          }
        }}>
          {group.items.filter(i => hasAnyRole(i.roles)).map(item => (
            <NavItem key={item.path} item={item}
              selected={pathname.startsWith(item.path)}
              onClick={() => onNavigate(item.path)} expanded={expanded} />
          ))}
        </List>
      </Collapse>
    </Box>
  )
}

function UserMenu({ name, initials, email, roleLabel, loggingOut, onLogout }: {
  name: string; initials: string; email: string; roleLabel: string; loggingOut: boolean; onLogout: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const nav = useNavigate()
  const { mode, toggleMode } = useThemeMode()
  const isDark = mode === "dark"

  // Popover surface is mode-aware so the menu hosting the toggle reads correctly in
  // both modes (the chrome around it is navy in both).
  const panelBg = isDark ? "#1e293b" : "#ffffff"
  const panelBorder = isDark ? "#334155" : "#e2e8f0"
  const headerBorder = isDark ? "#334155" : "#f1f5f9"
  const itemColor = isDark ? "#94a3b8" : "#64748b"
  const itemHoverBg = isDark ? "#172033" : "#f8fafc"
  const itemHoverColor = isDark ? "#e2e8f0" : "#0f172a"
  const primaryText = isDark ? "#e2e8f0" : "#0f172a"

  return (
    <>
      <Box onClick={() => setOpen(o => !o)} sx={{ display: "flex", alignItems: "center", gap: "8px", px: "10px", py: "4px", borderRadius: "6px", cursor: "pointer", "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
        <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "rgba(59,130,246,0.25)", color: "#7db4f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{initials}</Box>
        <Typography sx={{ fontSize: 12.5, color: "#a3b4c9" }}>{name || email.split("@")[0]}</Typography>
        <Typography sx={{ fontSize: 10, color: "#64748b" }}>▾</Typography>
      </Box>
      {open ? (
        <>
          <Box sx={{ position: "fixed", top: HEADER_HEIGHT + 4, right: 12, zIndex: 1400, bgcolor: panelBg, border: `1px solid ${panelBorder}`, borderRadius: "8px", boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.45)" : "0 4px 16px rgba(15,23,42,0.10)", minWidth: 200, py: "4px" }}>
            <Box sx={{ px: "12px", py: "8px", borderBottom: `1px solid ${headerBorder}` }}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: primaryText }}>{name || email.split("@")[0]}</Typography>
              <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: "1px", wordBreak: "break-all" }}>{email}</Typography>
              <Typography sx={{ fontSize: 11, color: "#94a3b8", textTransform: "capitalize", mt: "2px" }}>{roleLabel}</Typography>
            </Box>
            {/* Dark mode — same item pattern as Settings/Sign out; the row toggles, the
                switch reflects current state. Does NOT close the menu, so the flip is visible. */}
            <Box onClick={toggleMode} sx={{ display: "flex", alignItems: "center", gap: "10px", px: "12px", py: "9px", cursor: "pointer", color: itemColor, "&:hover": { bgcolor: itemHoverBg, color: itemHoverColor } }}>
              <DarkModeOutlinedIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 13, flex: 1 }}>Dark mode</Typography>
              <Switch
                size="small"
                checked={isDark}
                onClick={e => e.stopPropagation()}
                onChange={toggleMode}
                sx={{ m: 0 }}
              />
            </Box>
            <Box onClick={() => { setOpen(false); nav("/settings") }} sx={{ display: "flex", alignItems: "center", gap: "10px", px: "12px", py: "9px", cursor: "pointer", color: itemColor, "&:hover": { bgcolor: itemHoverBg, color: itemHoverColor } }}>
              <SettingsIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 13 }}>Settings</Typography>
            </Box>
            <Box onClick={() => { setOpen(false); onLogout() }} sx={{ display: "flex", alignItems: "center", gap: "10px", px: "12px", py: "9px", cursor: "pointer", color: itemColor, "&:hover": { bgcolor: itemHoverBg, color: itemHoverColor } }}>
              <LogoutIcon sx={{ fontSize: 14 }} />
              <Typography sx={{ fontSize: 13 }}>{loggingOut ? "Signing out..." : "Sign out"}</Typography>
            </Box>
          </Box>
          <Box onClick={() => setOpen(false)} sx={{ position: "fixed", inset: 0, zIndex: 1399 }} />
        </>
      ) : null}
    </>
  )
}

// ── Main Shell ────────────────────────────────────────────────────────────
export default function Shell() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))
  const nav = useNavigate()
  const loc = useLocation()
  const queryClient = useQueryClient()
  const currentUser = getCurrentUser()
  const { mode } = useThemeMode()
  // Content surface flips in dark mode; the navy chrome (sidebar/top bar) stays put.
  const contentBg = mode === "dark" ? "#0b1220" : "#f8fafc"

  // Two-state client selector: every logged-in user gets the selector; only its
  // DATA SOURCE differs. Org-super sources from GET /clients (all org clients) and
  // can be "All clients" on scope-independent pages; client-scoped users source
  // from GET /clients/mine (only their assignments) and are always scoped to one.
  const isOrgSuper = isOrgSuperRole(currentUser?.role)
  const isScopeIndependent = SCOPE_INDEPENDENT_PATHS.some(p => loc.pathname.startsWith(p))

  const [selectedClientId, setSelectedClientIdState] = useState(getSelectedClientId() ?? "")
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [openSubSection, setOpenSubSection] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbsState] = useState<Crumb[]>([])
  // Non-reset primary record ref (see context type). Owned by the detail shell.
  const [primaryRecordLabel, setPrimaryRecordLabelState] = useState<string | null>(null)
  const [hideModuleLabel, setHideModuleLabelState] = useState(false)
  const [pageFullBleed, setPageFullBleedState] = useState(false)
  const [flyout, setFlyout] = useState<
    | { kind: "section"; title: string; items: NavItem[]; anchor: HTMLElement }
    | { kind: "client"; anchor: HTMLElement }
    | null
  >(null)

  // The primary record ref (mount/unmount-owned, not reset) wins over the shared
  // breadcrumbs[] trail; falls back to breadcrumbs[] when no record shell is mounted.
  const effectiveBreadcrumbs = primaryRecordLabel ? [{ label: primaryRecordLabel }] : breadcrumbs
  const recordLabel = effectiveBreadcrumbs.length > 0 ? effectiveBreadcrumbs[effectiveBreadcrumbs.length - 1].label : null

  const setRecordLabel = React.useCallback((l: string | null) => {
    setBreadcrumbsState(l ? [{ label: l }] : [])
  }, [])
  const setPrimaryRecordLabel = React.useCallback((l: string | null) => {
    setPrimaryRecordLabelState(l ? l : null)
  }, [])
  const setBreadcrumbs = React.useCallback((crumbs: Crumb[]) => {
    setBreadcrumbsState(crumbs)
  }, [])
  const setHideModuleLabel = React.useCallback((hide: boolean) => {
    setHideModuleLabelState(hide)
  }, [])
  const setPageFullBleed = React.useCallback((fullBleed: boolean) => {
    setPageFullBleedState(fullBleed)
  }, [])

  // Drill-down navigator collapse: when a record opens it asks the sidebar to
  // collapse. The navigator ONLY ever collapses (on drill-in to depth ≥ 1) —
  // it never expands. Returning to depth 0 leaves the menu collapsed; expanding
  // again is always the user's explicit choice via the sidebar toggle. So
  // collapsed=false is a no-op here. Driving sidebarExpanded directly reuses the
  // existing icon-only rendering + flyouts (no parallel "forced collapse" flag).
  const setNavCollapsed = React.useCallback((collapsed: boolean) => {
    if (collapsed) setSidebarExpanded(false)
  }, [])

  const breadcrumbValue = React.useMemo(
    () => ({ setRecordLabel, setPrimaryRecordLabel, setBreadcrumbs, setHideModuleLabel, setPageFullBleed, setNavCollapsed }),
    [setRecordLabel, setPrimaryRecordLabel, setBreadcrumbs, setHideModuleLabel, setPageFullBleed, setNavCollapsed]
  )

  // Auto-reset breadcrumbs and module-label hide whenever the route changes.
  // NB: full-bleed is deliberately NOT reset here. It's owned by each full-bleed
  // page via mount-assert + unmount-cleanup; resetting it on every pathname change
  // breaks pages that stay mounted across param changes (e.g. the Service Desk
  // drill-down navigator drilling queue → ticket), which would lose full-bleed and
  // get wrapped in the default page padding.
  React.useEffect(() => {
    setBreadcrumbsState([])
    setHideModuleLabelState(false)
  }, [loc.pathname])

  const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED

  // ── DCIM "app within the app" ──────────────────────────────────────────
  // On DCIM routes: collapse the main rail + show the DcimSubNav panel; restore
  // the pre-entry sidebar state on leave. A ref (not state) holds the prior
  // expanded flag so the effect only fires on enter/leave transitions, leaving
  // any manual expand/collapse the user makes WHILE inside DCIM untouched.
  const isDcimRoute = !isMobile && DCIM_ROUTE_PREFIXES.some(p => loc.pathname.startsWith(p))
  const preDcimExpandedRef = useRef<boolean | null>(null)
  React.useEffect(() => {
    if (isDcimRoute) {
      if (preDcimExpandedRef.current === null) {
        preDcimExpandedRef.current = sidebarExpanded
        setSidebarExpanded(false)
      }
    } else if (preDcimExpandedRef.current !== null) {
      setSidebarExpanded(preDcimExpandedRef.current)
      preDcimExpandedRef.current = null
    }
  }, [isDcimRoute]) // eslint-disable-line

  function toggleSection(title: string) { setOpenSection(prev => prev === title ? null : title) }

  React.useEffect(() => {
    const sections = [...scopeIndependentSections, ...clientSections]
    const active = sections.find(s =>
      s.title &&
      s.items.some(item => {
        if ('kind' in item) return item.matchPaths.some(p => loc.pathname.startsWith(p))
        return item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path)
      })
    )
    setOpenSection(active?.title ?? null)
  }, [loc.pathname]) // eslint-disable-line

  React.useEffect(() => {
    const isAssetsPath = loc.pathname.startsWith("/asset-hierarchy") || loc.pathname.startsWith("/asset-register") || loc.pathname.startsWith("/asset-management")
    setOpenSubSection(isAssetsPath ? "Assets" : null)
  }, [loc.pathname])

  // Org-super: all org clients. Client-scoped: only the caller's assignments.
  const clients = useQuery({
    queryKey: ["clients"], enabled: isOrgSuper,
    queryFn: async () => (await api.get<Array<{ id: string; name: string; lifecycleStage?: string }>>("/clients")).data
  })
  const myClients = useQuery({
    queryKey: ["clients-mine"], enabled: !isOrgSuper,
    queryFn: async () => (await api.get<Array<{ id: string; name: string; lifecycleStage?: string }>>("/clients/mine")).data
  })
  // The list that populates the selector + flyout for this user. Live clients
  // first, prospects grouped after them, FORMER hidden (CRM_DESIGN.md §2).
  const rawClientList = isOrgSuper ? (clients.data ?? []) : (myClients.data ?? [])
  const clientList = React.useMemo(() => {
    const visible = rawClientList.filter(c => c.lifecycleStage !== "FORMER")
    const rank = (c: { lifecycleStage?: string }) => (c.lifecycleStage === "PROSPECT" ? 1 : 0)
    return [...visible].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }, [rawClientList])

  // The JWT (and thus getCurrentUser) carries no name — only email. Fetch the profile so the
  // account menu can show the person's actual name (knownAs verbatim, see personName) rather
  // than the email local-part. Until it loads, personName falls back to the email prefix.
  const me = useMe()

  // Invalidate everything EXCEPT the two client-list queries (which are scope-
  // independent themselves) when the active client changes.
  const invalidateScoped = () =>
    queryClient.invalidateQueries({
      predicate: q => q.queryKey[0] !== "clients" && q.queryKey[0] !== "clients-mine"
    })

  // Default/validate the active client against the user's list. Always leaves a
  // valid selection (first in the list) so client-scoped sections can render —
  // EXCEPT org-super on a scope-independent page, where "" means "All clients".
  React.useEffect(() => {
    if (isOrgSuper && isScopeIndependent) return
    if (clientList.length === 0) return
    const valid = selectedClientId && clientList.some(c => c.id === selectedClientId)
    if (!valid) {
      const next = clientList[0].id
      setSelectedClientIdState(next)
      setSelectedClientId(next)
      invalidateScoped()
    }
  }, [clients.data, myClients.data, isScopeIndependent]) // eslint-disable-line

  React.useEffect(() => {
    // Org-super on a scope-independent page: drop scope to "All clients" (keeps
    // the stored selection so it can be restored on return).
    if (isOrgSuper && isScopeIndependent) { setSelectedClientIdState(""); setOpenSection(null); invalidateScoped() }
    // Returning to a scoped page: re-read stored scope (the default effect above
    // fills in the first client if there's no valid stored selection).
    if (isOrgSuper && !isScopeIndependent && !selectedClientId) {
      const stored = getSelectedClientId()
      if (stored && clients.data?.some(c => c.id === stored)) {
        setSelectedClientIdState(stored)
        invalidateScoped()
      }
    }
  }, [loc.pathname]) // eslint-disable-line

  const selectedClient = clientList.find(c => c.id === selectedClientId)

  function handleClientChange(clientId: string) {
    setSelectedClientIdState(clientId); setSelectedClientId(clientId || null)
    invalidateScoped()
    if (clientId) nav("/dashboard")
  }

  async function onLogout() { if (loggingOut) return; setLoggingOut(true); await revokeAndLogout(); setLoggingOut(false) }
  function navigateTo(path: string) { nav(path); setMobileOpen(false); setFlyout(null) }

  // Resolved account-menu name: knownAs (verbatim) -> "First Last" -> email local-part.
  const userMenuName = personName({
    knownAs: me.data?.knownAs,
    firstName: me.data?.firstName,
    lastName: me.data?.lastName,
    email: me.data?.email ?? currentUser?.email
  })
  const initials = userMenuName ? userInitials({ displayName: userMenuName }) : "??"
  const roleLabel = currentUser?.role?.toLowerCase().replace(/_/g, " ") ?? ""
  const flatNavItems: NavItem[] = [
    ...personalItems,
    ...scopeIndependentSections.flatMap(s => s.items.flatMap(e => 'kind' in e ? e.items : [e])),
    ...clientSections.flatMap(s => s.items.flatMap(e => 'kind' in e ? e.items : [e])),
  ]

  // Maps URL prefixes that don't match their nav item path to the correct nav item path
  // e.g. /service-requests/:id belongs to the "Service Desk" nav item at /service-desk
  const PATH_PARENT_MAP: Record<string, string> = {
    "/service-requests": "/service-desk",
    "/incidents": "/service-desk",
    "/changes": "/service-desk",
    "/service-desk/sr": "/service-desk",
    "/service-desk/inc": "/service-desk",
    "/service-desk/chg": "/service-desk",
  }

  function resolveActivePage(pathname: string) {
    const direct = flatNavItems.find(i =>
      i.path === "/dashboard" ? pathname === "/dashboard" : i.path !== "/dashboard" && pathname.startsWith(i.path)
    )
    if (direct) return direct
    const parentPath = Object.entries(PATH_PARENT_MAP).find(([prefix]) => pathname.startsWith(prefix))?.[1]
    return parentPath ? (flatNavItems.find(i => i.path === parentPath) ?? null) : null
  }

  const activePage = resolveActivePage(loc.pathname)
  function sectionHasActive(section: NavSection) {
    return section.items.some(entry => {
      if ('kind' in entry) return entry.matchPaths.some(p => loc.pathname.startsWith(p))
      return entry.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(entry.path)
    }) || section.items.some(entry => {
      if ('kind' in entry) return false
      return Object.entries(PATH_PARENT_MAP).some(
        ([prefix, parent]) => loc.pathname.startsWith(prefix) && parent === entry.path
      )
    })
  }

  // ── Sidebar nav ───────────────────────────────────────────────────────
  // On mobile the menu is a full-width temporary drawer — the desktop collapse
  // (icon rail + flyouts) has no meaning there, so the nav is always expanded.
  // This also prevents the navigator's collapse-on-drill (which latches
  // sidebarExpanded=false) from leaking into the mobile drawer.
  const navExpanded = isMobile || sidebarExpanded
  const sidebarNav = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", bgcolor: shellTokens.bg }}>

      {/* ── Sidebar header: hamburger left, logo centred ───────────────── */}
      <Box sx={{
        height: HEADER_HEIGHT, flexShrink: 0,
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* Hamburger — pinned to the left */}
        <IconButton size="small" onClick={isMobile ? () => setMobileOpen(false) : () => setSidebarExpanded(e => !e)} sx={{
          position: "absolute", left: "8px",
          width: 36, height: 36, flexShrink: 0, color: "#64748b", borderRadius: "6px",
          transition: "color 0.15s, background-color 0.12s",
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#cbd5e1" }
        }}>
          <MenuIcon sx={{ fontSize: 20 }} />
        </IconButton>
        {/* Logo — centred in the full sidebar width */}
        <FadeBox visible={navExpanded} maxW={180}>
          <img src="/ad-logo-white-new.svg" alt="Assured Digital" style={{ height: 28, width: "auto", objectFit: "contain", maxWidth: 160, display: "block" }} />
        </FadeBox>
      </Box>

      {/* ── Scrollable nav body ─────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", py: "8px" }}>

        {/* Personal */}
        {personalItems.some(i => hasAnyRole(i.roles)) ? (
          <List dense disablePadding sx={{ px: 1, mb: "4px" }}>
            {personalItems.filter(i => hasAnyRole(i.roles)).map(item => (
              <NavItem key={item.path} item={item} selected={loc.pathname === item.path} onClick={() => navigateTo(item.path)} expanded={navExpanded} />
            ))}
          </List>
        ) : null}

        {/* Scope-independent sections (org-level) */}
        {scopeIndependentSections.map(section => {
          const visible = section.items.filter(i => hasAnyRole(i.roles))
          if (visible.length === 0) return null

          const isOpen = openSection === section.title
          const hasActive = sectionHasActive(section)

          return (
            <CollapsibleSection key={section.title} title={section.title} icon={section.icon}
              isOpen={isOpen} hasActive={hasActive} expanded={navExpanded}
              onToggle={(e) => {
                if (!navExpanded) {
                  const target = e.currentTarget as HTMLElement
                  const flyoutItems: NavItem[] = visible.flatMap(entry => 'kind' in entry ? entry.items : [entry])
                  setFlyout(prev => prev?.kind === "section" && prev.title === section.title ? null : { kind: "section", title: section.title, items: flyoutItems, anchor: target })
                  return
                }
                toggleSection(section.title)
              }}
            >
              <List
                dense
                disablePadding
                sx={{
                  px: 1, pt: "2px", pb: "4px",
                  ...(navExpanded ? {
                    position: "relative",
                    pl: "18px",
                    ml: "8px",
                    "&::before": {
                      content: "\"\"",
                      position: "absolute",
                      left: "12px",
                      top: "4px",
                      bottom: "6px",
                      width: "1px",
                      bgcolor: "rgba(148,163,184,0.35)"
                    }
                  } : {})
                }}
              >
                {visible.map(entry =>
                  'kind' in entry
                    ? <NavSubGroup key={entry.label} group={entry} open={openSubSection === entry.label}
                        onToggle={() => setOpenSubSection(s => s === entry.label ? null : entry.label)}
                        pathname={loc.pathname} onNavigate={navigateTo} expanded={navExpanded} />
                    : <NavItem key={entry.path} item={entry}
                        selected={entry.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(entry.path)}
                        onClick={() => navigateTo(entry.path)} expanded={navExpanded} />
                )}
              </List>
            </CollapsibleSection>
          )
        })}

        <SbDivider />

        {/* Client scope — always shown; list source differs by role (see clientList) */}
        <Box sx={{ mx: "6px", mb: "4px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "10px", px: "10px", pb: "6px" }}>
            <Tooltip title={!navExpanded ? (selectedClient ? `Client: ${selectedClient.name}` : "Select client") : ""} placement="right">
              <Box
                onClick={!navExpanded ? e => { const t = e.currentTarget as HTMLElement; setFlyout(prev => prev?.kind === "client" ? null : { kind: "client", anchor: t }) } : undefined}
                sx={{ flexShrink: 0, width: ICON_SIZE, height: ICON_SIZE, display: "flex", alignItems: "center", justifyContent: "center", cursor: !navExpanded ? "pointer" : "default", color: selectedClientId ? "#7db4f5" : "#475569" }}
              >
                <BusinessIcon sx={{ fontSize: ICON_SIZE }} />
              </Box>
            </Tooltip>
            <FadeBox visible={navExpanded} maxW={160}>
              <Typography sx={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#64748b", whiteSpace: "nowrap" }}>
                Client scope
              </Typography>
            </FadeBox>
          </Box>
          <Box sx={{ maxHeight: navExpanded ? 56 : 0, opacity: navExpanded ? 1 : 0, overflow: "hidden", transition: "max-height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease" }}>
            <Select size="small" value={selectedClientId} onChange={e => handleClientChange(e.target.value)} displayEmpty IconComponent={KeyboardArrowDownIcon}
              sx={{ width: "100%", fontSize: 13, color: selectedClientId ? "#e2e8f0" : "#64748b", bgcolor: "rgba(255,255,255,0.04)", borderRadius: "6px", border: selectedClientId ? "1px solid rgba(255,255,255,0.1)" : "1px dashed rgba(255,255,255,0.08)", "& .MuiOutlinedInput-notchedOutline": { border: "none" }, "& .MuiSvgIcon-root": { color: "#64748b", fontSize: 16 }, "& .MuiSelect-select": { py: "7px", px: "10px" }, "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
              <MenuItem value="" sx={{ fontSize: 13, color: "#94a3b8" }}>— Select client —</MenuItem>
              {clientList.map(c => (
                <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>
                  {c.name}{c.lifecycleStage === "PROSPECT" ? " · prospect" : c.lifecycleStage === "ONBOARDING" ? " · onboarding" : ""}
                </MenuItem>
              ))}
            </Select>
          </Box>
          <SbDivider />
        </Box>

        {/* Client-scoped sections — render once an active client is resolved
            (always true for client-scoped users; "" only for org-super on a
            scope-independent page, where we prompt to pick a client). */}
        {selectedClientId ? (
          <>
            {clientSections.map(section => {
              const visible = section.items.filter(i => hasAnyRole(i.roles))
              if (visible.length === 0) return null

              // Root (Dashboard) — no header
              if (!section.title) {
                return visible.filter((i): i is NavItem => !('kind' in i)).map(item => (
                  <List key={item.path} dense disablePadding sx={{ px: 1, pt: "2px" }}>
                    <NavItem item={item} selected={loc.pathname === "/dashboard"} onClick={() => navigateTo(item.path)} expanded={navExpanded} />
                  </List>
                ))
              }

              const isOpen = openSection === section.title
              const hasActive = sectionHasActive(section)

              // DCIM is a module launcher, not an expandable group: its sub-nav
              // IS the submenu, so entering the module is the only action —
              // whether the rail is collapsed or expanded — and it never opens
              // the redundant rail flyout (brief §1).
              // Launcher (enter-the-module → sub-nav) is a DESKTOP behaviour. On
              // mobile there is no sub-nav, so DCIM expands inline in the drawer
              // like any other section — otherwise its pages are unreachable.
              const isDcimLauncher = section.title === "DCIM" && !isMobile

              return (
                <CollapsibleSection key={section.title} title={section.title} icon={section.icon}
                  isOpen={isOpen} hasActive={hasActive} expanded={navExpanded} launcher={isDcimLauncher}
                  onToggle={(e) => {
                    if (isDcimLauncher) { navigateTo(DCIM_LANDING); return }
                    if (!navExpanded) {
                      const target = e.currentTarget as HTMLElement
                      const flyoutItems: NavItem[] = visible.flatMap(entry => 'kind' in entry ? entry.items : [entry])
                      setFlyout(prev => prev?.kind === "section" && prev.title === section.title ? null : { kind: "section", title: section.title, items: flyoutItems, anchor: target })
                      return
                    }
                    toggleSection(section.title)
                  }}
                >
                  <List
                    dense
                    disablePadding
                    sx={{
                      px: 1, pt: "2px", pb: "4px",
                      ...(navExpanded ? {
                        position: "relative",
                        pl: "18px",
                        ml: "8px",
                        "&::before": {
                          content: "\"\"",
                          position: "absolute",
                          left: "12px",
                          top: "4px",
                          bottom: "6px",
                          width: "1px",
                          bgcolor: "rgba(148,163,184,0.35)"
                        }
                      } : {})
                    }}
                  >
                    {visible.map(entry =>
                      'kind' in entry
                        ? <NavSubGroup key={entry.label} group={entry} open={openSubSection === entry.label}
                            onToggle={() => setOpenSubSection(s => s === entry.label ? null : entry.label)}
                            pathname={loc.pathname} onNavigate={navigateTo} expanded={navExpanded} />
                        : <NavItem key={entry.path} item={entry}
                            selected={entry.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(entry.path)}
                            onClick={() => navigateTo(entry.path)} expanded={navExpanded} />
                    )}
                  </List>
                </CollapsibleSection>
              )
            })}
          </>
        ) : !navExpanded ? null : (
          <Box sx={{ px: "16px", py: "12px" }}>
            <Typography sx={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>Select a client above to view their service data.</Typography>
          </Box>
        )}
      </Box>
    </Box>
  )

  // ── Mobile ────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Box sx={{ height: HEADER_HEIGHT, flexShrink: 0, bgcolor: shellTokens.top, display: "flex", alignItems: "center", px: 2, gap: 1 }}>
          <IconButton onClick={() => setMobileOpen(true)} sx={{ color: "#94a3b8" }}><MenuIcon /></IconButton>
          <img src="/ad-logo-white-new.svg" alt="Assured Digital" style={{ height: 28, width: "auto", objectFit: "contain", maxWidth: 200 }} />
        </Box>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
          sx={{ [`& .MuiDrawer-paper`]: { width: SIDEBAR_EXPANDED, background: shellTokens.bg, borderRight: "1px solid rgba(255,255,255,0.05)" } }}>
          {sidebarNav}
        </Drawer>
        <Box component="main" sx={{ flex: 1, overflow: "auto", bgcolor: contentBg, p: "12px" }}><Suspense fallback={<LoadingState />}><Outlet /></Suspense></Box>
      </Box>
    )
  }

  // ── Desktop ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* Sidebar — full height, owns its own header row */}
      <Box sx={{
        width: sidebarWidth, flexShrink: 0,
        bgcolor: shellTokens.bg,
        borderRight: "1px solid rgba(255,255,255,0.05)",
        overflow: "hidden",
        transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
        display: "flex", flexDirection: "column"
      }}>
        {sidebarNav}
      </Box>

      {/* Flyouts */}
      {flyout?.kind === "section" && !sidebarExpanded ? (
        <SectionFlyout title={flyout.title} items={flyout.items} anchorEl={flyout.anchor} onClose={() => setFlyout(null)} onNavigate={navigateTo} pathname={loc.pathname} />
      ) : null}
      {flyout?.kind === "client" && !sidebarExpanded ? (
        <ClientFlyout anchorEl={flyout.anchor} clients={clientList} selectedClientId={selectedClientId} onSelect={id => { handleClientChange(id); setFlyout(null) }} onClose={() => setFlyout(null)} />
      ) : null}

      {/* DCIM sub-nav — the "app within the app" panel (brief §1), beside the rail */}
      {isDcimRoute ? <DcimSubNav pathname={loc.pathname} onNavigate={navigateTo} /> : null}

      {/* Right column: header + content. minWidth:0 lets it shrink below its
          content's intrinsic width — without it, a wide table/elevation (esp.
          next to the fixed DCIM sub-nav) pushes the column past the viewport
          and the page scrolls sideways. */}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <Box sx={{ height: HEADER_HEIGHT, flexShrink: 0, bgcolor: shellTokens.top, borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", px: "16px", gap: "8px" }}>
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>

            {/* Client badge — "All clients" for org-super on scope-independent
                pages; otherwise the active client (clickable → dashboard). A
                single-assignment client-scoped user gets the same badge; clicking
                navigates to their dashboard, which is harmless. */}
            {isOrgSuper && isScopeIndependent ? (
              <Box sx={{ px: "12px", py: "6px", bgcolor: "rgba(255,255,255,0.05)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>All clients</Typography>
              </Box>
            ) : selectedClient ? (
              <Box
                onClick={() => nav("/dashboard")}
                sx={{
                  display: "flex", alignItems: "center", gap: "7px",
                  px: "12px", py: "6px",
                  bgcolor: "rgba(255,255,255,0.08)", borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0,
                  cursor: "pointer", transition: "all 0.12s",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.14)", borderColor: "rgba(255,255,255,0.22)" }
                }}
              >
                <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#22c55e", flexShrink: 0 }} />
                <Typography sx={{ fontSize: 14, fontWeight: 500, color: "#e2e8f0" }}>{selectedClient.name}</Typography>
              </Box>
            ) : null}

            {/* › separator */}
            {activePage && !hideModuleLabel && ((isOrgSuper && isScopeIndependent) || !!selectedClient) ? (
              <Typography sx={{ color: "#64748b", fontSize: 16, lineHeight: 1, userSelect: "none", flexShrink: 0, mx: "2px" }}>›</Typography>
            ) : null}

            {/* Page name — clickable, navigates to the list page.
                Pages can hide this segment via setHideModuleLabel(true) when the
                breadcrumb trail already identifies the module (e.g. Asset Hierarchy / Register). */}
            {activePage && !hideModuleLabel ? (
              <Box
                onClick={() => nav(activePage.path)}
                sx={{
                  px: "8px", py: "5px", borderRadius: "6px",
                  cursor: "pointer", flexShrink: 1, minWidth: 0,
                  transition: "background-color 0.12s",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.08)" }
                }}
              >
                <Typography sx={{
                  fontSize: 14,
                  color: effectiveBreadcrumbs.length > 0 ? "#a3b4c9" : "#e2e8f0",
                  fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                  {activePage.label}
                </Typography>
              </Box>
            ) : null}

            {/* Record reference — one or more segments after the nav label */}
            <RecordBreadcrumbTrail breadcrumbs={effectiveBreadcrumbs} nav={nav} />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <NotificationBell clientId={selectedClientId} />
            <Box sx={{ width: "1px", height: 22, bgcolor: "rgba(255,255,255,0.1)", mx: "10px" }} />
            <UserMenu name={userMenuName} initials={initials} email={currentUser?.email ?? ""} roleLabel={roleLabel} loggingOut={loggingOut} onLogout={onLogout} />
          </Box>
        </Box>

        {/* Page content */}
        <Box
          component="main"
          sx={{
            flex: 1, bgcolor: contentBg,
            overflow: pageFullBleed ? "hidden" : "auto",
            p: pageFullBleed ? 0 : PAGE_GUTTER,
            display: pageFullBleed ? "flex" : undefined,
            flexDirection: pageFullBleed ? "column" : undefined,
            minHeight: 0,
          }}
        >
          <BreadcrumbCtx.Provider value={breadcrumbValue}>
            <Suspense fallback={<LoadingState />}>
              <Outlet />
            </Suspense>
          </BreadcrumbCtx.Provider>
        </Box>
      </Box>
    </Box>
  )
}