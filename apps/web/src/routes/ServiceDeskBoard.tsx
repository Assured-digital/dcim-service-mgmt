import React from "react"
import { useNavigate } from "react-router-dom"
import { Box, Stack, Typography } from "@mui/material"
import MailOutlineIcon from "@mui/icons-material/MailOutline"
import LanguageIcon from "@mui/icons-material/Language"
import MoreHorizIcon from "@mui/icons-material/MoreHoriz"
import { EmptyState } from "../components/PageState"
import { TypeBadge, PriorityDot } from "../components/shared"
import type { Ticket, ChipIntent } from "../lib/tickets"

// Four columns mapped to chipIntent. "Overdue" is rendered as a red-accent card
// inside whichever column the ticket already lives in.
interface Column {
  key: ChipIntent
  title: string
  sub: string
}

const COLUMNS: Column[] = [
  { key: "new",  title: "New",         sub: "intake" },
  { key: "open", title: "In progress", sub: "assigned" },
  { key: "wait", title: "Waiting",     sub: "on client / part" },
  { key: "done", title: "Resolved",    sub: "pending confirm" },
]

function bucketTickets(tickets: Ticket[]): Record<ChipIntent, Ticket[]> {
  const by: Record<ChipIntent, Ticket[]> = {
    new: [], open: [], wait: [], done: [], overdue: [],
  }
  for (const t of tickets) {
    // Overdue tickets still surface in their underlying column but styled to stand out.
    const target: ChipIntent = t.overdue ? "open" : t.chipIntent === "overdue" ? "open" : t.chipIntent
    by[target].push(t)
  }
  return by
}

function TicketCard({ t, onClick }: { t: Ticket; onClick: () => void }) {
  const borderLeft = t.overdue ? "3px solid #ef4444" : "1px solid #e2e8f0"
  return (
    <Box
      onClick={onClick}
      sx={{
        px: 1.25, py: 1.25, cursor: "pointer",
        bgcolor: "#fff", borderRadius: 1,
        border: "1px solid #e2e8f0",
        borderLeft,
        boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
        transition: "box-shadow 150ms, border-color 150ms",
        "&:hover": { boxShadow: "0 4px 12px rgba(15,23,42,0.08)", borderColor: "#cbd5e1" },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.75 }}>
        <PriorityDot priority={t.priority} />
        <TypeBadge kind={t.kind} />
        <Typography sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#475569" }}>
          {t.reference}
        </Typography>
      </Stack>
      <Typography sx={{
        fontSize: 12.5, fontWeight: 500, color: "#0f172a",
        lineHeight: 1.35, mb: 0.75,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {t.subject}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography sx={{ fontSize: 11, color: "#64748b", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t.assignee ? t.assignee.displayName : "Unassigned"}
        </Typography>
        <LanguageIcon sx={{ fontSize: 13, color: "#94a3b8" }} />
        {/* Channel icon placeholder — real channel data not yet surfaced by the API */}
      </Stack>
    </Box>
  )
}

function BoardColumn({ col, items }: { col: Column; items: Ticket[] }) {
  const navigate = useNavigate()
  return (
    <Box sx={{
      flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
      bgcolor: "#fff", border: "1px solid #e2e8f0", borderRadius: 1.5,
      minHeight: 0, overflow: "hidden",
    }}>
      <Box sx={{ px: 1.5, pt: 1, pb: 0.75, borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
            {col.title}
          </Typography>
          <Box sx={{
            fontSize: 11, fontWeight: 700, color: "#64748b",
            bgcolor: "#f1f5f9", borderRadius: 999, px: 0.875, py: 0.125,
          }}>
            {items.length}
          </Box>
          <Box sx={{ ml: "auto", color: "#94a3b8", display: "flex" }}>
            <MoreHorizIcon sx={{ fontSize: 16 }} />
          </Box>
        </Stack>
        <Typography sx={{ fontSize: 10.5, color: "#94a3b8", mt: 0.25, letterSpacing: "0.02em" }}>
          {col.sub}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, display: "flex", flexDirection: "column", gap: 1 }}>
        {items.length === 0 ? (
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8", textAlign: "center", py: 2, fontStyle: "italic" }}>
            Nothing here
          </Typography>
        ) : (
          items.map(t => (
            <TicketCard key={`${t.kind}-${t.id}`} t={t} onClick={() => navigate(t.detailPath)} />
          ))
        )}
      </Box>
    </Box>
  )
}

export default function ServiceDeskBoard({ tickets }: { tickets: Ticket[] }) {
  const buckets = React.useMemo(() => bucketTickets(tickets), [tickets])

  if (tickets.length === 0) {
    return <Box sx={{ p: 3 }}><EmptyState title="No tickets" detail="Adjust filters to see more." /></Box>
  }

  // Silence unused-import warning — reserved for future email/portal channel rendering.
  void MailOutlineIcon

  return (
    <Box sx={{
      flex: 1, display: "flex", gap: 1.25, p: 1.5,
      overflowX: "auto", overflowY: "hidden",
      bgcolor: "#f8fafc", minHeight: 0,
    }}>
      {COLUMNS.map(col => (
        <BoardColumn key={col.key} col={col} items={buckets[col.key]} />
      ))}
    </Box>
  )
}
