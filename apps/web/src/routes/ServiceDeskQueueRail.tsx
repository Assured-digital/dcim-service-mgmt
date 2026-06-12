import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Box, Stack, Typography } from "@mui/material"
import { statusColors } from "../components/shared/tokens/colors"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { getCurrentUser } from "../lib/auth"
import { useTickets, type Ticket, KIND_LABELS } from "../lib/tickets"
import { parseQueueParams, filterTickets, sortTickets } from "../lib/serviceDeskQueue"

// Created date, DD/MM/YY, for the rail row's secondary line.
function formatCreated(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

// ── Service Desk working-queue rail (depth-1 ticket selector) ──────────────
//
// Rendered by ServiceDeskNavigator as the compressed queue panel's railContent.
// Shows the EXACT filtered/sorted set the depth-0 table showed — both derive it
// from the same URL params via the same lib/serviceDeskQueue selectors, so the
// rail IS the working queue. Clicking an item swaps the open ticket (replace, so
// browser-back returns to the table, not through each ticket viewed). The filter
// query string is preserved on every navigation so the rail set stays put.

export function ServiceDeskQueueRail({ activeId }: { activeId?: string }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queueParams = React.useMemo(() => parseQueueParams(searchParams), [searchParams])
  const currentUser = React.useMemo(() => getCurrentUser(), [])
  const { data: tickets } = useTickets()

  const items = React.useMemo(
    () => sortTickets(filterTickets(tickets, queueParams, currentUser), queueParams.sortModel),
    [tickets, queueParams, currentUser],
  )

  const search = searchParams.toString()
  const toQueue = () => navigate({ pathname: "/service-desk", search })
  const openTicket = (t: Ticket) =>
    navigate({ pathname: t.detailPath, search }, { replace: true })

  return (
    <>
      {/* Back-to-queue header — returns to the same filtered table. */}
      <Box
        role="button"
        tabIndex={0}
        aria-label="Back to queue"
        onClick={toQueue}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toQueue() } }}
        sx={{
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 0.75,
          px: 1.5, height: 44,   // match the detail header height so the separators align
          cursor: "pointer",
          borderBottom: 1, borderColor: "divider",
          color: "#475569",
          transition: "background-color 0.12s",
          "&:hover": { bgcolor: "#f1f5f9" },
        }}
      >
        <ArrowBackIcon sx={{ fontSize: 16 }} />
        <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Queue
        </Typography>
        <Typography sx={{ ml: "auto", fontSize: 11, color: "#94a3b8" }}>{items.length}</Typography>
      </Box>

      {/* Scrollable ticket list. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {items.map(t => {
          const active = t.id === activeId
          // Dot reads the SAME status→colour source the detail/queue pills use
          // (statusColors → resolveIntent → semanticTokens), so a "New" record's
          // dot matches its "New" pill. NOT due-proximity.
          const dotColor = statusColors(t.status).bg
          return (
            <Box
              key={t.id}
              role="button"
              tabIndex={0}
              aria-current={active ? "true" : undefined}
              onClick={() => openTicket(t)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTicket(t) } }}
              sx={{
                display: "flex", alignItems: "flex-start", gap: 1,
                px: 1.5, py: 1.5,
                cursor: "pointer",
                borderBottom: "1px solid #f1f5f9",
                borderLeft: active ? "3px solid #1d4ed8" : "3px solid transparent",
                bgcolor: active ? "#eff4ff" : "transparent",
                transition: "background-color 0.12s",
                "&:hover": { bgcolor: active ? "#eff4ff" : "#f8fafc" },
              }}
            >
              <Box
                component="span"
                sx={{ mt: "5px", width: 8, height: 8, borderRadius: "50%", bgcolor: dotColor, flexShrink: 0 }}
              />
              <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
                {/* Primary: title. Secondary: full type (left, truncates) + created
                    date (right). Status is carried by the dot now; reference lives in
                    the breadcrumb + the Details panel. */}
                <Typography
                  title={t.subject}
                  sx={{
                    fontSize: 12.5,
                    color: active ? "#1d4ed8" : "#0f172a",
                    fontWeight: active ? 600 : 500,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {t.subject}
                </Typography>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, minWidth: 0 }}>
                  <Typography
                    title={KIND_LABELS[t.kind]}
                    sx={{
                      fontSize: 11, color: "#64748b", minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {KIND_LABELS[t.kind]}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }}>
                    {formatCreated(t.createdAt)}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          )
        })}
      </Box>
    </>
  )
}
