import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Badge, Box, CircularProgress, IconButton, Menu, Typography } from "@mui/material"
import NotificationsIcon from "@mui/icons-material/Notifications"
import DoneAllIcon from "@mui/icons-material/DoneAll"
import { Avatar } from "./shared"
import {
  fetchNotifications,
  fetchUnreadCount,
  formatRelativeTime,
  markAllNotificationsRead,
  markNotificationRead,
  routeForNotificationSource,
  sourceTypeLabel,
  type NotificationItem,
} from "../lib/notifications"

// Background poll for the unread badge. Cheap count endpoint only; the full list is
// fetched on dropdown open (the recommended lighter approach).
const POLL_INTERVAL_MS = 25000

// Functional replacement for the previously-decorative top-bar bell (Shell.tsx).
// Scoped by the active client (notifications are per-tenant); queries are keyed by
// clientId so switching clients refetches, and gated on a non-empty clientId so
// org-super on a scope-independent page (no x-client-id) does not 400-spam.
export default function NotificationBell({ clientId }: { clientId: string }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const open = Boolean(anchorEl)

  const countQuery = useQuery({
    queryKey: ["notifications", "unread-count", clientId],
    queryFn: fetchUnreadCount,
    enabled: !!clientId,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const listQuery = useQuery({
    queryKey: ["notifications", "list", clientId],
    queryFn: fetchNotifications,
    enabled: open && !!clientId,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications", "unread-count", clientId] })
    qc.invalidateQueries({ queryKey: ["notifications", "list", clientId] })
  }

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
  })
  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: invalidate,
  })

  const unreadCount = countQuery.data ?? 0
  const items = listQuery.data?.items ?? []

  function handleItemClick(n: NotificationItem) {
    setAnchorEl(null)
    if (!n.readAt) markRead.mutate(n.id)
    const route = routeForNotificationSource(n.sourceType, n.sourceId)
    if (route) nav(route)
  }

  return (
    <>
      <IconButton
        size="small"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        sx={{
          width: 36, height: 36, color: "#64748b", borderRadius: "8px",
          "&:hover": { bgcolor: "rgba(255,255,255,0.06)", color: "#cbd5e1" },
        }}
      >
        <Badge
          badgeContent={unreadCount}
          max={99}
          color="error"
          overlap="circular"
          sx={{ "& .MuiBadge-badge": { fontSize: 10, height: 16, minWidth: 16, px: "4px" } }}
        >
          <NotificationsIcon sx={{ fontSize: 18 }} />
        </Badge>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1, width: 380, maxWidth: "calc(100vw - 24px)",
              borderRadius: "10px", border: "1px solid #e2e8f0",
              boxShadow: "0 8px 24px rgba(15,23,42,0.16)", overflow: "hidden",
            },
          },
        }}
        MenuListProps={{ sx: { p: 0 } }}
      >
        {/* Header — title + mark-all-read */}
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: "14px", py: "10px", borderBottom: "1px solid #f1f5f9" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Notifications</Typography>
          {unreadCount > 0 ? (
            <Box
              component="button"
              type="button"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              sx={{
                display: "flex", alignItems: "center", gap: "5px",
                border: "none", bgcolor: "transparent", p: 0, cursor: "pointer",
                color: "#1d4ed8", fontSize: 12, fontWeight: 500,
                "&:hover": { textDecoration: "underline" },
                "&:disabled": { opacity: 0.5, cursor: "default", textDecoration: "none" },
              }}
            >
              <DoneAllIcon sx={{ fontSize: 15 }} /> Mark all read
            </Box>
          ) : null}
        </Box>

        {/* Body */}
        <Box sx={{ maxHeight: 420, overflowY: "auto" }}>
          {listQuery.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={20} />
            </Box>
          ) : items.length === 0 ? (
            <Box sx={{ px: "16px", py: 5, textAlign: "center" }}>
              <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No notifications</Typography>
            </Box>
          ) : (
            items.map((n) => {
              const actorName = n.actor?.displayName ?? "Someone"
              const unread = !n.readAt
              return (
                <Box
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  sx={{
                    display: "flex", gap: "10px", px: "14px", py: "10px", cursor: "pointer",
                    borderBottom: "1px solid #f8fafc",
                    bgcolor: unread ? "rgba(29,78,216,0.05)" : "transparent",
                    "&:hover": { bgcolor: unread ? "rgba(29,78,216,0.09)" : "#f8fafc" },
                  }}
                >
                  <Avatar name={actorName} size="md" variant="neutral" />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, color: "#0f172a", fontWeight: unread ? 600 : 400, lineHeight: 1.4 }}>
                      <Box component="span" sx={{ fontWeight: 600 }}>{actorName}</Box> mentioned you
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      in {sourceTypeLabel(n.sourceType)}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: "2px" }}>
                      {formatRelativeTime(n.createdAt)}
                    </Typography>
                  </Box>
                  {unread ? <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#1d4ed8", flexShrink: 0, mt: "6px" }} /> : null}
                </Box>
              )
            })
          )}
        </Box>
      </Menu>
    </>
  )
}
