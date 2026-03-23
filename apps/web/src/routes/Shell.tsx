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
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import { api, revokeAndLogout } from "../lib/api"
import { getCurrentUser } from "../lib/auth"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getSelectedClientId, setSelectedClientId } from "../lib/scope"

const drawerWidth = 220

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
    title: "",
    items: [
      { label: "Dashboard", path: "/", icon: <DashboardIcon fontSize="small" />, roles: Object.values(ROLES) },
    ]
  },
  {
    title: "Service desk",
    items: [
      { label: "Service requests", path: "/service-requests", icon: <ConfirmationNumberIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Incidents", path: "/incidents", icon: <WarningAmberIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Changes", path: "/changes", icon: <SwapHorizIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Triage", path: "/triage", icon: <InboxIcon fontSize="small" />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST] },
      { label: "Raise request", path: "/raise-request", icon: <AddCircleOutlineIcon fontSize="small" />, roles: Object.values(ROLES) },
    ]
  },
  {
    title: "Operations",
    items: [
      { label: "Tasks", path: "/tasks", icon: <TaskAltIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Assets", path: "/assets", icon: <StorageIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Sites", path: "/sites", icon: <LocationOnIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Surveys & audits", path: "/surveys", icon: <FactCheckIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Risks", path: "/risks", icon: <ReportProblemIcon fontSize="small" />, roles: Object.values(ROLES) },
      { label: "Issues", path: "/issues", icon: <WarningAmberIcon fontSize="small" />, roles: Object.values(ROLES) },
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

  const activeLabel = sections
    .flatMap((s) => s.items)
    .find((i) => i.path === loc.pathname)?.label ?? "Workspace"

  const navContent = (
    <>
      <Toolbar sx={{ minHeight: 52, p: 0 }} />

      <Box sx={{ overflow: "auto", pb: 2 }}>
        {sections.map((section) => {
          const visibleItems = section.items.filter((item) => hasAnyRole(item.roles))
          if (visibleItems.length === 0) return null
          const isCollapsed = collapsed[section.title] ?? false

          return (
            <Box key={section.title || "top"}>
              {section.title ? (
                <Box
                  onClick={() => toggleSection(section.title)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 2,
                    pt: 1.5,
                    pb: 0.25,
                    cursor: "pointer"
                  }}
                >
                  <Typography sx={{
                    color: "#475569",
                    fontWeight: 700,
                    fontSize: 10,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase"
                  }}>
                    {section.title}
                  </Typography>
                  {isCollapsed
                    ? <ExpandMoreIcon sx={{ fontSize: 12, color: "#475569" }} />
                    : <ExpandLessIcon sx={{ fontSize: 12, color: "#475569" }} />
                  }
                </Box>
              ) : null}

              <Collapse in={!isCollapsed}>
                <List dense disablePadding sx={{ px: 1, pt: section.title ? 0.25 : 0.75, pb: 0 }}>
                  {visibleItems.map((item) => (
                    <ListItemButton
                      key={item.path}
                      selected={loc.pathname === item.path}
                      onClick={() => navigateTo(item.path)}
                      sx={{
                        borderRadius: 1,
                        mb: 0.125,
                        py: 0.4,
                        px: 1,
                        minHeight: 0,
                        color: "#94a3b8",
                        "& .MuiListItemIcon-root": { color: "#475569", minWidth: 28 },
                        "&.Mui-selected": {
                          bgcolor: "rgba(59,130,246,0.15)",
                          color: "#e2e8f0",
                          "& .MuiListItemIcon-root": { color: "#7db4f5" }
                        },
                        "&.Mui-selected:hover": { bgcolor: "rgba(59,130,246,0.22)" },
                        "&:hover": { bgcolor: "rgba(255,255,255,0.04)", color: "#cbd5e1" }
                      }}
                    >
                      <ListItemIcon>{item.icon}</ListItemIcon>
                      <ListItemText
                        primary={item.label}
                        primaryTypographyProps={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}
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
        <Toolbar sx={{ minHeight: 52 }}>
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography sx={{ fontWeight: 700, fontSize: 13, color: "#0f172a", mr: 2, flexGrow: 1 }}>
           AD Service Management App
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
              sx={{ minWidth: 200, mr: 1.5 }}
            >
              {(clients.data ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          ) : null}
          <Button variant="outlined" size="small" color="inherit" onClick={onLogout} disabled={loggingOut}
            sx={{ fontSize: 12 }}>
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
            background: "#0d1526",
            color: "#dbe7ff",
            borderRight: "1px solid rgba(255,255,255,0.05)"
          }
        }}
      >
        {navContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 1.5, md: 3 } }}>
        <Toolbar sx={{ minHeight: 52 }} />
        <Outlet />
      </Box>
    </Box>
  )
}