import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { setSelectedClientId } from "../lib/scope"
import { Box, Chip, Stack, Typography } from "@mui/material"
import { LoadingState, ErrorState } from "../components/PageState"
import { StatusPill, semanticToken, ragToken, slate } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import { SectionHeader } from "../components/shared/primitives/SectionHeader"
import { PersonalBriefing } from "../components/PersonalBriefing"
import { useTickets } from "../lib/tickets"

// ── Types ─────────────────────────────────────────────────────────────────
type Client = { id: string; name: string }
type Site = { id: string; name: string }
type Assignee = { id: string; email: string }

type WorkCheck = {
  id: string
  reference: string
  title: string
  checkType: string
  status: string
  scheduledAt: string | null
  dueAt: string | null
  client: Client
  site: Site | null
  assignee: Assignee | null
}

type WorkTask = {
  id: string
  reference: string
  title: string
  status: string
  priority: string
  dueAt: string | null
  client: Client
  assignee: Assignee | null
}

type WorkItem =
  | { kind: "check"; data: WorkCheck }
  | { kind: "task"; data: WorkTask }

// ── Urgency logic ─────────────────────────────────────────────────────────
type UrgencyGroup = "overdue" | "today" | "upcoming" | "active"

function getUrgency(item: WorkItem): UrgencyGroup {
  const dueStr = item.kind === "check"
    ? item.data.scheduledAt ?? item.data.dueAt
    : item.data.dueAt

  if (!dueStr) return "active"

  const due = new Date(dueStr)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  if (due < todayStart) return "overdue"
  if (due >= todayStart && due < todayEnd) return "today"
  return "upcoming"
}

const URGENCY_ORDER: UrgencyGroup[] = ["overdue", "today", "upcoming", "active"]

const URGENCY_LABELS: Record<UrgencyGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  active: "Active"
}

