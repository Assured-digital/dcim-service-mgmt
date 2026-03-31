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
import StorageIcon from "@mui/icons-material/Storage"
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

// ── Constants ─────────────────────────────────────────────────────────────
const SIDEBAR_EXPANDED = 248
const SIDEBAR_COLLAPSED = 52
const HEADER_HEIGHT = 56
const SCOPE_INDEPENDENT_PATHS = ["/my-work", "/overview"]

// ── Types ─────────────────────────────────────────────────────────────────
type NavItem = { label: string; path: string; icon: React.ReactNode; roles: string[] }
type NavSection = { title: string; icon?: React.ReactNode; items: NavItem[] }

// ── Nav data ──────────────────────────────────────────────────────────────
const personalItems: NavItem[] = [
  {
    label: "My Work", path: "/my-work",
    icon: <AssignmentIndIcon sx={{ fontSize: 18 }} />,
    roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER]
  },
  {
    label: "Overview", path: "/overview",
    icon: <WorkspacesIcon sx={{ fontSize: 18 }} />,
    roles: [...ORG_SUPER_ROLES]
  }
]

const clientSections: NavSection[] = [
  {
    title: "", items: [{
      label: "Dashboard", path: "/dashboard",
      icon: <DashboardIcon sx={{ fontSize: 18 }} />,
      roles: Object.values(ROLES)
    }]
  },
  {
    title: "Service Desk",
    icon: <SupportAgentIcon sx={{ fontSize: 18 }} />,
    items: [
      { label: "Service Desk", path: "/service-desk", icon: <ConfirmationNumberIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Risks & Issues", path: "/risks", icon: <ReportProblemIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] }
    ]
  },
  {
    title: "Operations",
    icon: <EngineeringIcon sx={{ fontSize: 18 }} />,
    items: [
      { label: "Sites", path: "/sites", icon: <LocationOnIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] },
      { label: "Engineering Checks", path: "/checks", icon: <FactCheckIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Check Templates", path: "/check-templates", icon: <PlaylistAddCheckIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
      { label: "Service Scope", path: "/work-packages", icon: <WorkIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Tasks", path: "/tasks", icon: <TaskAltIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER] },
      { label: "Assets", path: "/assets", icon: <StorageIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER, ROLES.CLIENT_VIEWER] }
    ]
  },
  {
    title: "Admin",
    icon: <AdminPanelSettingsIcon sx={{ fontSize: 18 }} />,
    items: [
      { label: "Clients", path: "/clients", icon: <ApartmentIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES] },
      { label: "Users", path: "/users", icon: <ManageAccountsIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
      { label: "Audit Trail", path: "/audit", icon: <HistoryIcon sx={{ fontSize: 18 }} />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] }
    ]
  }
]

// ── Shared nav styles ──────────────────────────────────────────────────────
const navItemSx = {
  borderRadius: "6px", mb: "1px", py: "7px", px: "10px", minHeight: 0,
  color: "#94a3b8",
  "& .MuiListItemIcon-root": { color: "#475569", minWidth: 30 },
  "&.Mui-selected": {
    bgcolor: "rgba(59,130,246,0.15)", color: "#e2e8f0",
    "& .MuiListItemIcon-root": { color: "#7db4f5" }
  },
  "&.Mui-selected:hover": { bgcolor: "rgba(59,130,246,0.22)" },
  "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#cbd5e1" }
}
const navTextProps = { fontSize: 13.5, fontWeight: 400, lineHeight: 1.3 }

