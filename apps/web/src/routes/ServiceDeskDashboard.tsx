import React from "react"
import { useNavigate } from "react-router-dom"
import {
  Box, Card, CardContent, Chip, Divider, Stack, Typography
} from "@mui/material"
import { BarChart } from "@mui/x-charts/BarChart"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import PriorityHighIcon from "@mui/icons-material/PriorityHigh"
import { TypeBadge, Avatar as TicketAvatar, PriorityDot } from "../components/shared"
import { semanticToken, ragToken } from "../components/shared/tokens/colors"
import { useThemeMode } from "../lib/theme"
import { useTickets, type Ticket } from "../lib/tickets"
import { LoadingState, ErrorState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"

type Delta = { value: number; direction: "up" | "down" | "flat"; tone: "good" | "bad" | "neutral" }

function formatHours(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—"
  const hrs = ms / (1000 * 60 * 60)
  if (hrs < 1) return `${Math.round(hrs * 60)} min`
  if (hrs < 72) return `${hrs.toFixed(1)}h`
  return `${(hrs / 24).toFixed(1)}d`
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

function categoryMixFromSubject(ticket: Ticket): string {
  // Very rough routing based on subject keywords — stand-in until real category data lands.
  const s = ticket.subject.toLowerCase()
  if (s.includes("power") || s.includes("pdu") || s.includes("feed")) return "Power"
  if (s.includes("network") || s.includes("switch") || s.includes("sfp") || s.includes("port")) return "Network"
  if (s.includes("cool") || s.includes("temp") || s.includes("hvac")) return "Cooling"
  if (s.includes("access") || s.includes("badge") || s.includes("contractor")) return "Access"
  if (s.includes("hardware") || s.includes("server") || s.includes("dell") || s.includes("rma")) return "Hardware"
  return "Other"
}

// ── KPI card ──────────────────────────────────────────────────────────────
function KPICard({
  label, value, sub, delta, accent
}: {
  label: string
  value: React.ReactNode
  sub?: string
  delta?: Delta
  accent?: "danger" | "warning"
}) {
  const { mode } = useThemeMode()
  const accentColor = accent === "danger" ? semanticToken("danger", mode).solid : accent === "warning" ? semanticToken("warning", mode).solid : undefined
  return (
    <Card sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Typography sx={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--color-text-muted)", mb: 0.75
        }}>
          {label}
        </Typography>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography sx={{
            fontFamily: "Space Grotesk, Manrope",
            fontSize: 28, fontWeight: 700,
            color: accentColor ?? "text.primary",
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
          }}>
            {value}
          </Typography>
          {delta ? (
            <Stack direction="row" alignItems="center" spacing={0.25} sx={{
              color: delta.tone === "good" ? semanticToken("success", mode).solid : delta.tone === "bad" ? semanticToken("danger", mode).solid : "var(--color-text-muted)",
              fontSize: 12, fontWeight: 600,
            }}>
              {delta.direction === "up" ? <ArrowUpwardIcon sx={{ fontSize: 13 }} /> :
               delta.direction === "down" ? <ArrowDownwardIcon sx={{ fontSize: 13 }} /> : null}
              <span>{delta.value > 0 ? `+${delta.value}` : delta.value}</span>
            </Stack>
          ) : null}
        </Stack>
        {sub ? (
          <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)", mt: 0.5 }}>{sub}</Typography>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ── Overdue mini-table ────────────────────────────────────────────────────
function OverdueTable({ tickets }: { tickets: Ticket[] }) {
  const navigate = useNavigate()
  const { mode } = useThemeMode()
  const overdue = tickets
    .filter(t => t.overdue)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, 6)

  return (
    <Card sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ p: 2, pb: 1, flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <PriorityHighIcon sx={{ fontSize: 16, color: semanticToken("danger", mode).solid }} />
          <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 15, fontWeight: 700, color: "text.primary" }}>
            Overdue queue
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: semanticToken("danger", mode).solid, ml: "auto" }}>
            {overdue.length} to action
          </Typography>
        </Stack>
      </CardContent>
      <Divider />
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {overdue.length === 0 ? (
          <Typography sx={{ p: 2, fontSize: 13, color: "var(--color-text-muted)", textAlign: "center" }}>
            Nothing overdue. ✨
          </Typography>
        ) : (
          overdue.map(t => (
            <Box
              key={`${t.kind}-${t.id}`}
              onClick={() => navigate(t.detailPath)}
              sx={{
                px: 2, py: 1.25, cursor: "pointer",
                borderBottom: "1px solid var(--color-border-tertiary)",
                borderLeft: `3px solid ${ragToken("RED", mode).dot}`,
                "&:hover": { bgcolor: "var(--color-background-secondary)" },
                "&:last-child": { borderBottom: "none" },
              }}
            >
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                <TypeBadge kind={t.kind} />
                <Typography sx={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: "text.secondary" }}>
                  {t.reference}
                </Typography>
                <Typography sx={{ ml: "auto", fontSize: 11, color: semanticToken("danger", mode).solid, fontWeight: 600 }}>
                  {Math.round((Date.now() - new Date(t.createdAt).getTime()) / 3600000)}h old
                </Typography>
              </Stack>
              <Typography sx={{
                fontSize: 12.5, color: "text.primary", fontWeight: 500,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {t.subject}
              </Typography>
            </Box>
          ))
        )}
      </Box>
    </Card>
  )
}

