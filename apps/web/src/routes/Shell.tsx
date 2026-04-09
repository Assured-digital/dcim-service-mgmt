import React, { useState } from "react"
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
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import WorkIcon from "@mui/icons-material/Work"
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck"
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd"
import WorkspacesIcon from "@mui/icons-material/Workspaces"
import NotificationsIcon from "@mui/icons-material/Notifications"
import LogoutIcon from "@mui/icons-material/Logout"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import HelpOutlineIcon from "@mui/icons-material/HelpOutline"
import SupportAgentIcon from "@mui/icons-material/SupportAgent"
import EngineeringIcon from "@mui/icons-material/Engineering"
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"
import BusinessIcon from "@mui/icons-material/Business"
import { api, revokeAndLogout } from "../lib/api"
import { getCurrentUser } from "../lib/auth"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getSelectedClientId, setSelectedClientId } from "../lib/scope"

// ── Breadcrumb context ─────────────────────────────────────────────────────
// Detail pages call setRecordLabel(record.reference) to populate the top bar
// For deep hierarchies, call setBreadcrumbs([{label, path?}, ...]) instead
type Crumb = { label: string; path?: string; onClick?: () => void }
const BreadcrumbCtx = React.createContext<{
  setRecordLabel: (l: string | null) => void
  setBreadcrumbs: (crumbs: Crumb[]) => void
}>({ setRecordLabel: () => {}, setBreadcrumbs: () => {} })
export function useBreadcrumb() { return React.useContext(BreadcrumbCtx) }

// ── Constants ─────────────────────────────────────────────────────────────
const SIDEBAR_EXPANDED = 248
const SIDEBAR_COLLAPSED = 56
const HEADER_HEIGHT = 64
const ICON_SIZE = 20
const SCOPE_INDEPENDENT_PATHS = ["/my-work", "/overview"]

type NavItem = { label: string; path: string; icon: React.ReactNode; roles: string[] }
type NavSection = { title: string; icon?: React.ReactNode; items: NavItem[] }

const personalItems: NavItem[] = [
  { label: "My Work", path: "/my-work", icon: <AssignmentIndIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
  { label: "Overview", path: "/overview", icon: <WorkspacesIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] }
]