// ── Sub-components ────────────────────────────────────────────────────────
function SbDivider() {
  return <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mx: 2, my: 1 }} />
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
        minWidth: 200, py: "6px", overflow: "hidden"
      }}>
        <Typography sx={{
          fontSize: 10, fontWeight: 500, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "#475569", px: "12px", pt: "4px", pb: "6px"
        }}>
          {title}
        </Typography>
        <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mb: "4px" }} />
        {items.map(item => {
          const isActive = item.path === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.path)
          return (
            <Box key={item.path} onClick={() => { onNavigate(item.path); onClose() }} sx={{
              display: "flex", alignItems: "center", gap: "10px",
              px: "12px", py: "8px", cursor: "pointer",
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
        minWidth: 200, py: "6px", overflow: "hidden"
      }}>
        <Typography sx={{
          fontSize: 10, fontWeight: 500, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "#475569", px: "12px", pt: "4px", pb: "6px"
        }}>
          Client scope
        </Typography>
        <Box sx={{ height: "1px", bgcolor: "rgba(255,255,255,0.06)", mb: "4px" }} />
        {clients.map(c => {
          const isSelected = selectedClientId === c.id
          return (
            <Box key={c.id} onClick={() => { onSelect(c.id); onClose() }} sx={{
              display: "flex", alignItems: "center", gap: "10px",
              px: "12px", py: "8px", cursor: "pointer",
              bgcolor: isSelected ? "rgba(59,130,246,0.15)" : "transparent",
              color: isSelected ? "#e2e8f0" : "#94a3b8",
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#cbd5e1" }
            }}>
              <BusinessIcon sx={{ fontSize: 16, color: isSelected ? "#7db4f5" : "#475569" }} />
              <Typography sx={{ fontSize: 13.5, fontWeight: isSelected ? 500 : 400, flex: 1 }}>
                {c.name}
              </Typography>
              {isSelected ? (
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#22c55e", flexShrink: 0 }} />
              ) : null}
            </Box>
          )
        })}
      </Box>
    </>
  )
}

function CollapsibleSection({ title, icon, isOpen, hasActive, onToggle, children }: {
  title: string; icon?: React.ReactNode; isOpen: boolean
  hasActive: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <Box>
      <Box onClick={onToggle} sx={{
        display: "flex", alignItems: "center",
        mx: "8px", px: "10px", py: "7px",
        borderRadius: "6px", cursor: "pointer", mb: "1px",
        bgcolor: isOpen ? "rgba(255,255,255,0.06)" : hasActive ? "rgba(59,130,246,0.08)" : "transparent",
        "&:hover": { bgcolor: isOpen ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)" },
        transition: "background-color 0.15s"
      }}>
        {/* Icon — same position as nav item icons */}
        {icon ? (
          <Box sx={{
            color: isOpen ? "#7db4f5" : hasActive ? "#7db4f5" : "#475569",
            display: "flex", flexShrink: 0, mr: "12px", width: 18,
            transition: "color 0.15s"
          }}>
            {icon}
          </Box>
        ) : null}
        <Typography sx={{
          fontSize: 13.5, fontWeight: 500, flex: 1,
          color: isOpen ? "#cbd5e1" : hasActive ? "#7db4f5" : "#64748b",
          transition: "color 0.15s"
        }}>
          {title}
        </Typography>
        <Box sx={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 16, height: 16, flexShrink: 0,
          transition: "transform 0.2s ease",
          transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
          color: isOpen ? "#475569" : "#334155"
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Box>
      </Box>
      <Collapse in={isOpen} timeout={180}>{children}</Collapse>
    </Box>
  )
}

function UserMenu({ initials, email, roleLabel, loggingOut, onLogout }: {
  initials: string; email: string; roleLabel: string; loggingOut: boolean; onLogout: () => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{
          display: "flex", alignItems: "center", gap: "8px",
          px: "8px", py: "4px", borderRadius: "6px", cursor: "pointer",
          "&:hover": { bgcolor: "rgba(255,255,255,0.06)" }
        }}
      >
        <Box sx={{
          width: 28, height: 28, borderRadius: "50%",
          bgcolor: "rgba(59,130,246,0.25)", color: "#7db4f5",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 500, flexShrink: 0
        }}>
          {initials}
        </Box>
        <Typography sx={{ fontSize: 12.5, color: "#94a3b8" }}>{email.split("@")[0]}</Typography>
        <Typography sx={{ fontSize: 9, color: "#475569" }}>▾</Typography>
      </Box>
      {open ? (
        <>
          <Box sx={{
            position: "fixed", top: HEADER_HEIGHT + 4, right: 12, zIndex: 1400,
            bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(15,23,42,0.10)", minWidth: 200, py: "4px"
          }}>
            <Box sx={{ px: "12px", py: "8px", borderBottom: "1px solid #f1f5f9" }}>
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{email}</Typography>
              <Typography sx={{ fontSize: 11, color: "#94a3b8", textTransform: "capitalize", mt: "2px" }}>
                {roleLabel}
              </Typography>
            </Box>
            <Box onClick={() => { setOpen(false); onLogout() }} sx={{
              display: "flex", alignItems: "center", gap: "10px",
              px: "12px", py: "9px", cursor: "pointer", color: "#64748b",
              "&:hover": { bgcolor: "#f8fafc", color: "#0f172a" }
            }}>
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
  const [flyout, setFlyout] = useState<
    | { kind: "section"; title: string; items: NavItem[]; anchor: HTMLElement }
    | { kind: "client"; anchor: HTMLElement }
    | null
  >(null)

  const sidebarWidth = sidebarExpanded ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED

  function toggleSection(title: string) {
    setOpenSection(prev => prev === title ? null : title)
  }

  // Auto-open section for active route on load
  React.useEffect(() => {
    const active = clientSections.find(s =>
      s.title && s.items.some(item =>
        item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path)
      )
    )
    if (active?.title) setOpenSection(active.title)
  }, []) // eslint-disable-line

  const clients = useQuery({
    queryKey: ["clients"],
    enabled: canSwitchClients,
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>("/clients")).data
  })

  React.useEffect(() => {
    if (!canSwitchClients || (clients.data?.length ?? 0) === 0 || isScopeIndependent) return
    const stored = selectedClientId && clients.data?.some(c => c.id === selectedClientId)
      ? selectedClientId
      : currentUser?.clientId && clients.data?.some(c => c.id === currentUser.clientId)
        ? currentUser.clientId : ""
    if (stored && stored !== selectedClientId) {
      setSelectedClientIdState(stored)
      setSelectedClientId(stored)
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" })
    }
  }, [clients.data]) // eslint-disable-line

  React.useEffect(() => {
    if (isScopeIndependent && canSwitchClients) {
      setSelectedClientIdState("")
      setSelectedClientId(null)
      setOpenSection(null)
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" })
    }
  }, [loc.pathname]) // eslint-disable-line

  // Close open section when navigating to a page outside it
  React.useEffect(() => {
    if (!openSection) return
    const section = clientSections.find(s => s.title === openSection)
    if (!section) return
    const stillInSection = section.items.some(item =>
      item.path === "/dashboard"
        ? loc.pathname === "/dashboard"
        : loc.pathname.startsWith(item.path)
    )
    if (!stillInSection) setOpenSection(null)
  }, [loc.pathname]) // eslint-disable-line

  const selectedClient = (clients.data ?? []).find(c => c.id === selectedClientId)

  function handleClientChange(clientId: string) {
    setSelectedClientIdState(clientId)
    setSelectedClientId(clientId || null)
    queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" })
    if (clientId) nav("/dashboard")
  }

  async function onLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    await revokeAndLogout()
    setLoggingOut(false)
  }

  function navigateTo(path: string) {
    nav(path)
    setMobileOpen(false)
    setFlyout(null)
  }

  const initials = currentUser?.email ? currentUser.email.split("@")[0].slice(0, 2).toUpperCase() : "??"
  const roleLabel = currentUser?.role?.toLowerCase().replace(/_/g, " ") ?? ""

  const allNavItems = [...personalItems, ...clientSections.flatMap(s => s.items)]
  const activePage = allNavItems.find(i =>
    i.path === "/dashboard" ? loc.pathname === "/dashboard"
      : i.path !== "/dashboard" && loc.pathname.startsWith(i.path)
  )

  function sectionHasActive(section: NavSection) {
    return section.items.some(item =>
      item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path)
    )
  }

  // ── Sidebar nav ───────────────────────────────────────────────────────
  const sidebarNav = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Box sx={{ flex: 1, overflow: "auto", py: 1 }}>

        {/* Personal items */}
        {personalItems.some(i => hasAnyRole(i.roles)) ? (
          <List dense disablePadding sx={{ px: 1, mt: 1 }}>
            {personalItems.filter(i => hasAnyRole(i.roles)).map(item => (
              sidebarExpanded ? (
                <ListItemButton key={item.path} selected={loc.pathname === item.path}
                  onClick={() => navigateTo(item.path)} sx={navItemSx}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={navTextProps} />
                </ListItemButton>
              ) : (
                <Tooltip key={item.path} title={item.label} placement="right">
                  <ListItemButton selected={loc.pathname === item.path}
                    onClick={() => navigateTo(item.path)}
                    sx={{ ...navItemSx, justifyContent: "center", px: 0 }}>
                    <ListItemIcon sx={{ minWidth: 0, justifyContent: "center" }}>{item.icon}</ListItemIcon>
                  </ListItemButton>
                </Tooltip>
              )
            ))}
          </List>
        ) : null}

        <SbDivider />

        {/* Client context */}
        {canSwitchClients && sidebarExpanded ? (
          <Box sx={{ mx: "8px", mb: "8px" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "10px", px: "10px", pb: "6px" }}>
              <BusinessIcon sx={{ fontSize: 18, color: "#475569", flexShrink: 0 }} />
              <Typography sx={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase", color: "#475569" }}>
                Client scope
              </Typography>
            </Box>
            <Select size="small" value={selectedClientId} onChange={e => handleClientChange(e.target.value)}
              displayEmpty IconComponent={KeyboardArrowDownIcon}
              sx={{
                width: "100%", fontSize: 13, fontWeight: 400,
                color: selectedClientId ? "#e2e8f0" : "#475569",
                bgcolor: "rgba(255,255,255,0.04)", borderRadius: "6px",
                border: selectedClientId ? "1px solid rgba(255,255,255,0.1)" : "1px dashed rgba(255,255,255,0.08)",
                "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                "& .MuiSvgIcon-root": { color: "#475569", fontSize: 16 },
                "& .MuiSelect-select": { py: "7px", px: "10px" },
                "&:hover": { bgcolor: "rgba(255,255,255,0.06)" }
              }}>
              <MenuItem value="" sx={{ fontSize: 13, color: "#94a3b8" }}>— Select client —</MenuItem>
              {(clients.data ?? []).map(c => (
                <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>{c.name}</MenuItem>
              ))}
            </Select>
            <SbDivider />
          </Box>
        ) : canSwitchClients && !sidebarExpanded ? (
          <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
            <Tooltip title={selectedClient ? `Client: ${selectedClient.name}` : "Select client"} placement="right">
              <Box
                onClick={e => {
                  const target = e.currentTarget as HTMLElement
                  setFlyout(prev => prev?.kind === "client" ? null : { kind: "client", anchor: target })
                }}
                sx={{
                  width: 32, height: 32, borderRadius: "6px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  bgcolor: flyout?.kind === "client"
                    ? "rgba(255,255,255,0.1)"
                    : selectedClientId ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
                  color: selectedClientId ? "#7db4f5" : "#475569",
                  "&:hover": { bgcolor: "rgba(255,255,255,0.08)" }
                }}>
                <BusinessIcon sx={{ fontSize: 18 }} />
              </Box>
            </Tooltip>
          </Box>
        ) : <SbDivider />}

        {/* Client-scoped nav */}
        {(!canSwitchClients || selectedClientId) ? (
          <>
            {clientSections.map(section => {
              const visible = section.items.filter(i => hasAnyRole(i.roles))
              if (visible.length === 0) return null

              // Root section (Dashboard) — no collapsible header
              if (!section.title) {
                return visible.map(item => (
                  sidebarExpanded ? (
                    <List key={item.path} dense disablePadding sx={{ px: 1, pt: 0.5 }}>
                      <ListItemButton selected={loc.pathname === "/dashboard"}
                        onClick={() => navigateTo(item.path)} sx={navItemSx}>
                        <ListItemIcon>{item.icon}</ListItemIcon>
                        <ListItemText primary={item.label} primaryTypographyProps={navTextProps} />
                      </ListItemButton>
                    </List>
                  ) : (
                    <List key={item.path} dense disablePadding sx={{ px: 1, pt: 0.5 }}>
                      <Tooltip title={item.label} placement="right">
                        <ListItemButton selected={loc.pathname === "/dashboard"}
                          onClick={() => navigateTo(item.path)}
                          sx={{ ...navItemSx, justifyContent: "center", px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 0, justifyContent: "center" }}>{item.icon}</ListItemIcon>
                        </ListItemButton>
                      </Tooltip>
                    </List>
                  )
                ))
              }

              const isOpen = openSection === section.title
              const hasActive = sectionHasActive(section)

              // Expanded — collapsible section with icon
              if (sidebarExpanded) {
                return (
                  <CollapsibleSection key={section.title} title={section.title} icon={section.icon}
                    isOpen={isOpen} hasActive={hasActive} onToggle={() => toggleSection(section.title)}>
                    <List dense disablePadding sx={{ px: 1, pt: 0.25, pb: 0.5 }}>
                      {visible.map(item => (
                        <ListItemButton key={item.path}
                          selected={item.path === "/dashboard" ? loc.pathname === "/dashboard" : loc.pathname.startsWith(item.path)}
                          onClick={() => navigateTo(item.path)}
                          sx={navItemSx}>
                          <ListItemIcon>{item.icon}</ListItemIcon>
                          <ListItemText primary={item.label} primaryTypographyProps={navTextProps} />
                        </ListItemButton>
                      ))}
                    </List>
                  </CollapsibleSection>
                )
              }

              // Collapsed — icon only, opens flyout
              return (
                <Box key={section.title} sx={{ display: "flex", justifyContent: "center", px: 1, mb: "1px" }}>
                  <Tooltip title={section.title} placement="right">
                    <Box
                      onClick={e => {
                        const target = e.currentTarget as HTMLElement
                        setFlyout(prev =>
                          prev?.kind === "section" && prev.title === section.title
                            ? null
                            : { kind: "section", title: section.title, items: visible, anchor: target }
                        )
                      }}
                      sx={{
                        width: 32, height: 32, borderRadius: "6px", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        bgcolor: flyout?.kind === "section" && flyout.title === section.title
                          ? "rgba(255,255,255,0.1)"
                          : hasActive ? "rgba(59,130,246,0.15)" : "transparent",
                        color: hasActive ? "#7db4f5" : "#475569",
                        "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#94a3b8" }
                      }}>
                      {section.icon}
                    </Box>
                  </Tooltip>
                </Box>
              )
            })}
          </>
        ) : !sidebarExpanded ? null : (
          <Box sx={{ px: "16px", py: "12px" }}>
            <Typography sx={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>
              Select a client above to view their service data.
            </Typography>
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
          <IconButton onClick={() => setMobileOpen(true)} sx={{ color: "#94a3b8" }}>
            <MenuIcon />
          </IconButton>
          <img src="/ad-logo-white-600x200-lrg.png" alt="Assured Digital" style={{ height: 24, width: "auto", objectFit: "contain" }} />
        </Box>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
          sx={{ [`& .MuiDrawer-paper`]: { width: SIDEBAR_EXPANDED, background: "#0d1526", borderRight: "1px solid rgba(255,255,255,0.05)" } }}>
          {sidebarNav}
        </Drawer>
        <Box component="main" sx={{ flex: 1, overflow: "auto", bgcolor: "#f8fafc", p: "12px" }}>
          <Outlet />
        </Box>
      </Box>
    )
  }

  // ── Desktop ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* Persistent header row */}
      <Box sx={{ display: "flex", height: HEADER_HEIGHT, flexShrink: 0 }}>

        {/* Logo area — always SIDEBAR_EXPANDED wide, darker navy */}
        <Box sx={{
          width: SIDEBAR_EXPANDED, flexShrink: 0,
          bgcolor: "#080f1e",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center",
          px: "8px", gap: 0
        }}>
          {/* Logo — left aligned with comfortable indent */}
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", pl: "8px" }}>
            <img
              src="/ad-logo-white-600x200-lrg.png"
              alt="Assured Digital"
              style={{ height: 26, width: "auto", objectFit: "contain", maxWidth: 150 }}
            />
          </Box>
          {/* Hamburger */}
          <IconButton size="small" onClick={() => setSidebarExpanded(e => !e)}
            sx={{
              width: 32, height: 32, flexShrink: 0,
              color: "#475569", borderRadius: "6px",
              "&:hover": { bgcolor: "rgba(255,255,255,0.08)", color: "#94a3b8" }
            }}>
            <MenuIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>

        {/* Top bar — unified dark */}
        <Box sx={{
          flex: 1, minWidth: 0, bgcolor: "#080f1e",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", px: "20px", gap: "8px"
        }}>
          {/* Left: scope badge + page name */}
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            {selectedClient && !isScopeIndependent ? (
              <Box sx={{
                display: "flex", alignItems: "center", gap: "6px",
                px: "10px", py: "4px", bgcolor: "rgba(255,255,255,0.08)",
                borderRadius: "6px", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0
              }}>
                <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#22c55e", flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: "#e2e8f0" }}>
                  {selectedClient.name}
                </Typography>
              </Box>
            ) : isScopeIndependent ? (
              <Box sx={{
                px: "10px", py: "4px", bgcolor: "rgba(255,255,255,0.05)",
                borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", flexShrink: 0
              }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: "#64748b" }}>
                  All clients
                </Typography>
              </Box>
            ) : null}
            {activePage ? (
              <Typography sx={{
                fontSize: 13, color: "#e2e8f0", fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {activePage.label}
              </Typography>
            ) : null}
          </Box>

          {/* Right: icons + user */}
          <Box sx={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
            <IconButton size="small" sx={{
              width: 32, height: 32, color: "#475569", borderRadius: "6px",
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#94a3b8" }
            }}>
              <HelpOutlineIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" sx={{
              width: 32, height: 32, color: "#475569", borderRadius: "6px",
              "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#94a3b8" }
            }}>
              <NotificationsIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Box sx={{ width: 1, height: 20, bgcolor: "rgba(255,255,255,0.1)", mx: "8px" }} />
            <UserMenu
              initials={initials}
              email={currentUser?.email ?? ""}
              roleLabel={roleLabel}
              loggingOut={loggingOut}
              onLogout={onLogout}
            />
          </Box>
        </Box>
      </Box>

      {/* Main row */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Sidebar */}
        <Box sx={{
          width: sidebarWidth, flexShrink: 0,
          bgcolor: "#0d1526",
          borderRight: "1px solid rgba(255,255,255,0.05)",
          overflow: "hidden",
          transition: "width 0.2s ease"
        }}>
          {sidebarNav}
        </Box>

        {/* Flyouts */}
        {flyout?.kind === "section" && !sidebarExpanded ? (
          <SectionFlyout
            title={flyout.title}
            items={flyout.items}
            anchorEl={flyout.anchor}
            onClose={() => setFlyout(null)}
            onNavigate={navigateTo}
            pathname={loc.pathname}
          />
        ) : null}

        {flyout?.kind === "client" && !sidebarExpanded ? (
          <ClientFlyout
            anchorEl={flyout.anchor}
            clients={clients.data ?? []}
            selectedClientId={selectedClientId}
            onSelect={id => { handleClientChange(id); setFlyout(null) }}
            onClose={() => setFlyout(null)}
          />
        ) : null}

        {/* Page content */}
        <Box component="main" sx={{
          flex: 1, overflow: "auto", bgcolor: "#f8fafc",
          p: { xs: "12px", md: "24px" }
        }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  )
}