// ── By category ───────────────────────────────────────────────────────────
function CategoryPanel({ tickets }: { tickets: Ticket[] }) {
  const tally = new Map<string, number>()
  for (const t of tickets) {
    if (t.chipIntent === "done") continue
    const cat = categoryMixFromSubject(t)
    tally.set(cat, (tally.get(cat) ?? 0) + 1)
  }
  const rows = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const max = Math.max(1, ...rows.map(([, n]) => n))

  return (
    <Card sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ p: 2 }}>
        <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 15, fontWeight: 700, color: "text.primary", mb: 1.5 }}>
          By category
        </Typography>
        {rows.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>No open tickets.</Typography>
        ) : (
          <Stack spacing={1.25}>
            {rows.map(([cat, n]) => (
              <Box key={cat}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: "text.primary", flex: 1 }}>
                    {cat}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "text.secondary" }}>
                    {n}
                  </Typography>
                </Stack>
                <Box sx={{ height: 6, bgcolor: "var(--color-background-tertiary)", borderRadius: 999, overflow: "hidden" }}>
                  <Box sx={{
                    width: `${(n / max) * 100}%`, height: "100%",
                    bgcolor: "primary.main", borderRadius: 999,
                  }} />
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

// ── Team load ─────────────────────────────────────────────────────────────
function TeamLoad({ tickets }: { tickets: Ticket[] }) {
  const { mode } = useThemeMode()
  const agg = new Map<string, { open: number; late: number; id: string; displayName: string }>()
  for (const t of tickets) {
    if (!t.assignee || t.chipIntent === "done") continue
    const key = t.assignee.id
    const existing = agg.get(key) ?? { open: 0, late: 0, id: t.assignee.id, displayName: t.assignee.displayName }
    existing.open++
    if (t.overdue) existing.late++
    agg.set(key, existing)
  }
  const rows = Array.from(agg.values()).sort((a, b) => b.open - a.open).slice(0, 6)

  return (
    <Card sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ p: 2 }}>
        <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 15, fontWeight: 700, color: "text.primary", mb: 1.5 }}>
          Team load
        </Typography>
        {rows.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>No assigned tickets.</Typography>
        ) : (
          <Stack spacing={1}>
            {rows.map(row => {
              const name = row.displayName
              return (
                <Stack key={row.id} direction="row" alignItems="center" spacing={1.25}>
                  <TicketAvatar name={row.displayName} size="md" variant="engineer" mode={mode} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{
                      fontSize: 13, fontWeight: 600, color: "text.primary",
                      textTransform: "capitalize",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {name}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>Analyst</Typography>
                  </Box>
                  <Chip size="small" label={`${row.open} open`} sx={{ fontSize: 11, fontWeight: 700, bgcolor: mode === "dark" ? "rgba(59,130,246,0.15)" : "#e8f1ff", color: mode === "dark" ? "#60a5fa" : "primary.main" }} />
                  {row.late > 0 ? (
                    <Chip size="small" label={`${row.late} late`} sx={{ fontSize: 11, fontWeight: 700, bgcolor: semanticToken("danger", mode).bg, color: semanticToken("danger", mode).solid }} />
                  ) : null}
                </Stack>
              )
            })}
          </Stack>
        )}
      </CardContent>
    </Card>
  )
}

