import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { getCurrentUser } from "../lib/auth"
import { setSelectedClientId } from "../lib/scope"
import { Box, Chip, Stack, Typography } from "@mui/material"
import { LoadingState, ErrorState } from "../components/PageState"
import { chipSx } from "../components/shared"

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

// ── Section header ────────────────────────────────────────────────────────
function SectionHeader({ urgency, count }: { urgency: UrgencyGroup; count: number }) {
  const colours: Record<UrgencyGroup, { label: string; dot: string; text: string }> = {
    overdue: { label: "#fef2f2", dot: "#ef4444", text: "#b91c1c" },
    today: { label: "#fffbeb", dot: "#f59e0b", text: "#b45309" },
    upcoming: { label: "transparent", dot: "#94a3b8", text: "#64748b" },
    active: { label: "transparent", dot: "#94a3b8", text: "#64748b" }
  }
  const c = colours[urgency]
  return (
    <Box sx={{
      display: "flex", alignItems: "center", gap: "8px",
      pb: "8px", mb: "8px",
      borderBottom: "1px solid #e2e8f0"
    }}>
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: c.dot, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: c.text }}>
        {URGENCY_LABELS[urgency]}
      </Typography>
      <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>({count})</Typography>
    </Box>
  )
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
  const isOverdue = urgency === "overdue"
  const isToday = urgency === "today"

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
        bgcolor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderLeft: isOverdue
          ? "3px solid #ef4444"
          : isToday
          ? "3px solid #f59e0b"
          : "1px solid #e2e8f0",
        borderRadius: "8px",
        px: "16px", py: "12px",
        mb: "6px",
        cursor: "pointer",
        display: "flex", alignItems: "center", gap: "12px",
        transition: "all 0.1s",
        "&:hover": {
          borderColor: isOverdue ? "#ef4444" : isToday ? "#f59e0b" : "#cbd5e1",
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
          bgcolor: item.kind === "check" ? "#e8f1ff" : "#f1f5f9",
          color: item.kind === "check" ? "#1d4ed8" : "#475569",
          borderRadius: "4px", height: 20
        }}
      />

      {/* Content */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" gap="8px" sx={{ mb: "2px" }}>
          <Typography sx={{
            fontSize: 13.5, fontWeight: 500, color: "#0f172a",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            flex: 1, minWidth: 0
          }}>
            {title}
          </Typography>
        </Stack>
        <Stack direction="row" alignItems="center" gap="6px" flexWrap="wrap">
          <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8" }}>
            {reference}
          </Typography>
          {clientName ? (
            <>
              <Typography sx={{ fontSize: 11, color: "#cbd5e1" }}>·</Typography>
              <Box sx={{
                px: "6px", py: "1px", bgcolor: "#f1f5f9",
                borderRadius: "4px", border: "1px solid #e2e8f0"
              }}>
                <Typography sx={{ fontSize: 11, fontWeight: 500, color: "#475569" }}>
                  {clientName}
                </Typography>
              </Box>
            </>
          ) : null}
          {siteName ? (
            <>
              <Typography sx={{ fontSize: 11, color: "#cbd5e1" }}>·</Typography>
              <Typography sx={{ fontSize: 11, color: "#64748b" }}>{siteName}</Typography>
            </>
          ) : null}
          {dueFormatted ? (
            <>
              <Typography sx={{ fontSize: 11, color: "#cbd5e1" }}>·</Typography>
              <Typography sx={{
                fontSize: 11, fontWeight: isOverdue ? 600 : 400,
                color: isOverdue ? "#b91c1c" : isToday ? "#b45309" : "#64748b"
              }}>
                {dueFormatted}
              </Typography>
            </>
          ) : null}
        </Stack>
      </Box>

      {/* Status chip */}
      <Chip
        size="small"
        label={status.toLowerCase().replace(/_/g, " ")}
        sx={{ ...chipSx(status), flexShrink: 0 }}
      />

      {/* Chevron */}
      <Typography sx={{ fontSize: 16, color: "#cbd5e1", flexShrink: 0, lineHeight: 1 }}>›</Typography>
    </Box>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────
function EmptyMyWork() {
  return (
    <Box sx={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      py: "64px", px: "24px", textAlign: "center"
    }}>
      <Box sx={{
        width: 48, height: 48, borderRadius: "50%", bgcolor: "#f0fdf4",
        display: "flex", alignItems: "center", justifyContent: "center", mb: "16px"
      }}>
        <Typography sx={{ fontSize: 22 }}>✓</Typography>
      </Box>
      <Typography sx={{ fontSize: 16, fontWeight: 500, color: "#0f172a", mb: "6px" }}>
        All clear
      </Typography>
      <Typography sx={{ fontSize: 13.5, color: "#64748b" }}>
        No checks or tasks assigned to you right now.
      </Typography>
    </Box>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function MyWorkPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = getCurrentUser()

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-work"],
    queryFn: async () => (await api.get<{ checks: WorkCheck[]; tasks: WorkTask[] }>("/my-work")).data
  })

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
      {/* Page header */}
      <Box sx={{ mb: "28px" }}>
        <Typography variant="h4">
          My Work
        </Typography>
      </Box>

      {isLoading ? <LoadingState /> : null}
      {error ? <ErrorState title="Failed to load your work" /> : null}

      {!isLoading && !error && !hasWork ? <EmptyMyWork /> : null}

      {!isLoading && !error && hasWork ? (
        <Box sx={{ maxWidth: 720 }}>
          {URGENCY_ORDER.map(group => {
            const items = grouped[group]
            if (items.length === 0) return null
            return (
              <Box key={group} sx={{ mb: "28px" }}>
                <SectionHeader urgency={group} count={items.length} />
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