const clientSections: NavSection[] = [
  { title: "", items: [{ label: "Dashboard", path: "/dashboard", icon: <DashboardIcon sx={{ fontSize: ICON_SIZE }} />, roles: Object.values(ROLES) }] },
  {
    title: "Service Desk", icon: <SupportAgentIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Service Desk", path: "/service-desk", icon: <ConfirmationNumberIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Risk Management", path: "/risks", icon: <ReportProblemIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
      { label: "Issue Management", path: "/issues", icon: <WarningAmberIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] }
    ]
  },
  {
    title: "Operations", icon: <EngineeringIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Infrastructure", path: "/infrastructure", icon: <LocationOnIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
      { label: "Engineering Checks", path: "/checks", icon: <FactCheckIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Check Templates", path: "/check-templates", icon: <PlaylistAddCheckIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
      { label: "Service Scope", path: "/work-packages", icon: <WorkIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Tasks", path: "/tasks", icon: <TaskAltIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
    ]
  },
  {
    title: "Admin", icon: <AdminPanelSettingsIcon sx={{ fontSize: ICON_SIZE }} />, items: [
      { label: "Clients", path: "/clients", icon: <ApartmentIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES] },
      { label: "Users", path: "/users", icon: <ManageAccountsIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
      { label: "Audit Trail", path: "/audit", icon: <HistoryIcon sx={{ fontSize: ICON_SIZE }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] }
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
          mx: "4px", px: "8px", py: "7px", borderRadius: "6px", cursor: "pointer", mb: "1px",
          bgcolor: isOpen ? "rgba(255,255,255,0.06)" : hasActive ? "rgba(59,130,246,0.08)" : "transparent",
          "&:hover": { bgcolor: isOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)" },
          transition: "background-color 0.15s"
        }}>
          {icon ? (
            <Box sx={{ color: isOpen ? "#7db4f5" : hasActive ? "#7db4f5" : "#475569", display: "flex", flexShrink: 0, width: ICON_SIZE, transition: "color 0.15s" }}>
              {icon}
            </Box>
          ) : null}
          <FadeBox visible={expanded} maxW={160}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", ml: "12px", color: isOpen ? "#cbd5e1" : hasActive ? "#7db4f5" : "#64748b", transition: "color 0.15s" }}>
              {title}
            </Typography>
          </FadeBox>
          <Box sx={{
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
            width: expanded ? 16 : 0, height: 16, flexShrink: 0,
            opacity: expanded ? 1 : 0,
            transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
            color: isOpen ? "#475569" : "#334155",
            "& svg": { transition: "transform 0.2s ease" }
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Box>
        </Box>
      </Tooltip>
      <Collapse in={isOpen && expanded} timeout={180}>{children}</Collapse>
    </Box>
  )
}

// NavItem — same DOM always, text fades via CSS
function NavItem({ item, selected, onClick, expanded }: { item: NavItem; selected: boolean; onClick: () => void; expanded: boolean }) {
  return (
    <Tooltip title={!expanded ? item.label : ""} placement="right">
      <ListItemButton selected={selected} onClick={onClick} sx={{
        borderRadius: "6px", mb: "1px", py: "7px", px: "8px", minHeight: 0,
        color: "#94a3b8", justifyContent: "flex-start",
        "& .MuiListItemIcon-root": { color: "#475569", minWidth: 0, mr: expanded ? "12px" : 0, transition: "margin 0.22s cubic-bezier(0.4,0,0.2,1)" },
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

function UserMenu({ initials, email, roleLabel, loggingOut, onLogout }: {
  initials: string; email: string; roleLabel: string; loggingOut: boolean; onLogout: () => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Box onClick={() => setOpen(o => !o)} sx={{ display: "flex", alignItems: "center", gap: "8px", px: "8px", py: "4px", borderRadius: "6px", cursor: "pointer", "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
        <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "rgba(59,130,246,0.25)", color: "#7db4f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 500, flexShrink: 0 }}>{initials}</Box>
        <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>{email.split("@")[0]}</Typography>
        <Typography sx={{ fontSize: 10, color: "#475569" }}>▾</Typography>
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

  const canSwitchClients = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])
  const isScopeIndependent = SCOPE_INDEPENDENT_PATHS.some(p => loc.pathname.startsWith(p))

  const [selectedClientId, setSelectedClientIdState] = useState(getSelectedClientId() ?? "")
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(true)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbsState] = useState<Crumb[]>([])
  const [flyout, setFlyout] = useState<
    | { kind: "section"; title: string; items: NavItem[]; anchor: HTMLElement }
    | { kind: "client"; anchor: HTMLElement }
    | null
  >(null)

  const recordLabel = breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].label : null

  function setRecordLabel(l: string | null) {
    setBreadcrumbsState(l ? [{ label: l }] : [])
  }
  function setBreadcrumbs(crumbs: Crumb[]) {
    setBreadcrumbsState(crumbs)
  }

  // Auto-reset breadcrumbs whenever the route changes
  React.useEffect(() => { setBreadcrumbsState([]) }, [loc.pathname])

  const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED

  function toggleSection(title: string) { setOpenSection(prev => prev === title ? null : title) }

  React.useEffect(() => {
    const active = clientSections.find(s => s.title && s.items.some(item => item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path)))
    if (active?.title) setOpenSection(active.title)
  }, []) // eslint-disable-line

  const clients = useQuery({
    queryKey: ["clients"], enabled: canSwitchClients,
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>("/clients")).data
  })

  React.useEffect(() => {
    if (!canSwitchClients || (clients.data?.length ?? 0) === 0 || isScopeIndependent) return
    const stored = selectedClientId && clients.data?.some(c => c.id === selectedClientId) ? selectedClientId
      : currentUser?.clientId && clients.data?.some(c => c.id === currentUser.clientId) ? currentUser.clientId : ""
    if (stored && stored !== selectedClientId) { setSelectedClientIdState(stored); setSelectedClientId(stored); queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" }) }
  }, [clients.data]) // eslint-disable-line

  React.useEffect(() => {
    if (isScopeIndependent && canSwitchClients) { setSelectedClientIdState(""); setOpenSection(null); queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" }) }
    // Re-read stored scope when returning from scope-independent pages
    if (!isScopeIndependent && canSwitchClients && !selectedClientId) {
      const stored = getSelectedClientId()
      if (stored && clients.data?.some(c => c.id === stored)) {
        setSelectedClientIdState(stored)
        queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" })
      }
    }
  }, [loc.pathname]) // eslint-disable-line

  React.useEffect(() => {
    if (!openSection) return
    const section = clientSections.find(s => s.title === openSection)
    if (!section) return
    const stillInSection = section.items.some(item => item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path))
    if (!stillInSection) setOpenSection(null)
  }, [loc.pathname]) // eslint-disable-line

  const selectedClient = (clients.data ?? []).find(c => c.id === selectedClientId)

  function handleClientChange(clientId: string) {
    setSelectedClientIdState(clientId); setSelectedClientId(clientId || null)
    queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" })
    if (clientId) nav("/dashboard")
  }

  async function onLogout() { if (loggingOut) return; setLoggingOut(true); await revokeAndLogout(); setLoggingOut(false) }
  function navigateTo(path: string) { nav(path); setMobileOpen(false); setFlyout(null) }

  const initials = currentUser?.email ? currentUser.email.split("@")[0].slice(0, 2).toUpperCase() : "??"
  const roleLabel = currentUser?.role?.toLowerCase().replace(/_/g, " ") ?? ""
  const allNavItems = [...personalItems, ...clientSections.flatMap(s => s.items)]

  // Maps URL prefixes that don't match their nav item path to the correct nav item path
  // e.g. /service-requests/:id belongs to the "Service Desk" nav item at /service-desk
  const PATH_PARENT_MAP: Record<string, string> = {
    "/service-requests": "/service-desk",
    "/incidents": "/service-desk",
    "/sites": "/infrastructure",   // legacy /sites URLs resolve to Infrastructure nav item
    "/assets": "/infrastructure",  // legacy /assets URLs resolve to Infrastructure nav item
  }

  function resolveActivePage(pathname: string) {
    // Direct prefix match first
    const direct = allNavItems.find(i =>
      i.path === "/dashboard" ? pathname === "/dashboard" : i.path !== "/dashboard" && pathname.startsWith(i.path)
    )
    if (direct) return direct
    // Fallback: check parent map for routes whose URL prefix differs from their nav item
    const parentPath = Object.entries(PATH_PARENT_MAP).find(([prefix]) => pathname.startsWith(prefix))?.[1]
    return parentPath ? (allNavItems.find(i => i.path === parentPath) ?? null) : null
  }

  const activePage = resolveActivePage(loc.pathname)
  function sectionHasActive(section: NavSection) {
    return section.items.some(item =>
      item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path)
    ) || section.items.some(item =>
      Object.entries(PATH_PARENT_MAP).some(([prefix, parent]) => loc.pathname.startsWith(prefix) && parent === item.path)
    )
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
          width: 36, height: 36, flexShrink: 0, color: "#475569", borderRadius: "6px",
          "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#94a3b8" }
        }}>
          <MenuIcon sx={{ fontSize: 20 }} />
        </IconButton>
        {/* Logo — centred in the full sidebar width */}
        <FadeBox visible={sidebarExpanded} maxW={160}>
          <img src="/ad-logo-white-600x200-lrg.png" alt="Assured Digital" style={{ height: 22, width: "auto", objectFit: "contain", maxWidth: 140, display: "block" }} />
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

        <SbDivider />

        {/* Client scope */}
        {canSwitchClients ? (
          <Box sx={{ mx: "4px", mb: "4px" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "10px", px: "8px", pb: "6px" }}>
              <Tooltip title={!sidebarExpanded ? (selectedClient ? `Client: ${selectedClient.name}` : "Select client") : ""} placement="right">
                <Box
                  onClick={!sidebarExpanded ? e => { const t = e.currentTarget as HTMLElement; setFlyout(prev => prev?.kind === "client" ? null : { kind: "client", anchor: t }) } : undefined}
                  sx={{ flexShrink: 0, width: ICON_SIZE, height: ICON_SIZE, display: "flex", alignItems: "center", justifyContent: "center", cursor: !sidebarExpanded ? "pointer" : "default", color: selectedClientId ? "#7db4f5" : "#475569" }}
                >
                  <BusinessIcon sx={{ fontSize: ICON_SIZE }} />
                </Box>
              </Tooltip>
              <FadeBox visible={sidebarExpanded} maxW={160}>
                <Typography sx={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#475569", whiteSpace: "nowrap" }}>
                  Client scope
                </Typography>
              </FadeBox>
            </Box>
            <Box sx={{ maxHeight: sidebarExpanded ? 56 : 0, opacity: sidebarExpanded ? 1 : 0, overflow: "hidden", transition: "max-height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease" }}>
              <Select size="small" value={selectedClientId} onChange={e => handleClientChange(e.target.value)} displayEmpty IconComponent={KeyboardArrowDownIcon}
                sx={{ width: "100%", fontSize: 13, color: selectedClientId ? "#e2e8f0" : "#475569", bgcolor: "rgba(255,255,255,0.04)", borderRadius: "6px", border: selectedClientId ? "1px solid rgba(255,255,255,0.1)" : "1px dashed rgba(255,255,255,0.08)", "& .MuiOutlinedInput-notchedOutline": { border: "none" }, "& .MuiSvgIcon-root": { color: "#475569", fontSize: 16 }, "& .MuiSelect-select": { py: "7px", px: "10px" }, "&:hover": { bgcolor: "rgba(255,255,255,0.06)" } }}>
                <MenuItem value="" sx={{ fontSize: 13, color: "#94a3b8" }}>— Select client —</MenuItem>
                {(clients.data ?? []).map(c => <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>{c.name}</MenuItem>)}
              </Select>
            </Box>
            <SbDivider />
          </Box>
        ) : <SbDivider />}

        {/* Client-scoped sections */}
        {(!canSwitchClients || selectedClientId) ? (
          <>
            {clientSections.map(section => {
              const visible = section.items.filter(i => hasAnyRole(i.roles))
              if (visible.length === 0) return null

              // Root (Dashboard) — no header
              if (!section.title) {
                return visible.map(item => (
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
                      // Collapsed: flyout from the section icon
                      const target = e.currentTarget as HTMLElement
                      setFlyout(prev => prev?.kind === "section" && prev.title === section.title ? null : { kind: "section", title: section.title, items: visible, anchor: target })
                      return
                    }
                    toggleSection(section.title)
                  }}
                >
                  <List dense disablePadding sx={{ px: 1, pt: "2px", pb: "4px" }}>
                    {visible.map(item => (
                      <NavItem key={item.path} item={item}
                        selected={item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path)}
                        onClick={() => navigateTo(item.path)} expanded={sidebarExpanded} />
                    ))}
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
          <img src="/ad-logo-white-600x200-lrg.png" alt="Assured Digital" style={{ height: 24, width: "auto", objectFit: "contain" }} />
        </Box>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
          sx={{ [`& .MuiDrawer-paper`]: { width: SIDEBAR_EXPANDED, background: "#0d1526", borderRight: "1px solid rgba(255,255,255,0.05)" } }}>
          {sidebarNav}
        </Drawer>
        <Box component="main" sx={{ flex: 1, overflow: "auto", bgcolor: "#f8fafc", p: "12px" }}><Outlet /></Box>
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
        <ClientFlyout anchorEl={flyout.anchor} clients={clients.data ?? []} selectedClientId={selectedClientId} onSelect={id => { handleClientChange(id); setFlyout(null) }} onClose={() => setFlyout(null)} />
      ) : null}

      {/* Right column: header + content */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top bar */}
        <Box sx={{ height: HEADER_HEIGHT, flexShrink: 0, bgcolor: "#080f1e", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", px: "20px", gap: "8px" }}>
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>

            {/* Client badge — clickable, navigates to dashboard */}
            {selectedClient && !isScopeIndependent ? (
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
            ) : isScopeIndependent ? (
              <Box sx={{ px: "12px", py: "6px", bgcolor: "rgba(255,255,255,0.05)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>All clients</Typography>
              </Box>
            ) : null}

            {/* › separator */}
            {activePage && (selectedClient || isScopeIndependent) ? (
              <Typography sx={{ color: "#334155", fontSize: 16, lineHeight: 1, userSelect: "none", flexShrink: 0, mx: "2px" }}>›</Typography>
            ) : null}

            {/* Page name — clickable, navigates to the list page */}
            {activePage ? (
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
                  fontSize: 15,
                  color: breadcrumbs.length > 0 ? "#8ba3c0" : "#cbd5e1",
                  fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                  {activePage.label}
                </Typography>
              </Box>
            ) : null}

            {/* Record reference — one or more segments after the nav label */}
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1
              const isClickable = !isLast && (crumb.path || crumb.onClick)
              return (
                <React.Fragment key={idx}>
                  <Typography sx={{ color: "#334155", fontSize: 16, lineHeight: 1, userSelect: "none", flexShrink: 0, mx: "2px" }}>›</Typography>
                  {isClickable ? (
                    <Box
                      onClick={() => crumb.onClick ? crumb.onClick() : nav(crumb.path!)}
                      sx={{
                        px: "8px", py: "5px", borderRadius: "6px",
                        cursor: "pointer", flexShrink: 1, minWidth: 0,
                        transition: "background-color 0.12s",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.08)" }
                      }}>
                      <Typography sx={{ fontSize: 15, color: "#8ba3c0", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {crumb.label}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 15, color: isLast ? "#e2e8f0" : "#8ba3c0", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1, px: "4px" }}>
                      {crumb.label}
                    </Typography>
                  )}
                </React.Fragment>
              )
            })}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <IconButton size="small" sx={{ width: 36, height: 36, color: "#475569", borderRadius: "8px", "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#94a3b8" } }}><HelpOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
            <IconButton size="small" sx={{ width: 36, height: 36, color: "#475569", borderRadius: "8px", "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#94a3b8" } }}><NotificationsIcon sx={{ fontSize: 18 }} /></IconButton>
            <Box sx={{ width: 1, height: 22, bgcolor: "rgba(255,255,255,0.1)", mx: "10px" }} />
            <UserMenu initials={initials} email={currentUser?.email ?? ""} roleLabel={roleLabel} loggingOut={loggingOut} onLogout={onLogout} />
          </Box>
        </Box>

        {/* Page content */}
        <Box component="main" sx={{ flex: 1, overflow: "auto", bgcolor: "#f8fafc", p: { xs: "12px", md: "24px" } }}>
          <BreadcrumbCtx.Provider value={{ setRecordLabel, setBreadcrumbs }}>
            <Outlet />
          </BreadcrumbCtx.Provider>
        </Box>
      </Box>
    </Box>
  )
}