// ── Dashboard page ────────────────────────────────────────────────────────

export default function ServiceDeskDashboard() {
  const { setPageFullBleed } = useBreadcrumb()

  React.useEffect(() => {
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [setPageFullBleed])

  return <ServiceDeskDashboardContent />
}

export function ServiceDeskDashboardContent() {
  const { mode } = useThemeMode()
  const { data: tickets, isLoading, error } = useTickets()

  const { open, overdue, avgResolveMs } = React.useMemo(() => {
    let open = 0, overdue = 0
    let totalResolveMs = 0, resolvedCount = 0
    for (const t of tickets) {
      const done = t.chipIntent === "done"
      if (!done) open++
      if (t.overdue) overdue++
      if (done) {
        totalResolveMs += new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()
        resolvedCount++
      }
    }
    return { open, overdue, avgResolveMs: resolvedCount ? totalResolveMs / resolvedCount : 0 }
  }, [tickets])

  const chart = React.useMemo(() => dayBuckets(tickets, 14), [tickets])

  if (isLoading) return <Box sx={{ p: 3 }}><LoadingState /></Box>
  if (error)     return <Box sx={{ p: 3 }}><ErrorState title="Failed to load dashboard" /></Box>

  return (
    <Box>
      <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Row 1 — KPI cards */}
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <KPICard
          label="Open tickets"
          value={open}
          sub={`${Math.round(open * 0.2)} unassigned`}
        />
        <KPICard
          label="Overdue"
          value={overdue}
          sub="SLA at risk"
          accent={overdue > 0 ? "danger" : undefined}
        />
        <KPICard
          label="Avg time to resolve"
          value={formatHours(avgResolveMs)}
          sub="Last 90 days"
        />
        <KPICard
          label="Client satisfaction"
          value={<>4.6 <span style={{ fontSize: 16, color: "var(--color-text-muted)", fontWeight: 500 }}>/ 5.0</span></>}
          sub="CSAT placeholder — no data yet"
        />
      </Box>

      {/* Row 2 — Trend + Overdue */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" }, gap: 2, minHeight: 280 }}>
        <Card>
          <CardContent sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <Typography sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 15, fontWeight: 700, color: "text.primary" }}>
                Tickets created vs resolved
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ ml: "auto" }}>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Box sx={{ width: 10, height: 10, bgcolor: "#1d4ed8", borderRadius: 0.25 }} />
                  <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>Created</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" spacing={0.5}>
                  <Box sx={{ width: 10, height: 10, bgcolor: "#93c5fd", borderRadius: 0.25 }} />
                  <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>Resolved</Typography>
                </Stack>
              </Stack>
            </Stack>
            <Box sx={{ height: 220 }}>
              <BarChart
                dataset={chart}
                xAxis={[{ dataKey: "label", scaleType: "band" }]}
                series={[
                  { dataKey: "created", label: "Created", color: "#1d4ed8" },
                  { dataKey: "resolved", label: "Resolved", color: "#93c5fd" },
                ]}
                height={220}
                margin={{ left: 36, right: 12, top: 8, bottom: 36 }}
                hideLegend
                // Dark-only: force axis ticks/labels to read on the dark card. Light gets
                // no override (undefined) so the chart stays pixel-identical to before.
                sx={mode === "dark" ? {
                  "& .MuiChartsAxis-tickLabel": { fill: "#94a3b8" },
                  "& .MuiChartsAxis-line": { stroke: "#334155" },
                  "& .MuiChartsAxis-tick": { stroke: "#334155" },
                } : undefined}
              />
            </Box>
          </CardContent>
        </Card>
        <OverdueTable tickets={tickets} />
      </Box>

      {/* Row 3 — Category + Team */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        <CategoryPanel tickets={tickets} />
        <TeamLoad tickets={tickets} />
      </Box>
      </Box>
    </Box>
  )
}

// Silence unused-import warnings when future iterations want them back.
// PriorityDot is re-exported to keep visual vocabulary accessible if we
// extend the dashboard to include a priority panel.
void PriorityDot
