import React, { Suspense, useEffect, useRef, useState } from "react"
import type { NavigateFunction } from "react-router-dom"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, MenuItem, Select, Tooltip, Typography, useMediaQuery, useTheme
} from "@mui/material"
import MenuIcon from "@mui/icons-material/Menu"
import DashboardIcon from "@mui/icons-material/Dashboard"
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber"
import TaskAltIcon from "@mui/icons-material/TaskAlt"
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
import NotificationsIcon from "@mui/icons-material/Notifications"
import LogoutIcon from "@mui/icons-material/Logout"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import HelpOutlineIcon from "@mui/icons-material/HelpOutline"
import SupportAgentIcon from "@mui/icons-material/SupportAgent"
import EngineeringIcon from "@mui/icons-material/Engineering"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import BusinessIcon from "@mui/icons-material/Business"
import DnsIcon from "@mui/icons-material/Dns"
import PrecisionManufacturingIcon from "@mui/icons-material/PrecisionManufacturing"
import HubIcon from "@mui/icons-material/Hub"
import AccountTreeIcon from "@mui/icons-material/AccountTree"
import ViewListIcon from "@mui/icons-material/ViewList"
import InsightsIcon from "@mui/icons-material/Insights"
import { api, revokeAndLogout } from "../lib/api"
import { LoadingState } from "../components/PageState"
import { getCurrentUser, isOrgSuperRole } from "../lib/auth"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getSelectedClientId, setSelectedClientId } from "../lib/scope"

// ── Breadcrumb context ─────────────────────────────────────────────────────
// Detail pages call setRecordLabel(record.reference) to populate the top bar
// For deep hierarchies, call setBreadcrumbs([{label, path?}, ...]) instead
type Crumb = { label: string; path?: string; onClick?: () => void }
const BreadcrumbCtx = React.createContext<{
  setRecordLabel: (l: string | null) => void
  setBreadcrumbs: (crumbs: Crumb[]) => void
  setHideModuleLabel: (hide: boolean) => void
  setPageFullBleed: (fullBleed: boolean) => void
  // Drill-down navigator requests the app sidebar collapse when a record opens.
  setNavCollapsed: (collapsed: boolean) => void
}>({ setRecordLabel: () => {}, setBreadcrumbs: () => {}, setHideModuleLabel: () => {}, setPageFullBleed: () => {}, setNavCollapsed: () => {} })
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
      { label: "Audit Trail", path: "/audit", icon: <HistoryIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
      { label: "Clients", path: "/clients", icon: <ApartmentIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] },
      { label: "Users", path: "/admin/users", icon: <ManageAccountsIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] },
    ]
  }
]

