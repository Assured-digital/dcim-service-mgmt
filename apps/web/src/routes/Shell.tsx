import React, { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AppBar,
  Box,
  Button,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  TextField,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import InboxIcon from "@mui/icons-material/Inbox";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import StorageIcon from "@mui/icons-material/Storage";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import ApartmentIcon from "@mui/icons-material/Apartment";
import BusinessIcon from "@mui/icons-material/Business";
import { api, revokeAndLogout } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac";
import { getSelectedClientId, setSelectedClientId } from "../lib/scope";

const drawerWidth = 280;

const items = [
  { label: "Dashboard", path: "/", icon: <DashboardIcon />, roles: Object.values(ROLES) },
  {
    label: "Triage",
    path: "/triage",
    icon: <InboxIcon />,
    roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST]
  },
  { label: "Service Requests", path: "/service-requests", icon: <ConfirmationNumberIcon />, roles: Object.values(ROLES) },
  { label: "Incidents", path: "/incidents", icon: <WarningAmberIcon />, roles: Object.values(ROLES) },
  { label: "Tasks", path: "/tasks", icon: <TaskAltIcon />, roles: Object.values(ROLES) },
  { label: "Assets", path: "/assets", icon: <StorageIcon />, roles: Object.values(ROLES) },
  { label: "Surveys & Audits", path: "/surveys", icon: <FactCheckIcon />, roles: Object.values(ROLES) },
  { label: "Organization", path: "/organization", icon: <BusinessIcon />, roles: [...ORG_SUPER_ROLES] },
  { label: "Clients", path: "/clients", icon: <ApartmentIcon />, roles: [...ORG_SUPER_ROLES] },
  { label: "Users", path: "/users", icon: <ManageAccountsIcon />, roles: [...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER] }
];

export default function Shell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const nav = useNavigate();
  const loc = useLocation();
  const isOrgSuper = hasAnyRole([...ORG_SUPER_ROLES]);
  const [selectedClientId, setSelectedClientIdState] = useState(getSelectedClientId() ?? "");
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleItems = items.filter((item) => hasAnyRole(item.roles));
  const active = visibleItems.find((x) => x.path === loc.pathname)?.label ?? "Workspace";
  const currentUser = getCurrentUser();

  const clients = useQuery({
    queryKey: ["clients"],
    enabled: isOrgSuper,
    queryFn: async () => (await api.get<Array<{ id: string; name: string }>>("/clients")).data
  });

  React.useEffect(() => {
    if (!isOrgSuper) return;
    if ((clients.data?.length ?? 0) === 0) return;

    const selected =
      selectedClientId && clients.data?.some((c) => c.id === selectedClientId)
        ? selectedClientId
        : currentUser?.clientId && clients.data?.some((c) => c.id === currentUser.clientId)
          ? currentUser.clientId
          : clients.data?.[0]?.id ?? "";

    if (selected && selected !== selectedClientId) {
      setSelectedClientIdState(selected);
      setSelectedClientId(selected);
    }
  }, [clients.data, currentUser?.clientId, isOrgSuper, selectedClientId]);

  async function onLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await revokeAndLogout();
    setLoggingOut(false);
  }

  function navigateTo(path: string) {
    nav(path);
    setMobileOpen(false);
  }

  const navContent = (
    <>
      <Toolbar sx={{ minHeight: 72 }}>
        <Box>
          <Typography variant="h6" sx={{ color: "#f8fafc", lineHeight: 1.1 }}>
            DC Service Mgmt
          </Typography>
          <Typography variant="caption" sx={{ color: "#93c5fd" }}>
            Control Center
          </Typography>
        </Box>
      </Toolbar>
      <Box sx={{ overflow: "auto" }}>
        <List sx={{ px: 1.5, py: 1 }}>
          {visibleItems.map((it) => (
            <ListItemButton
              key={it.path}
              selected={loc.pathname === it.path}
              onClick={() => navigateTo(it.path)}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                color: "#dbe7ff",
                "& .MuiListItemIcon-root": { color: "#93c5fd", minWidth: 36 },
                "&.Mui-selected": {
                  bgcolor: "rgba(59,130,246,0.2)",
                  color: "#ffffff",
                  "& .MuiListItemIcon-root": { color: "#bfdbfe" }
                },
                "&.Mui-selected:hover": { bgcolor: "rgba(59,130,246,0.28)" }
              }}
            >
              <ListItemIcon>{it.icon}</ListItemIcon>
              <ListItemText primary={it.label} primaryTypographyProps={{ fontWeight: 600 }} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </>
  );

  return (
    <Box sx={{ display: "flex" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          borderBottom: "1px solid #dbe4f1",
          bgcolor: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(6px)"
        }}
      >
        <Toolbar sx={{ minHeight: 72 }}>
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, color: "#1e293b" }}>
            {active}
          </Typography>
          {isOrgSuper ? (
            <TextField
              select
              size="small"
              label="Client Scope"
              value={selectedClientId}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedClientIdState(value);
                setSelectedClientId(value || null);
              }}
              sx={{ minWidth: 240, mr: 1.5 }}
            >
              {(clients.data ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <Button variant="outlined" color="inherit" onClick={onLogout} disabled={loggingOut}>
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
            borderRight: "1px solid rgba(255,255,255,0.08)"
          }
        }}
      >
        {navContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 1.5, md: 3 } }}>
        <Toolbar sx={{ minHeight: 72 }} />
        <Outlet />
      </Box>
    </Box>
  );
}
