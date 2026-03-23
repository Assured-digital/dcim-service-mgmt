import React, { useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AppBar, Box, Button, Collapse, Drawer, IconButton, List,
  ListItemButton, ListItemIcon, ListItemText, MenuItem,
  TextField, Toolbar, Typography, useMediaQuery, useTheme
} from "@mui/material"
import MenuIcon from "@mui/icons-material/Menu"
import DashboardIcon from "@mui/icons-material/Dashboard"
import InboxIcon from "@mui/icons-material/Inbox"
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import TaskAltIcon from "@mui/icons-material/TaskAlt"
import StorageIcon from "@mui/icons-material/Storage"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts"
import ApartmentIcon from "@mui/icons-material/Apartment"
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline"
import HistoryIcon from "@mui/icons-material/History"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import ReportProblemIcon from "@mui/icons-material/ReportProblem"
import WorkIcon from "@mui/icons-material/Work"
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import { api, revokeAndLogout } from "../lib/api"
import { getCurrentUser } from "../lib/auth"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getSelectedClientId, setSelectedClientId } from "../lib/scope"

const drawerWidth = 260

type NavItem = {
  label: string
  path: string
  icon: React.ReactNode
  roles: string[]
}

type NavSection = {
  title: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    title: "Work",
    items: [
      { label: "Dashboard", path: "/", icon: <DashboardIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Raise request", path: "/raise-request", icon: <AddCircleOutlineIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Triage", path: "/triage", icon: <InboxIcon fontSize="small" />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Service requests", path: "/service-requests", icon: <ConfirmationNumberIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Incidents", path: "/incidents", icon: <WarningAmberIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Changes", path: "/changes", icon: <SwapHorizIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Tasks", path: "/tasks", icon: <TaskAltIcon fontSize="small" />, roles: Object.values(ROLES) },
    ]
  },
  {
    title: "Operations",
    items: [
      { label: "Assets", path: "/assets", icon: <StorageIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Sites", path: "/sites", icon: <LocationOnIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Surveys & audits", path: "/surveys", icon: <FactCheckIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Risks", path: "/risks", icon: <ReportProblemIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Issues", path: "/issues", icon: <WarningAmberIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Work packages", path: "/work-packages", icon: <WorkIcon fontSize="small" />, roles: Object.values(ROLES) },
    ]
  },
  {
    title: "Admin",
    items: [
      { label: "Clients", path: "/clients", icon: <ApartmentIcon fontSize="small" />, roles: [...ORG_SUPER_ROLES] },
      { label: "Users", path: "/users", icon: <ManageAccountsIcon fontSize="small" />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] },
      { label: "Audit trail", path: "/audit", icon: <HistoryIcon fontSize="small" />, roles: Object.values(ROLES) },
    ]
  }
]

export default function Shell() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down("md"))
  const nav = useNavigate()
  const loc = useLocation()
  const isOrgSuper = hasAnyRole([...ORG_SUPER_ROLES])
  const queryClient = useQueryClient()
  const [selectedClientId, setSelectedClientIdState] = useState(getSelectedClientId() ?? "")
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const currentUser = getCurrentUser()

  const clients = useQuery({
    queryKey: ["clients"],
    enabled: isOrgSuper,
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>("/clients")).data
  })

  React.useEffect(() => {
    if (!isOrgSuper) return
    if ((clients.data?.length ?? 0) === 0) return
    const selected =
      selectedClientId && clients.data?.some((c) => c.id === selectedClientId)
        ? selectedClientId
        : currentUser?.clientId && clients.data?.some((c) => c.id === currentUser.clientId)
          ? currentUser.clientId
          : clients.data?.[0]?.id ?? ""
    if (selected && selected !== selectedClientId) {
      setSelectedClientIdState(selected)
      setSelectedClientId(selected)
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "clients" })
    }
  }, [clients.data, currentUser?.clientId, isOrgSuper, queryClient, selectedClientId])

  async function onLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    await revokeAndLogout()
    setLoggingOut(false)
  }

  function navigateTo(path: string) {
    nav(path)
    setMobileOpen(false)
  }

  function toggleSection(title: string) {
    setCollapsed((prev) => ({ ...prev, [title]: !prev[title] }))
  }

  // Find active page label for topbar
  const activeLabel = sections
    .flatMap((s) => s.items)
    .find((i) => i.path === loc.pathname)?.label ?? "Workspace"

  const navContent = (
    <>
      <Toolbar sx={{ minHeight: 60 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700, lineHeight: 1.2 }}>
            DC Service Mgmt
          </Typography>
          <Typography variant="caption" sx={{ color: "#93c5fd", fontSize: 10 }}>
            Control Center
          </Typography>
        </Box>
      </Toolbar>

      <Box sx={{ overflow: "auto", pb: 2 }}>
        {sections.map((section) => {
          const visibleItems = section.items.filter((item) => hasAnyRole(item.roles))
          if (visibleItems.length === 0) return null
          const isCollapsed = collapsed[section.title] ?? false

          return (
            <Box key={section.title}>
              <Box
                onClick={() => toggleSection(section.title)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 2.5,
                  pt: 2,
                  pb: 0.5,
                  cursor: "pointer"
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: "#64748b",
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase"
                  }}
                >
                  {section.title}
                </Typography>
                {isCollapsed
                  ? <ExpandMoreIcon sx={{ fontSize: 14, color: "#64748b" }} />
                  : <ExpandLessIcon sx={{ fontSize: 14, color: "#64748b" }} />
                }
              </Box>

              <Collapse in={!isCollapsed}>
                <List dense sx={{ px: 1, py: 0 }}>
                  {visibleItems.map((item) => (
                    <ListItemButton
                      key={item.path}
                      selected={loc.pathname === item.path}
                      onClick={() => navigateTo(item.path)}
                      sx={{
                        borderRadius: 1.5,
                        mb: 0.25,
                        py: 0.6,
                        color: "#cbd5e1",
                        "& .MuiListItemIcon-root": { color: "#64748b", minWidth: 30 },
                        "&.Mui-selected": {
                          bgcolor: "rgba(59,130,246,0.18)",
                          color: "#ffffff",
                          "& .MuiListItemIcon-root": { color: "#93c5fd" }
                        },
                        "&.Mui-selected:hover": { bgcolor: "rgba(59,130,246,0.26)" },
                        "&:hover": { bgcolor: "rgba(255,255,255,0.05)" }
                      }}
                    >
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Box>
          )
        })}
      </Box>
    </>
  )

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: "1px solid #dbe4f1",
          bgcolor: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)"
        }}
      >
        <Toolbar sx={{ minHeight: 60 }}>
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography variant="subtitle1" noWrap sx={{ flexGrow: 1, color: "#1e293b", fontWeight: 600 }}>
            {activeLabel}
          </Typography>
          {isOrgSuper ? (
            <TextField
              select
              size="small"
              label="Client scope"
              value={selectedClientId}
              onChange={(e) => {
                const value = e.target.value
                setSelectedClientIdState(value)
                setSelectedClientId(value || null)
                queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "clients" })
              }}
              sx={{ minWidth: 220, mr: 1.5 }}
            >
              {(clients.data ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          ) : null}
          <Button variant="outlined" size="small" color="inherit" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Logout"}
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: "border-box",
            background: "linear-gradient(180deg, #0b1220 0%, #0f1b32 100%)",
            color: "#dbe7ff",
            borderRight: "1px solid rgba(255,255,255,0.06)"
          }
        }}
      >
        {navContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 1.5, md: 3 } }}>
        <Toolbar sx={{ minHeight: 60 }} />
        <Outlet />
      </Box>
    </Box>
  )
}