const clientSections: NavSection[] = [
  { title: "", items: [{ label: "Dashboard", path: "/dashboard", icon: <DashboardIcon sx={{ fontSize: ICON_SIZE }} />, roles: Object.values(ROLES) }] },
  {
    title: "Service Management", icon: <SupportAgentIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Dashboard", path: "/service-management/dashboard", icon: <InsightsIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Service Desk", path: "/service-desk", icon: <ConfirmationNumberIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Risks & Issues", path: "/risks-issues", icon: <ReportProblemIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
      // Changes + Incidents are unified into Service Desk — they no longer have their own nav entries.
    ]
  },
  {
    title: "DCIM", icon: <DnsIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Overview", path: "/dcim/overview", icon: <DashboardIcon sx={{ fontSize: ICON_SIZE }} />, roles: Object.values(ROLES) },
      { kind: "group", label: "Assets", icon: <LocationOnIcon sx={{ fontSize: ICON_SIZE }} />, matchPaths: ["/asset-hierarchy", "/asset-register", "/asset-management"], roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER], items: [
        { label: "Hierarchy", path: "/asset-hierarchy", icon: <AccountTreeIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
        { label: "Register",  path: "/asset-register",  icon: <ViewListIcon sx={{ fontSize: ICON_SIZE }} />,    roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
      ]},
      { label: "Maintenance", path: "/maintenance", icon: <PrecisionManufacturingIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
      { label: "Connections", path: "/connections", icon: <HubIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
    ]
  },
  {
    title: "Operations", icon: <EngineeringIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Field Work", path: "/checks", icon: <FactCheckIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Templates", path: "/check-templates", icon: <PlaylistAddCheckIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
      { label: "Tasks", path: "/tasks", icon: <TaskAltIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
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
        bgcolor: "#0d1526", border: "1px solid rgba(255,255,255,0.1)",
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
  anchorEl: HTMLElement; clients: { id: string; name: string }[]
  selectedClientId: string; onSelect: (id: string) => void; onClose: () => void
}) {
  const rect = anchorEl.getBoundingClientRect()
  return (
    <>
      <Box onClick={onClose} sx={{ position: "fixed", inset: 0, zIndex: 1500 }} />
      <Box sx={{
        position: "fixed", top: rect.top, left: SIDEBAR_COLLAPSED + 4, zIndex: 1501,
        bgcolor: "#0d1526", border: "1px solid rgba(255,255,255,0.1)",
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
              <Typography sx={{ fontSize: 13.5, fontWeight: isSelected ? 500 : 400, flex: 1 }}>{c.name}</Typography>
              {isSelected ? <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#22c55e", flexShrink: 0 }} /> : null}
            </Box>
          )
        })}
      </Box>
    </>
  )
}

// CollapsibleSection — same DOM always, CSS controls text/chevron visibility
function CollapsibleSection({ title, icon, isOpen, hasActive, onToggle, children, expanded }: {
  title: string; icon?: React.ReactNode; isOpen: boolean; hasActive: boolean
  onToggle: (e: React.MouseEvent) => void; children: React.ReactNode; expanded: boolean
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
            opacity: expanded ? 1 : 0,
            transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease, transform 0.2s ease",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            color: isOpen ? "#475569" : "#334155",
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Box>
        </Box>
      </Tooltip>
      <Collapse in={isOpen && expanded} timeout={220}>{children}</Collapse>
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

function UserMenu({ initials, email, roleLabel, loggingOut, onLogout }: {
  initials: string; email: string; roleLabel: string; loggingOut: boolean; onLogout: () => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Box onClick={() => setOpen(o => !o)} sx={{ display: "flex", alignItems: "center", gap: "8px", px: "10px", py: "4px", borderRadius: "6px", cursor: "pointer", "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
        <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "rgba(59,130,246,0.25)", color: "#7db4f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{initials}</Box>
        <Typography sx={{ fontSize: 12.5, color: "#a3b4c9" }}>{email.split("@")[0]}</Typography>
        <Typography sx={{ fontSize: 10, color: "#64748b" }}>▾</Typography>
      </Box>
      {open ? (
        <>
          <Box sx={{ position: "fixed", top: HEADER_HEIGHT + 4, right: 12, zIndex: 1400, bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 4px 16px rgba(15,23,42,0.10)", minWidth: 200, py: "4px" }}>
            <Box sx={{ px: "12px", py: "8px", borderBottom: "1px solid #f1f5f9" }}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{email}</Typography>
              <Typography sx={{ fontSize: 11, color: "#94a3b8", textTransform: "capitalize", mt: "2px" }}>{roleLabel}</Typography>
            </Box>
            <Box onClick={() => { setOpen(false); onLogout() }} sx={{ display: "flex", alignItems: "center", gap: "10px", px: "12px", py: "9px", cursor: "pointer", color: "#64748b", "&:hover": { bgcolor: "#f8fafc", color: "#0f172a" } }}>
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
  const [hideModuleLabel, setHideModuleLabelState] = useState(false)
  const [pageFullBleed, setPageFullBleedState] = useState(false)
  const [flyout, setFlyout] = useState<
    | { kind: "section"; title: string; items: NavItem[]; anchor: HTMLElement }
    | { kind: "client"; anchor: HTMLElement }
    | null
  >(null)

  const recordLabel = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : null

  const setRecordLabel = React.useCallback((l: string | null) => {
    setBreadcrumbsState(l ? [{ label: l }] : [])
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
    () => ({ setRecordLabel, setBreadcrumbs, setHideModuleLabel, setPageFullBleed, setNavCollapsed }),
    [setRecordLabel, setBreadcrumbs, setHideModuleLabel, setPageFullBleed, setNavCollapsed]
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
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>("/clients")).data
  })
  const myClients = useQuery({
    queryKey: ["clients-mine"], enabled: !isOrgSuper,
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>("/clients/mine")).data
  })
  // The list that populates the selector + flyout for this user.
  const clientList = isOrgSuper ? (clients.data ?? []) : (myClients.data ?? [])

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

  const initials = currentUser?.email ? currentUser.email.split("@")[0].slice(0, 2).toUpperCase() : "??"
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
  const sidebarNav = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", bgcolor: "#0d1526" }}>

      {/* ── Sidebar header: hamburger left, logo centred ───────────────── */}
      <Box sx={{
        height: HEADER_HEIGHT, flexShrink: 0,
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {/* Hamburger — pinned to the left */}
        <IconButton size="small" onClick={() => setSidebarExpanded(e => !e)} sx={{
          position: "absolute", left: "8px",
          width: 36, height: 36, flexShrink: 0, color: "#64748b", borderRadius: "6px",
          transition: "color 0.15s, background-color 0.12s",
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#cbd5e1" }
        }}>
          <MenuIcon sx={{ fontSize: 20 }} />
        </IconButton>
        {/* Logo — centred in the full sidebar width */}
        <FadeBox visible={sidebarExpanded} maxW={180}>
          <img src="/ad-logo-white-new.svg" alt="Assured Digital" style={{ height: 28, width: "auto", objectFit: "contain", maxWidth: 160, display: "block" }} />
        </FadeBox>
      </Box>

      {/* ── Scrollable nav body ─────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden", py: "8px" }}>

        {/* Personal */}
        {personalItems.some(i => hasAnyRole(i.roles)) ? (
          <List dense disablePadding sx={{ px: 1, mb: "4px" }}>
            {personalItems.filter(i => hasAnyRole(i.roles)).map(item => (
              <NavItem key={item.path} item={item} selected={loc.pathname === item.path} onClick={() => navigateTo(item.path)} expanded={sidebarExpanded} />
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
              isOpen={isOpen} hasActive={hasActive} expanded={sidebarExpanded}
              onToggle={(e) => {
                if (!sidebarExpanded) {
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
                  ...(sidebarExpanded ? {
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
                        pathname={loc.pathname} onNavigate={navigateTo} expanded={sidebarExpanded} />
                    : <NavItem key={entry.path} item={entry}
                        selected={entry.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(entry.path)}
                        onClick={() => navigateTo(entry.path)} expanded={sidebarExpanded} />
                )}
              </List>
            </CollapsibleSection>
          )
        })}

        <SbDivider />

        {/* Client scope — always shown; list source differs by role (see clientList) */}
        <Box sx={{ mx: "6px", mb: "4px" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "10px", px: "10px", pb: "6px" }}>
            <Tooltip title={!sidebarExpanded ? (selectedClient ? `Client: ${selectedClient.name}` : "Select client") : ""} placement="right">
              <Box
                onClick={!sidebarExpanded ? e => { const t = e.currentTarget as HTMLElement; setFlyout(prev => prev?.kind === "client" ? null : { kind: "client", anchor: t }) } : undefined}
                sx={{ flexShrink: 0, width: ICON_SIZE, height: ICON_SIZE, display: "flex", alignItems: "center", justifyContent: "center", cursor: !sidebarExpanded ? "pointer" : "default", color: selectedClientId ? "#7db4f5" : "#475569" }}
              >
                <BusinessIcon sx={{ fontSize: ICON_SIZE }} />
              </Box>
            </Tooltip>
            <FadeBox visible={sidebarExpanded} maxW={160}>
              <Typography sx={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#64748b", whiteSpace: "nowrap" }}>
                Client scope
              </Typography>
            </FadeBox>
          </Box>
          <Box sx={{ maxHeight: sidebarExpanded ? 56 : 0, opacity: sidebarExpanded ? 1 : 0, overflow: "hidden", transition: "max-height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease" }}>
            <Select size="small" value={selectedClientId} onChange={e => handleClientChange(e.target.value)} displayEmpty IconComponent={KeyboardArrowDownIcon}
              sx={{ width: "100%", fontSize: 13, color: selectedClientId ? "#e2e8f0" : "#64748b", bgcolor: "rgba(255,255,255,0.04)", borderRadius: "6px", border: selectedClientId ? "1px solid rgba(255,255,255,0.1)" : "1px dashed rgba(255,255,255,0.08)", "& .MuiOutlinedInput-notchedOutline": { border: "none" }, "& .MuiSvgIcon-root": { color: "#64748b", fontSize: 16 }, "& .MuiSelect-select": { py: "7px", px: "10px" }, "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
              <MenuItem value="" sx={{ fontSize: 13, color: "#94a3b8" }}>— Select client —</MenuItem>
              {clientList.map(c => <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>{c.name}</MenuItem>)}
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
                    <NavItem item={item} selected={loc.pathname === "/dashboard"} onClick={() => navigateTo(item.path)} expanded={sidebarExpanded} />
                  </List>
                ))
              }

              const isOpen = openSection === section.title
              const hasActive = sectionHasActive(section)

              return (
                <CollapsibleSection key={section.title} title={section.title} icon={section.icon}
                  isOpen={isOpen} hasActive={hasActive} expanded={sidebarExpanded}
                  onToggle={(e) => {
                    if (!sidebarExpanded) {
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
                      ...(sidebarExpanded ? {
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
                            pathname={loc.pathname} onNavigate={navigateTo} expanded={sidebarExpanded} />
                        : <NavItem key={entry.path} item={entry}
                            selected={entry.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(entry.path)}
                            onClick={() => navigateTo(entry.path)} expanded={sidebarExpanded} />
                    )}
                  </List>
                </CollapsibleSection>
              )
            })}
          </>
        ) : !sidebarExpanded ? null : (
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
        <Box sx={{ height: HEADER_HEIGHT, flexShrink: 0, bgcolor: "#080f1e", display: "flex", alignItems: "center", px: 2, gap: 1 }}>
          <IconButton onClick={() => setMobileOpen(true)} sx={{ color: "#94a3b8" }}><MenuIcon /></IconButton>
          <img src="/ad-logo-white-new.svg" alt="Assured Digital" style={{ height: 28, width: "auto", objectFit: "contain", maxWidth: 200 }} />
        </Box>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
          sx={{ [`& .MuiDrawer-paper`]: { width: SIDEBAR_EXPANDED, background: "#0d1526", borderRight: "1px solid rgba(255,255,255,0.05)" } }}>
          {sidebarNav}
        </Drawer>
        <Box component="main" sx={{ flex: 1, overflow: "auto", bgcolor: "#f8fafc", p: "12px" }}><Suspense fallback={<LoadingState />}><Outlet /></Suspense></Box>
      </Box>
    )
  }

  // ── Desktop ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* Sidebar — full height, owns its own header row */}
      <Box sx={{
        width: sidebarWidth, flexShrink: 0,
        bgcolor: "#0d1526",
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

      {/* Right column: header + content */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <Box sx={{ height: HEADER_HEIGHT, flexShrink: 0, bgcolor: "#080f1e", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", px: "16px", gap: "8px" }}>
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
                  color: breadcrumbs.length > 0 ? "#a3b4c9" : "#e2e8f0",
                  fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                  {activePage.label}
                </Typography>
              </Box>
            ) : null}

            {/* Record reference — one or more segments after the nav label */}
            <RecordBreadcrumbTrail breadcrumbs={breadcrumbs} nav={nav} />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <IconButton size="small" sx={{ width: 36, height: 36, color: "#64748b", borderRadius: "8px", "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#cbd5e1" } }}><HelpOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
            <IconButton size="small" sx={{ width: 36, height: 36, color: "#64748b", borderRadius: "8px", "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#cbd5e1" } }}><NotificationsIcon sx={{ fontSize: 18 }} /></IconButton>
            <Box sx={{ width: 1, height: 22, bgcolor: "rgba(255,255,255,0.1)", mx: "10px" }} />
            <UserMenu initials={initials} email={currentUser?.email ?? ""} roleLabel={roleLabel} loggingOut={loggingOut} onLogout={onLogout} />
          </Box>
        </Box>

        {/* Page content */}
        <Box
          component="main"
          sx={{
            flex: 1, bgcolor: "#f8fafc",
            overflow: pageFullBleed ? "hidden" : "auto",
            p: pageFullBleed ? 0 : { xs: "12px", md: "20px" },
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