// ── Date formatting ───────────────────────────────────────────────────────
function formatDue(dateStr: string | null, urgency: UrgencyGroup): string {
  if (!dateStr) return ""
  const date = new Date(dateStr)
  const now = new Date()

  if (urgency === "overdue") {
    const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
    return `${days} day${days !== 1 ? "s" : ""} overdue`
  }
  if (urgency === "today") {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

// ── Work item card ────────────────────────────────────────────────────────
function WorkItemCard({
  item,
  urgency,
  onClick
}: {
  item: WorkItem
  urgency: UrgencyGroup
  onClick: () => void
}) {
  const { mode } = useThemeMode()
  const isOverdue = urgency === "overdue"
  const isToday = urgency === "today"
  const edge = mode === "dark" ? slate[600] : slate[300]
  const overdueDot = ragToken("RED", mode).dot
  const todayDot = ragToken("AMBER", mode).dot

  const reference = item.kind === "check" ? item.data.reference : item.data.reference
  const title = item.kind === "check" ? item.data.title : item.data.title
  const status = item.kind === "check" ? item.data.status : item.data.status
  const clientName = item.kind === "check" ? item.data.client?.name : item.data.client?.name
  const siteName = item.kind === "check" ? item.data.site?.name : null
  const dueStr = item.kind === "check"
    ? item.data.scheduledAt ?? item.data.dueAt
    : item.data.dueAt
  const dueFormatted = formatDue(dueStr, urgency)

  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: "background.paper",
        border: "1px solid", borderColor: "divider",
        borderLeft: isOverdue
          ? `3px solid ${overdueDot}`
          : isToday
          ? `3px solid ${todayDot}`
          : "1px solid var(--color-border-primary)",
        borderRadius: "8px",
        px: "16px", py: "12px",
        mb: "6px",
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: "12px",
        transition: "all 0.1s",
        "&:hover": {
          borderColor: isOverdue ? overdueDot : isToday ? todayDot : edge,
          boxShadow: "0 2px 8px rgba(15,23,42,0.06)"
        }
      }}
    >
      {/* Type badge */}
      <Chip
        label={item.kind === "check" ? "CHECK" : "TASK"}
        size="small"
        sx={{
          fontSize: 10, fontWeight: 600, flexShrink: 0,
          bgcolor: item.kind === "check" ? (mode === "dark" ? "rgba(59,130,246,0.15)" : "#e8f1ff") : "var(--color-background-tertiary)",
          color: item.kind === "check" ? (mode === "dark" ? "#60a5fa" : "#1d4ed8") : "text.secondary",
          borderRadius: "4px", height: 20
        }}
      />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "2px" }}>
          <Typography sx={{
            fontSize: 13.5, fontWeight: 500, color: "text.primary",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0
          }}>
            {title}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap="6px" flexWrap="wrap">
          <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: "text.tertiary" }}>
            {reference}
          </Typography>
          {clientName ? (
            <>
              <Typography sx={{ fontSize: 11, color: edge }}>·</Typography>
              <Box sx={{
                px: "6px", py: "1px", bgcolor: "var(--color-background-tertiary)",
                borderRadius: "4px", border: "1px solid", borderColor: "divider"
              }}>
                <Typography sx={{ fontSize: 11, fontWeight: 500, color: "text.secondary" }}>
                  {clientName}
                </Typography>
              </Box>
            </>
          ) : null}
          {siteName ? (
            <>
              <Typography sx={{ fontSize: 11, color: edge }}>·</Typography>
              <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>{siteName}</Typography>
            </>
          ) : null}
          {dueFormatted ? (
            <>
              <Typography sx={{ fontSize: 11, color: edge }}>·</Typography>
              <Typography sx={{
                fontSize: 11, fontWeight: isOverdue ? 600 : 400,
                color: isOverdue ? semanticToken("danger", mode).solid : isToday ? semanticToken("warning", mode).text : "var(--color-text-muted)"
              }}>
                {dueFormatted}
              </Typography>
            </>
          ) : null}
        </Stack>
      </Box>

      {/* Status pill */}
      <Box sx={{ flexShrink: 0, display: "inline-flex" }}>
        <StatusPill value={status} label={status.toLowerCase().replace(/_/g, " ")} size="sm" />
      </Box>

      {/* Chevron */}
      <Typography sx={{ fontSize: 16, color: edge, flexShrink: 0, lineHeight: 1 }}>›</Typography>
    </Box>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyMyWork() {
  const { mode } = useThemeMode()
  return (
    <Box sx={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      py: "64px", px: "24px", textAlign: "center"
    }}>
      <Box sx={{
        width: 48, height: 48, borderRadius: "50%", bgcolor: mode === "dark" ? "rgba(34,197,94,0.12)" : "#f0fdf4",
        display: "flex", alignItems: "center", justifyContent: "center", mb: "16px"
      }}>
        <Typography sx={{ fontSize: 22 }}>✓</Typography>
      </Box>
      <Typography sx={{ fontSize: 16, fontWeight: 500, color: "text.primary", mb: "6px" }}>
        All clear
      </Typography>
      <Typography sx={{ fontSize: 13.5, color: "var(--color-text-muted)" }}>
        No checks or tasks assigned to you right now.
      </Typography>
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function MyWorkPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-work"],
    queryFn: async () => (await api.get<{ checks: WorkCheck[]; tasks: WorkTask[] }>("/my-work")).data
  })

  // Tickets feed the user-specific briefing. Filtering down to the current
  // user happens inside PersonalBriefing.
  const { data: tickets } = useTickets()

  // Build flat list of work items
  const allItems: WorkItem[] = [
    ...(data?.checks ?? []).map(c => ({ kind: "check" as const, data: c })),
    ...(data?.tasks ?? []).map(t => ({ kind: "task" as const, data: t }))
  ]

  // Group by urgency
  const grouped = URGENCY_ORDER.reduce((acc, group) => {
    acc[group] = allItems.filter(item => getUrgency(item) === group)
    return acc
  }, {} as Record<UrgencyGroup, WorkItem[]>)

  const hasWork = allItems.length > 0

  // Navigate to item — auto-sets client scope
  function handleItemClick(item: WorkItem) {
    const clientId = item.kind === "check" ? item.data.client?.id : item.data.client?.id
    if (clientId) {
      setSelectedClientId(clientId)
      queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "clients" && q.queryKey[0] !== "my-work" })
    }
    if (item.kind === "check") {
      navigate(`/checks/${item.data.id}`)
    } else {
      navigate(`/tasks/${item.data.id}`)
    }
  }

  return (
    <Box>
      <Box sx={{ maxWidth: 720 }}>
        <PersonalBriefing tickets={tickets} />
      </Box>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load your work" /> : null}

      {!isLoading && !error && !hasWork ? <EmptyMyWork /> : null}

      {!isLoading && !error && hasWork ? (
        <Box sx={{ maxWidth: 720 }}>
          <Box sx={{ borderBottom: "1px solid var(--color-border-primary)", pb: "8px", mb: "12px" }}>
            <SectionHeader label="Your checks & tasks" />
          </Box>
          {URGENCY_ORDER.map(group => {
            const items = grouped[group]
            if (items.length === 0) return null
            return (
              <Box key={group} sx={{ mb: "28px" }}>
                <Box sx={{ borderBottom: "1px solid var(--color-border-primary)", pb: "8px", mb: "8px" }}>
                  <SectionHeader
                    label={URGENCY_LABELS[group]}
                    action={<Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>({items.length})</Typography>}
                  />
                </Box>
                {items.map(item => (
                  <WorkItemCard
                    key={`${item.kind}-${item.data.id}`}
                    item={item}
                    urgency={group}
                    onClick={() => handleItemClick(item)}
                  />
                ))}
              </Box>
            )
          })}
        </Box>
      ) : null}
    </Box>
  )
}