import React, { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography
} from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import InboxIcon from "@mui/icons-material/Inbox";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import StorageIcon from "@mui/icons-material/Storage";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import { revokeAndLogout } from "../lib/api";

const drawerWidth = 280;

const items = [
  { label: "Dashboard", path: "/", icon: <DashboardIcon /> },
  { label: "Triage", path: "/triage", icon: <InboxIcon /> },
  { label: "Service Requests", path: "/service-requests", icon: <ConfirmationNumberIcon /> },
  { label: "Incidents", path: "/incidents", icon: <WarningAmberIcon /> },
  { label: "Tasks", path: "/tasks", icon: <TaskAltIcon /> },
  { label: "Assets", path: "/assets", icon: <StorageIcon /> },
  { label: "Surveys & Audits", path: "/surveys", icon: <FactCheckIcon /> }
];

export default function Shell() {
  const nav = useNavigate();
  const loc = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const active = items.find((x) => x.path === loc.pathname)?.label ?? "Workspace";

  async function onLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await revokeAndLogout();
    setLoggingOut(false);
  }

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
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, color: "#1e293b" }}>
            {active}
          </Typography>
          <Button variant="outlined" color="inherit" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Logout"}
          </Button>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
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
            {items.map((it) => (
              <ListItemButton
                key={it.path}
                selected={loc.pathname === it.path}
                onClick={() => nav(it.path)}
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
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar sx={{ minHeight: 72 }} />
        <Outlet />
      </Box>
    </Box>
  );
}
