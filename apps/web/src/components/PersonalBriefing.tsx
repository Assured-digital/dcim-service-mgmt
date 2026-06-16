import React from "react"
import { useNavigate } from "react-router-dom"
import {
  Box, Button, Card, CardContent, Chip, Divider, Stack, Typography
} from "@mui/material"
import { BarChart } from "@mui/x-charts/BarChart"
import PriorityHighIcon from "@mui/icons-material/PriorityHigh"
import WbSunnyIcon from "@mui/icons-material/WbSunny"
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty"
import { StatusPill, TypeBadge } from "./shared"
import { getCurrentUser, type CurrentUser } from "../lib/auth"
import type { Ticket } from "../lib/tickets"

// ── Helpers ──────────────────────────────────────────────────────────────

function greetingByHour(hour: number): string {
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

function userFirstName(user: CurrentUser | null): string {
  if (!user?.email) return "there"
  const local = user.email.split("@")[0]
  const first = local.split(/[._-]/)[0]
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "there"
}

function hoursOld(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000))
}

function priorityRank(p: string): number {
  return p === "critical" ? 4 : p === "high" ? 3 : p === "medium" ? 2 : 1
}

function pickFocus(tickets: Ticket[]): Ticket | null {
  const candidates = tickets.filter(t => t.overdue || t.priority === "critical")
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const pd = priorityRank(b.priority) - priorityRank(a.priority)
    if (pd !== 0) return pd
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  })
  return candidates[0]
}

function pickWaiting(tickets: Ticket[], limit = 5): Ticket[] {
  return tickets
    .filter(t => t.chipIntent === "wait")
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
    .slice(0, limit)
}

function dayBuckets(tickets: Ticket[], days = 14): { label: string; created: number; resolved: number }[] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const buckets: { label: string; created: number; resolved: number; ts: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    buckets.push({
      label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      created: 0,
      resolved: 0,
      ts: d.getTime(),
    })
  }
  const findBucket = (iso: string) => {
    const day = new Date(iso)
    day.setHours(0, 0, 0, 0)
    return buckets.find(b => b.ts === day.getTime())
  }
  for (const t of tickets) {
    const c = findBucket(t.createdAt)
    if (c) c.created++
    if (t.chipIntent === "done") {
      const r = findBucket(t.updatedAt)
      if (r) r.resolved++
    }
  }
  return buckets.map(({ ts: _ts, ...rest }) => rest)
}

// ── MiniStat ─────────────────────────────────────────────────────────────

function MiniStat({ label, value, tone }: {
  label: string
  value: React.ReactNode
  tone: "good" | "bad" | "warn" | "neutral"
}) {
  const toneMap = {
    good:    { bg: "#dcfce7", color: "#15803d" },
    bad:     { bg: "#fee2e2", color: "#b91c1c" },
    warn:    { bg: "#fef3c7", color: "#b45309" },
    neutral: { bg: "#f1f5f9", color: "#334155" },
  } as const
  const t = toneMap[tone]
  return (
    <Card sx={{ bgcolor: t.bg, borderColor: t.bg }}>
      <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.color, mb: 0.5 }}>
          {label}
        </Typography>
        <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 24, fontWeight: 700, color: t.color, lineHeight: 1.1 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  )
}

// ── PersonalBriefing ─────────────────────────────────────────────────────

/**
 * User-specific daily briefing. Caller passes the unfiltered ticket set —
 * this component filters down to tickets assigned to the current user before
 * rendering greeting, focus card, KPIs, trend chart, and waiting list.
 */
export function PersonalBriefing({ tickets }: { tickets: Ticket[] }) {
  const navigate = useNavigate()
  const user = React.useMemo(() => getCurrentUser(), [])

  const myTickets = React.useMemo(
    () => user ? tickets.filter(t => t.assignee?.id === user.userId) : [],
    [tickets, user]
  )

  const now = new Date()
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0)
  const startOfDayMs = startOfDay.getTime()

  const totalOpen = myTickets.filter(t => t.chipIntent !== "done").length
  const resolvedToday = myTickets.filter(
    t => t.chipIntent === "done" && new Date(t.updatedAt).getTime() >= startOfDayMs
  ).length
  const newOverdue = myTickets.filter(
    t => t.overdue && new Date(t.updatedAt).getTime() >= startOfDayMs
  ).length
  const openP1P2 = myTickets.filter(
    t => t.chipIntent !== "done" && (t.priority === "critical" || t.priority === "high")
  ).length
  const slaBreached = myTickets.filter(t => t.overdue).length

  const focus = pickFocus(myTickets)
  const waiting = pickWaiting(myTickets)
  const chart = React.useMemo(() => dayBuckets(myTickets, 14), [myTickets])

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, mb: 4 }}>
      {/* Greeting */}
      <Box>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
          <WbSunnyIcon sx={{ fontSize: 20, color: "#b45309" }} />
          <Typography sx={{
            fontFamily: "Space Grotesk, Manrope", fontSize: 26, fontWeight: 700,
            color: "#0f172a", letterSpacing: "-0.02em",
          }}>
            {greetingByHour(now.getHours())}, {userFirstName(user)}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 14, color: "#475569", lineHeight: 1.6 }}>
          You have <strong style={{ color: "#0f172a" }}>{totalOpen} open ticket{totalOpen === 1 ? "" : "s"}</strong>
          {resolvedToday > 0 ? <> · <strong style={{ color: "#15803d" }}>{resolvedToday} resolved today</strong></> : null}
          {slaBreached > 0 ? <> · <strong style={{ color: "#b91c1c" }}>{slaBreached} crossed SLA</strong></> : null}.
        </Typography>
      </Box>

      {/* Needs your call */}
      {focus ? (
        <Card sx={{ borderLeft: "3px solid #ef4444" }}>
          <CardContent sx={{ p: 2.25 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <PriorityHighIcon sx={{ fontSize: 18, color: "#b91c1c" }} />
              <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                Needs your call
              </Typography>
              <Chip
                size="small"
                label={`P${focus.priority === "critical" ? 1 : focus.priority === "high" ? 2 : 3}`}
                sx={{ fontSize: 11, fontWeight: 700, bgcolor: "#fee2e2", color: "#b91c1c" }}
              />
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <TypeBadge kind={focus.kind} />
              <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#475569" }}>
                {focus.reference}
              </Typography>
              <StatusPill
                value={focus.overdue ? "OVERDUE" : focus.status}
                label={focus.overdue ? "overdue" : focus.status.toLowerCase().replaceAll("_", " ")}
              />
              <Typography sx={{ fontSize: 11.5, color: "#64748b", ml: "auto" }}>
                {hoursOld(focus.createdAt)}h since created
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 14, color: "#0f172a", fontWeight: 500, mb: 1.5 }}>
              {focus.subject}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="contained" onClick={() => navigate(focus.detailPath)}>
                View ticket
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ borderLeft: "3px solid #22c55e" }}>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 15, fontWeight: 700, color: "#15803d" }}>
                Nothing on your plate needs escalating right now.
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 13, color: "#64748b", mt: 0.5 }}>
              No overdue or critical-priority tickets assigned to you.
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Mini KPIs */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5 }}>
        <MiniStat label="Resolved today" value={resolvedToday} tone="good" />
        <MiniStat label="New overdue" value={newOverdue} tone={newOverdue > 0 ? "bad" : "neutral"} />
        <MiniStat label="Open P1 / P2" value={openP1P2} tone={openP1P2 > 0 ? "warn" : "neutral"} />
      </Box>

      {/* Trend sparkline */}
      <Card>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              Last 14 days
            </Typography>
            <Typography sx={{ fontSize: 11, color: "#64748b", ml: "auto" }}>
              Created vs resolved
            </Typography>
          </Stack>
          <Box sx={{ height: 140 }}>
            <BarChart
              dataset={chart}
              xAxis={[{ dataKey: "label", scaleType: "band" }]}
              series={[
                { dataKey: "created", label: "Created", color: "#1d4ed8" },
                { dataKey: "resolved", label: "Resolved", color: "#93c5fd" },
              ]}
              height={140}
              margin={{ left: 28, right: 12, top: 8, bottom: 28 }}
              hideLegend
            />
          </Box>
        </CardContent>
      </Card>

      {/* Waiting on client */}
      <Card>
        <CardContent sx={{ p: 2, pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <HourglassEmptyIcon sx={{ fontSize: 16, color: "#b45309" }} />
            <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
              Waiting on client
            </Typography>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#b45309", ml: "auto" }}>
              {waiting.length} item{waiting.length === 1 ? "" : "s"}
            </Typography>
          </Stack>
        </CardContent>
        <Divider />
        {waiting.length === 0 ? (
          <Typography sx={{ p: 2, fontSize: 13, color: "#64748b", textAlign: "center" }}>
            No tickets of yours are waiting on a client response.
          </Typography>
        ) : (
          waiting.map(t => (
            <Box
              key={`${t.kind}-${t.id}`}
              onClick={() => navigate(t.detailPath)}
              sx={{
                px: 2, py: 1.25, cursor: "pointer",
                borderBottom: "1px solid #f1f5f9",
                "&:last-child": { borderBottom: "none" },
                "&:hover": { bgcolor: "#f8fafc" },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                <TypeBadge kind={t.kind} />
                <Typography sx={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: "#475569" }}>
                  {t.reference}
                </Typography>
                <Typography sx={{ ml: "auto", fontSize: 11, color: "#b45309", fontWeight: 600 }}>
                  waiting {hoursOld(t.updatedAt)}h
                </Typography>
              </Stack>
              <Typography sx={{
                fontSize: 12.5, color: "#0f172a", fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {t.subject}
              </Typography>
            </Box>
          ))
        )}
      </Card>
    </Box>
  )
}
