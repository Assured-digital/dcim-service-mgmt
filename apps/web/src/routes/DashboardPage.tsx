import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, ButtonGroup, Card, CardContent,
  Divider, Grid, MenuItem, Stack, TextField,
  Typography, Chip
} from "@mui/material"
import { LineChart } from "@mui/x-charts/LineChart"
import FileDownloadIcon from "@mui/icons-material/FileDownload"
import TrendingUpIcon from "@mui/icons-material/TrendingUp"
import { LoadingState, ErrorState } from "../components/PageState"
import { StatusPill, semanticToken, slate, type ThemeMode } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import { SectionHeader } from "../components/shared/primitives/SectionHeader"
import { useTickets } from "../lib/tickets"
import { computeSlaStatus, type SlaFilter } from "../lib/serviceDeskQueue"
import {
  useMttrTrend, useSlaComplianceTrend, bucketForRange, formatDurationMs, msToHours
} from "../lib/metrics"
import { getSelectedClientId } from "../lib/scope"
import type { Site as InfraSite, Cabinet as InfraCabinet } from "../lib/infrastructure"

// ── One card system ─────────────────────────────────────────────────────────
// Every dashboard card shares ONE surface: paper ground, a single hairline border,
// one radius, flat (the theme's heavy MuiCard shadow is overridden locally — the
// theme itself is left untouched for other pages). Inner content padding is uniform.
const DASH_CARD_SX = {
  bgcolor: "background.paper",
  border: "0.5px solid",
  borderColor: "divider",
  borderRadius: "10px",
  boxShadow: "none",
  height: "100%",
} as const
const CARD_CONTENT_SX = { p: "18px", "&:last-child": { pb: "18px" } } as const

// ── Types ──────────────────────────────────────────────────────────────────
type SR = { id: string; status: string; createdAt: string; updatedAt: string; assigneeId?: string | null; assignee?: { id: string; displayName: string } | null }
type Task = { id: string; reference: string; title: string; status: string; priority: string; dueAt: string | null; createdAt: string; updatedAt: string; assigneeId?: string | null; assignee?: { id: string; displayName: string } | null }
type Risk = { id: string; status: string; reviewDate?: string | null; createdAt: string; updatedAt: string }
type Issue = { id: string; status: string; createdAt: string; updatedAt: string }
type Check = { id: string; reference: string; title: string; status: string; scheduledAt: string | null; createdAt: string; updatedAt: string; site?: { name: string } | null }

// ── Date helpers ───────────────────────────────────────────────────────────
function formatDateForInput(d: Date) {
  return d.toISOString().slice(0, 10)
}
function formatDateShort(value: string) {
  const d = new Date(value)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}
function inDateRange(value: string, dateFrom: string, dateTo: string) {
  const date = new Date(value)
  if (isNaN(date.getTime())) return false
  const from = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : null
  const to = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}
function getDateRangeFromPreset(preset: "7d" | "30d" | "90d" | "ytd") {
  const now = new Date()
  const to = formatDateForInput(now)
  if (preset === "ytd") return { from: `${now.getUTCFullYear()}-01-01`, to }
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90
  return { from: formatDateForInput(new Date(now.getTime() - 1000 * 60 * 60 * 24 * days)), to }
}
function isOverdue(dueAt: string | null) {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

// Build daily chart data: bucket items by created date within period
function buildChartData(
  items: { createdAt: string; updatedAt: string; status: string }[],
  dateFrom: string,
  dateTo: string,
  resolvedStatuses: string[]
) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`)
  const to = new Date(`${dateTo}T23:59:59.999Z`)
  const days: { date: string; opened: number; closed: number }[] = []

  const cursor = new Date(from)
  while (cursor <= to) {
    days.push({ date: formatDateShort(cursor.toISOString()), opened: 0, closed: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  const bucketByWeek = days.length > 60

  const getBucketLabel = (dateStr: string) => {
    const d = new Date(dateStr)
    if (bucketByWeek) {
      const weekStart = new Date(d)
      weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay())
      return formatDateShort(weekStart.toISOString())
    }
    return formatDateShort(d.toISOString())
  }

  const buckets = new Map<string, { opened: number; closed: number }>()

  const cur = new Date(from)
  while (cur <= to) {
    const label = getBucketLabel(cur.toISOString())
    if (!buckets.has(label)) buckets.set(label, { opened: 0, closed: 0 })
    cur.setUTCDate(cur.getUTCDate() + (bucketByWeek ? 7 : 1))
  }

  items.forEach(item => {
    if (inDateRange(item.createdAt, dateFrom, dateTo)) {
      const label = getBucketLabel(item.createdAt)
      const b = buckets.get(label)
      if (b) b.opened++
    }
    if (resolvedStatuses.includes(item.status) && inDateRange(item.updatedAt, dateFrom, dateTo)) {
      const label = getBucketLabel(item.updatedAt)
      const b = buckets.get(label)
      if (b) b.closed++
    }
  })

  return Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }))
}

// ── Zone heading ────────────────────────────────────────────────────────────
// A subtle uppercase label introducing each zone (not a page title — the app's
// convention is no page titles; the breadcrumb identifies the page). Anchored
// treatment: the label sits inline with a hairline rule that runs to the right
// edge of the content area, so it reads as a section header rather than floating
// text. The `&&` selector outranks the parent Stack's child-margin spacing to give
// a consistent rhythm — a modest gap above and ~12px below before the cards —
// matched across both zones (the first zone keeps its natural page-top above).
function ZoneHeading({ label, first }: { label: string; first?: boolean }) {
  return (
    <Box sx={{
      display: "flex", alignItems: "center", gap: "12px",
      "&&": { mt: first ? 0 : "12px", mb: "-8px" },
    }}>
      <Typography sx={{
        fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
        color: "var(--color-text-secondary)", whiteSpace: "nowrap",
      }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 0, borderTop: "0.5px solid", borderColor: "var(--color-border-tertiary)" }} />
    </Box>
  )
}

// ── Metric cell (navigable sub-tile) ────────────────────────────────────────
// Each counter is its own distinct, clickable unit: at rest it sits on a faint
// filled ground (--color-background-secondary), rounded + padded, so it reads as
// a tile even before hover; hover deepens the fill (--color-background-tertiary,
// the app's standard interactive fill). Colour discipline — the VALUE carries
// status colour only (danger/warning/success when present); neutral metrics and
// zero values stay text.primary. The tile ground is always neutral.
type MetricIntent = "danger" | "warning" | "success" | "neutral"
interface MetricCellProps { label: string; value: number; intent?: MetricIntent; onClick?: () => void }

function MetricCell({ label, value, intent = "neutral", onClick }: MetricCellProps) {
  const { mode } = useThemeMode()
  const active = value > 0
  const valueColor = intent === "neutral" || !active ? "text.primary" : semanticToken(intent, mode).solid
  return (
    <Box
      onClick={onClick}
      sx={{
        flex: 1, minWidth: 0,
        bgcolor: "var(--color-background-secondary)",
        borderRadius: "8px",
        px: "11px", py: "10px",
        cursor: onClick ? "pointer" : "default",
        transition: "background-color 0.12s",
        "&:hover": onClick ? { bgcolor: "var(--color-background-tertiary)" } : {}
      }}
    >
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "5px" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: valueColor }}>
        {value}
      </Typography>
    </Box>
  )
}

// ── Count-card chrome: status accent stripe, content-sized ──────────────────
// Stripe colour means STATUS: red when an attention metric is present (a danger
// cell with value > 0), else a faint neutral (--color-border-secondary) — colour
// is never decorative. Cards size to their content (height auto, overriding the
// shared height:100%) so short cards don't pool dead space at the top. Hover lives
// on the counter sub-tiles, not the card.
function stripeColorFor(cells: MetricCellProps[], mode: ThemeMode): string {
  if (cells.some(c => c.intent === "danger" && c.value > 0)) return semanticToken("danger", mode).solid
  return "var(--color-border-secondary)"
}

function countCardSx(stripe: string) {
  return {
    ...DASH_CARD_SX,
    height: "auto",
    borderTopWidth: "2px",
    borderTopStyle: "solid",
    borderTopColor: stripe,
  } as const
}

// ── Summary card (titled card of 1–2 metric cells) ──────────────────────────
function MetricCard({ title, cells }: { title: string; cells: MetricCellProps[] }) {
  const { mode } = useThemeMode()
  const stripe = stripeColorFor(cells, mode)
  return (
    <Card variant="outlined" sx={countCardSx(stripe)}>
      <CardContent sx={CARD_CONTENT_SX}>
        <SectionHeader label={title} />
        <Box sx={{ display: "flex", gap: "10px", mt: "12px" }}>
          {cells.map((c, i) => <MetricCell key={i} {...c} />)}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── SLA compliance widget (HERO) ───────────────────────────────────────────
// Per selected client: SLA health of OPEN Service Requests + Incidents only.
// Buckets (and the click-through queue filter) share computeSlaStatus — single
// source of truth for the thresholds. Click a tile → the queue, pre-filtered.
function SlaComplianceCard() {
  const { mode } = useThemeMode()
  const navigate = useNavigate()
  const { data: tickets, isLoading, error } = useTickets()

  const buckets = React.useMemo(() => {
    let breached = 0, dueSoon = 0, onTrack = 0, none = 0
    for (const t of tickets) {
      if (t.kind !== "SR" && t.kind !== "INC") continue
      if (t.chipIntent === "done") continue                 // open SR + INC only
      switch (computeSlaStatus(t.dueAt, false)) {
        case "breached":  breached++; break
        case "due-soon":  dueSoon++;  break
        case "on-track":  onTrack++;  break
        default:          none++;     break                 // no due date
      }
    }
    return { breached, dueSoon, onTrack, none }
  }, [tickets])

  const { breached, dueSoon, onTrack, none } = buckets
  const withDue = breached + dueSoon + onTrack
  const pctOnTrack = withDue > 0 ? Math.round((onTrack / withDue) * 100) : 0

  const danger = semanticToken("danger", mode).solid
  const warning = semanticToken("warning", mode).solid
  const success = semanticToken("success", mode).solid
  const track = mode === "dark" ? slate[700] : slate[200]
  // Stripe is status-driven: green when nothing is breached, red on any breach.
  const slaStripe = breached > 0 ? danger : success

  const go = (sla: SlaFilter) => navigate(`/service-desk?sla=${sla}`)

  return (
    <Card variant="outlined" sx={countCardSx(slaStripe)}>
      <CardContent sx={CARD_CONTENT_SX}>
        <SectionHeader
          label="SLA compliance"
          tooltip="Open service requests & incidents, by SLA due date for the selected client."
        />
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", mt: "3px" }}>
          Service Requests &amp; Incidents · resolution
        </Typography>

        {isLoading ? (
          <Box sx={{ mt: "12px" }}><LoadingState /></Box>
        ) : error ? (
          <Box sx={{ mt: "12px" }}><ErrorState title="Failed to load SLA data" /></Box>
        ) : (
          <>
            {/* Compliance headline + segmented bar (no legend strip — tiles carry counts) */}
            <Stack direction="row" alignItems="baseline" gap="8px" sx={{ mt: "14px", mb: "8px" }}>
              <Typography sx={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>
                {pctOnTrack}%
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                on track
              </Typography>
            </Stack>

            <Box sx={{ display: "flex", height: 10, borderRadius: "5px", overflow: "hidden", bgcolor: track }}>
              {onTrack > 0 ? <Box sx={{ flexGrow: onTrack, bgcolor: success }} /> : null}
              {dueSoon > 0 ? <Box sx={{ flexGrow: dueSoon, bgcolor: warning }} /> : null}
              {breached > 0 ? <Box sx={{ flexGrow: breached, bgcolor: danger }} /> : null}
            </Box>

            {/* Clickable sub-tiles → pre-filtered Service Desk queue */}
            <Box sx={{ display: "flex", gap: "10px", mt: "16px" }}>
              <MetricCell label="Breached" value={breached} intent="danger" onClick={() => go("breached")} />
              <MetricCell label="Due soon" value={dueSoon} intent="warning" onClick={() => go("due-soon")} />
              <MetricCell label="On track" value={onTrack} intent="success" onClick={() => go("on-track")} />
            </Box>

            {/* Honest caveat: tickets with no due date sit outside the %. Kept
                visible but de-emphasised, below a hairline. */}
            {none > 0 ? (
              <>
                <Divider sx={{ mt: "14px", mb: "10px" }} />
                <Typography sx={{ fontSize: 11.5, color: "text.tertiary" }}>
                  {none === 1 ? "1 ticket has" : `${none} tickets have`} no due date set
                </Typography>
              </>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Open tickets card ───────────────────────────────────────────────────────
// Open SR / INC / CHG counts for the selected client, from the same unified
// ticket feed the SLA widget uses (react-query dedupes — no extra fetch). Each
// count clicks through to the queue pre-filtered by type. Neutral colour: these
// are workload counts, not a status to flag.
function OpenTicketsCard() {
  const navigate = useNavigate()
  const { mode } = useThemeMode()
  const { data: tickets, isLoading, error } = useTickets()

  const counts = React.useMemo(() => {
    let sr = 0, inc = 0, chg = 0
    for (const t of tickets) {
      if (t.chipIntent === "done") continue
      if (t.kind === "SR") sr++
      else if (t.kind === "INC") inc++
      else if (t.kind === "CHG") chg++
    }
    return { sr, inc, chg }
  }, [tickets])

  // Open-ticket counts are workload, not a status — always a faint neutral stripe.
  const stripe = stripeColorFor([], mode)

  return (
    <Card variant="outlined" sx={countCardSx(stripe)}>
      <CardContent sx={CARD_CONTENT_SX}>
        <SectionHeader
          label="Open tickets"
          tooltip="Open service requests, incidents and changes for the selected client."
        />
        {isLoading ? (
          <Box sx={{ mt: "12px" }}><LoadingState /></Box>
        ) : error ? (
          <Box sx={{ mt: "12px" }}><ErrorState title="Failed to load tickets" /></Box>
        ) : (
          <Box sx={{ display: "flex", gap: "10px", mt: "14px" }}>
            <MetricCell label="Requests" value={counts.sr} onClick={() => navigate("/service-desk?type=sr")} />
            <MetricCell label="Incidents" value={counts.inc} onClick={() => navigate("/service-desk?type=inc")} />
            <MetricCell label="Changes" value={counts.chg} onClick={() => navigate("/service-desk?type=chg")} />
          </Box>
        )}
      </CardContent>
    </Card>
  )
}

// ── Trend card with area chart (de-emphasised, supporting) ─────────────────
// Smaller figures + a single neutral line (the per-category hue was decorative).
// Charts/controls/export stay fully functional — this is supporting context.
function TrendCard({ label, opened, closed, closedLabel, chartData, onExport, exporting }: {
  label: string; opened: number; closed: number; closedLabel: string
  chartData: { date: string; opened: number; closed: number }[]
  onExport?: () => void; exporting?: boolean
}) {
  const { mode } = useThemeMode()
  const total = opened + closed
  const pct = total > 0 ? Math.round((closed / total) * 100) : 0
  const edge = mode === "dark" ? slate[600] : slate[300]
  const line = mode === "dark" ? slate[400] : slate[500]   // neutral, de-emphasised

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: "8px" }}>
        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>{label}</Typography>
        {onExport ? (
          <Box
            onClick={onExport}
            sx={{
              display: "flex", alignItems: "center", gap: "4px",
              px: "7px", py: "3px", borderRadius: "5px", cursor: "pointer",
              border: "1px solid", borderColor: "divider", color: "var(--color-text-muted)",
              "&:hover": { bgcolor: "var(--color-background-secondary)", borderColor: edge }
            }}
          >
            <FileDownloadIcon sx={{ fontSize: 12 }} />
            <Typography sx={{ fontSize: 11, fontWeight: 500 }}>{exporting ? "..." : "Export"}</Typography>
          </Box>
        ) : null}
      </Stack>

      <Stack direction="row" gap="16px" sx={{ mb: "8px" }}>
        <Box>
          <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Opened</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", lineHeight: 1 }}>{opened}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>{closedLabel}</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", lineHeight: 1 }}>{closed}</Typography>
        </Box>
        <Box sx={{ ml: "auto", textAlign: "right" }}>
          <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Rate</Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", lineHeight: 1 }}>{pct}%</Typography>
        </Box>
      </Stack>

      <Box sx={{ height: 60, mx: "-8px" }}>
        <LineChart
          xAxis={[{
            data: chartData.map((_, i) => i),
            tickInterval: [],
            disableLine: true,
            disableTicks: true
          }]}
          series={[
            {
              data: chartData.map(d => d.opened),
              label: "Opened",
              color: line,
              showMark: false,
              area: true
            }
          ]}
          height={60}
          margin={{ top: 8, right: 8, left: -40, bottom: 8 }}
          sx={{
            "& .MuiAreaElement-root": { fillOpacity: 0.1 },
            "& .MuiChartsAxis-root": { display: "none" },
            "& .MuiChartsGrid-root": { "& line": { stroke: "var(--color-background-tertiary)" } }
          }}
          hideLegend
        />
      </Box>
      {chartData.length > 1 ? (
        <Stack direction="row" justifyContent="space-between" sx={{ px: "4px", mt: "-4px" }}>
          <Typography sx={{ fontSize: 9, color: edge }}>{chartData[0]?.date}</Typography>
          <Typography sx={{ fontSize: 9, color: edge }}>{chartData[chartData.length - 1]?.date}</Typography>
        </Stack>
      ) : null}
    </Box>
  )
}

// ── Trend chart chrome (shared by the two metrics widgets) ─────────────────
// A real (non-sparkline) line over the period, with hidden axes and first/last date
// labels below — matching the dashboard's quiet chart language. `points` may contain
// nulls for empty buckets; the line breaks there (connectNulls off) so missing data
// reads as a gap, never an invented straight line.
function MetricLineChart({ points, labels, color, valueFormatter, yMax }: {
  points: (number | null)[]; labels: string[]; color: string
  valueFormatter?: (v: number | null) => string; yMax?: number
}) {
  const { mode } = useThemeMode()
  const edge = mode === "dark" ? slate[600] : slate[300]
  return (
    <>
      <Box sx={{ height: 120, mx: "-8px" }}>
        <LineChart
          xAxis={[{ data: points.map((_, i) => i), tickInterval: [], disableLine: true, disableTicks: true }]}
          yAxis={[{ min: 0, ...(yMax != null ? { max: yMax } : {}), disableLine: true, disableTicks: true }]}
          series={[{ data: points, color, showMark: true, area: true, connectNulls: false, valueFormatter: (v) => (valueFormatter ? valueFormatter(v as number | null) : String(v)) }]}
          height={120}
          margin={{ top: 10, right: 8, left: -20, bottom: 8 }}
          sx={{
            "& .MuiAreaElement-root": { fillOpacity: 0.08 },
            "& .MuiChartsAxis-root": { display: "none" },
            "& .MuiChartsGrid-root": { "& line": { stroke: "var(--color-background-tertiary)" } }
          }}
          hideLegend
        />
      </Box>
      {labels.length > 1 ? (
        <Stack direction="row" justifyContent="space-between" sx={{ px: "4px", mt: "-2px" }}>
          <Typography sx={{ fontSize: 9, color: edge }}>{labels[0]}</Typography>
          <Typography sx={{ fontSize: 9, color: edge }}>{labels[labels.length - 1]}</Typography>
        </Stack>
      ) : null}
    </>
  )
}

// ── MTTR trend widget ───────────────────────────────────────────────────────
// Mean time to resolve (SR + INC) over the selected period, from the honest server
// `resolvedAt` aggregate. Headline = overall mean + median; the denominator ("N
// resolved") is always shown so the figure is never mistaken for total coverage.
function MttrTrendCard({ dateFrom, dateTo, assigneeId }: { dateFrom: string; dateTo: string; assigneeId: string }) {
  const { mode } = useThemeMode()
  const bucket = bucketForRange(dateFrom, dateTo)
  const { data, isLoading, error } = useMttrTrend({ from: dateFrom, to: dateTo, bucket, assigneeId })
  const line = mode === "dark" ? slate[400] : slate[500]

  return (
    <Card variant="outlined" sx={DASH_CARD_SX}>
      <CardContent sx={CARD_CONTENT_SX}>
        <SectionHeader
          label="Resolution time"
          tooltip="Mean time to resolve Service Requests & Incidents, by resolution date, for the selected client. Based only on records with a recorded resolution time."
        />
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", mt: "3px" }}>
          Service Requests &amp; Incidents · time to resolve
        </Typography>

        {isLoading ? (
          <Box sx={{ mt: "12px" }}><LoadingState /></Box>
        ) : error ? (
          <Box sx={{ mt: "12px" }}><ErrorState title="Failed to load resolution metrics" /></Box>
        ) : !data || data.totalResolved === 0 ? (
          <Box sx={{ mt: "18px", mb: "8px" }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No resolutions recorded in this period.</Typography>
            <Typography sx={{ fontSize: 11.5, color: "text.tertiary", mt: "4px" }}>
              Resolution time is captured when a record is resolved or closed — older records may not have it yet.
            </Typography>
          </Box>
        ) : (
          <>
            <Stack direction="row" gap="18px" sx={{ mt: "14px", mb: "10px" }} alignItems="baseline">
              <Box>
                <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Mean</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>
                  {formatDurationMs(data.overallMeanMs)}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Median</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: "text.secondary" }}>
                  {formatDurationMs(data.overallMedianMs)}
                </Typography>
              </Box>
              <Box sx={{ ml: "auto", textAlign: "right" }}>
                <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Resolved</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>
                  {data.totalResolved}
                </Typography>
              </Box>
            </Stack>
            <MetricLineChart
              points={data.buckets.map(b => msToHours(b.meanMs))}
              labels={data.buckets.map(b => formatDateShort(b.bucketStart))}
              color={line}
              valueFormatter={(v) => (v == null ? "—" : `${v}h`)}
            />
            <Typography sx={{ fontSize: 10.5, color: "text.tertiary", mt: "8px" }}>
              Mean hours to resolve, per {bucket}. Based on {data.totalResolved} resolved in period.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── SLA compliance trend widget ─────────────────────────────────────────────
// % of SR + INC resolved on-or-before their SLA due date, over the period (the
// historical counterpart to the point-in-time SLA card). Records with no due target
// are excluded from the % and surfaced separately, so the figure stays honest.
function SlaComplianceTrendCard({ dateFrom, dateTo, assigneeId }: { dateFrom: string; dateTo: string; assigneeId: string }) {
  const { mode } = useThemeMode()
  const bucket = bucketForRange(dateFrom, dateTo)
  const { data, isLoading, error } = useSlaComplianceTrend({ from: dateFrom, to: dateTo, bucket, assigneeId })
  const success = semanticToken("success", mode).solid

  const judged = data ? data.overallMet + data.overallBreached : 0
  const pctMet = judged > 0 ? Math.round((data!.overallMet / judged) * 100) : 0

  return (
    <Card variant="outlined" sx={DASH_CARD_SX}>
      <CardContent sx={CARD_CONTENT_SX}>
        <SectionHeader
          label="SLA compliance trend"
          tooltip="Share of Service Requests & Incidents resolved within their SLA due date, by resolution date. Records with no due target are excluded."
        />
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", mt: "3px" }}>
          Service Requests &amp; Incidents · % resolved within SLA
        </Typography>

        {isLoading ? (
          <Box sx={{ mt: "12px" }}><LoadingState /></Box>
        ) : error ? (
          <Box sx={{ mt: "12px" }}><ErrorState title="Failed to load SLA compliance" /></Box>
        ) : !data || judged === 0 ? (
          <Box sx={{ mt: "18px", mb: "8px" }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No resolved records with an SLA due target in this period.</Typography>
            {data && data.noDueTarget > 0 ? (
              <Typography sx={{ fontSize: 11.5, color: "text.tertiary", mt: "4px" }}>
                {data.noDueTarget} resolved {data.noDueTarget === 1 ? "record has" : "records have"} no due date set.
              </Typography>
            ) : null}
          </Box>
        ) : (
          <>
            <Stack direction="row" alignItems="baseline" gap="8px" sx={{ mt: "14px", mb: "10px" }}>
              <Typography sx={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>{pctMet}%</Typography>
              <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>resolved within SLA</Typography>
            </Stack>
            <Box sx={{ display: "flex", gap: "10px", mb: "12px" }}>
              <MetricCell label="Within SLA" value={data.overallMet} intent="success" />
              <MetricCell label="Breached" value={data.overallBreached} intent="danger" />
            </Box>
            <MetricLineChart
              points={data.buckets.map(b => (b.total > 0 ? Math.round((b.met / b.total) * 100) : null))}
              labels={data.buckets.map(b => formatDateShort(b.bucketStart))}
              color={success}
              valueFormatter={(v) => (v == null ? "—" : `${v}%`)}
              yMax={100}
            />
            <Typography sx={{ fontSize: 10.5, color: "text.tertiary", mt: "8px" }}>
              % resolved within SLA, per {bucket}. Based on {judged} with a due target
              {data.noDueTarget > 0 ? ` · ${data.noDueTarget} excluded (no due date)` : ""}.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Recent row ─────────────────────────────────────────────────────────────
function RecentRow({ type, reference, title, status, updatedAt, onClick }: {
  type: string; reference: string; title: string; status: string; updatedAt: string; onClick: () => void
}) {
  const ago = (() => {
    const diff = Date.now() - new Date(updatedAt).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  })()
  const { mode } = useThemeMode()
  // Type chips: a neutral tag per kind — the chip identifies the record type, it is
  // not a status, so it stays neutral (status colour lives on the StatusPill).
  const neutralChip = { bg: "var(--color-background-tertiary)", color: mode === "dark" ? slate[300] : slate[600] }
  return (
    <Box onClick={onClick} sx={{
      display: "flex", alignItems: "center", gap: "10px",
      py: "9px", cursor: "pointer",
      borderBottom: "1px solid", borderColor: "var(--color-background-tertiary)", "&:last-child": { borderBottom: "none" },
      "&:hover .recent-title": { color: "primary.main" }
    }}>
      <Chip label={type} size="small" sx={{ fontSize: 10, fontWeight: 600, flexShrink: 0, bgcolor: neutralChip.bg, color: neutralChip.color, borderRadius: "4px", height: 18 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography className="recent-title" sx={{ fontSize: 13, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.1s" }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>{reference}</Typography>
      </Box>
      <Stack direction="row" alignItems="center" gap="8px" sx={{ flexShrink: 0 }}>
        <StatusPill value={status} label={status.toLowerCase().replace(/_/g, " ")} size="sm" />
        <Typography sx={{ fontSize: 11, color: "text.tertiary", minWidth: 36, textAlign: "right" }}>{ago}</Typography>
      </Stack>
    </Box>
  )
}

// ── Infrastructure band (Zone 2) ─────────────────────────────────────────────
// Per-client DCIM glance: Sites / Cabinets / Assets counts + a short sites list.
// Everything derives from the existing GET /sites call (each site carries its full
// cabinets[] array and a _count of assets) — NO assets are fetched. Keyed on the
// selected client so it refetches on client switch; the x-client-id interceptor
// injects scope automatically. The asset total sums each site's _count.assets, so
// it counts SITED assets only (an asset with no site is excluded) — the cell is
// labelled accordingly so the number is never read as a true org-wide total.
type InfraSiteRow = InfraSite & { cabinets: InfraCabinet[]; _count: { assets: number; checks: number } }

function pluralCabinets(n: number) {
  return `${n} ${n === 1 ? "cabinet" : "cabinets"}`
}

function SiteListRow({ name, cabinets, onClick }: { name: string; cabinets: number; onClick: () => void }) {
  return (
    <Box onClick={onClick} sx={{
      display: "flex", alignItems: "center", gap: "10px",
      py: "9px", cursor: "pointer",
      borderBottom: "1px solid", borderColor: "var(--color-background-tertiary)", "&:last-child": { borderBottom: "none" },
      "&:hover .site-name": { color: "primary.main" }
    }}>
      <Typography className="site-name" sx={{ flex: 1, minWidth: 0, fontSize: 13, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.1s" }}>
        {name}
      </Typography>
      <Typography sx={{ fontSize: 11, color: "text.tertiary", flexShrink: 0 }}>{pluralCabinets(cabinets)}</Typography>
    </Box>
  )
}

function InfrastructureCard() {
  const { mode } = useThemeMode()
  const navigate = useNavigate()
  const clientId = getSelectedClientId() ?? "self"

  const { data, isLoading, error } = useQuery({
    queryKey: ["infrastructure", clientId],
    queryFn: async () => (await api.get<InfraSiteRow[]>("/sites")).data,
  })

  const sites = data ?? []
  const totalSites = sites.length
  const totalCabinets = sites.reduce((sum, s) => sum + s.cabinets.length, 0)
  const totalAssets = sites.reduce((sum, s) => sum + s._count.assets, 0)

  const siteRows = sites
    .map(s => ({ id: s.id, name: s.name, cabinets: s.cabinets.length }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const visibleRows = siteRows.slice(0, 5)
  const moreCount = siteRows.length - visibleRows.length

  // Counts are informational, not status — neutral cells yield a neutral stripe.
  const cells: MetricCellProps[] = [
    { label: "Sites", value: totalSites },
    { label: "Cabinets", value: totalCabinets },
    { label: "Assets (sited)", value: totalAssets },
  ]
  const stripe = stripeColorFor(cells, mode)

  return (
    <Card variant="outlined" sx={countCardSx(stripe)}>
      <CardContent sx={CARD_CONTENT_SX}>
        <SectionHeader
          label="Infrastructure"
          action={
            <Button size="small" variant="text" onClick={() => navigate("/asset-hierarchy")}
              sx={{ fontSize: 11, fontWeight: 600, color: "primary.main", minWidth: 0, px: "4px" }}>
              View all
            </Button>
          }
        />

        <Box sx={{ display: "flex", gap: "10px", mt: "12px" }}>
          {cells.map((c, i) => <MetricCell key={i} {...c} />)}
        </Box>
        <Typography sx={{ fontSize: 10, color: "var(--color-text-muted)", mt: "6px" }}>
          Sited assets only — excludes any unplaced assets.
        </Typography>

        <Box sx={{ mt: "14px" }}>
          {isLoading ? (
            <Typography variant="body2" color="text.secondary">Loading…</Typography>
          ) : error ? (
            <Typography variant="body2" color="text.secondary">Couldn’t load sites.</Typography>
          ) : siteRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No sites yet.</Typography>
          ) : (
            <>
              {visibleRows.map(s => (
                <SiteListRow key={s.id} name={s.name} cabinets={s.cabinets}
                  onClick={() => navigate(`/asset-hierarchy/${s.id}`)} />
              ))}
              {moreCount > 0 ? (
                <Typography sx={{ fontSize: 11, color: "text.tertiary", pt: "9px" }}>
                  +{moreCount} more
                </Typography>
              ) : null}
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()

  const defaultRange = getDateRangeFromPreset("30d")
  const [dateFrom, setDateFrom] = React.useState(defaultRange.from)
  const [dateTo, setDateTo] = React.useState(defaultRange.to)
  const [assigneeId, setAssigneeId] = React.useState("")
  const [activePreset, setActivePreset] = React.useState<"7d" | "30d" | "90d" | "ytd">("30d")
  const [isExporting, setIsExporting] = React.useState<string | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────
  const srs = useQuery({ queryKey: ["srs"], queryFn: async () => (await api.get<SR[]>("/service-requests")).data })
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: async () => (await api.get<Task[]>("/tasks")).data })
  const risks = useQuery({ queryKey: ["risks"], queryFn: async () => (await api.get<Risk[]>("/risks")).data })
  const issues = useQuery({ queryKey: ["issues"], queryFn: async () => (await api.get<Issue[]>("/issues")).data })
  const checks = useQuery({ queryKey: ["checks"], queryFn: async () => (await api.get<Check[]>("/checks")).data })
  const isLoading = srs.isLoading || tasks.isLoading || risks.isLoading || issues.isLoading || checks.isLoading
  const hasError = !!(srs.error || tasks.error || risks.error || issues.error || checks.error)

  // ── Assignees (Trend filter) ─────────────────────────────────────────────
  const assignees = React.useMemo(() => {
    const byId = new Map<string, { id: string; displayName: string }>()
    ;[...(srs.data ?? []), ...(tasks.data ?? [])].forEach(item => {
      if (item.assignee?.id) byId.set(item.assignee.id, item.assignee)
    })
    return Array.from(byId.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [srs.data, tasks.data])

  function applyAssignee<T extends { assigneeId?: string | null }>(items: T[]) {
    return assigneeId ? items.filter(x => x.assigneeId === assigneeId) : items
  }

  // Trend is assignee-scoped (the filter lives with it, in Zone 2).
  const filteredSrs = applyAssignee(srs.data ?? [])
  const filteredTasks = applyAssignee(tasks.data ?? [])

  // ── Zone-1 operational counts (NOT assignee-filtered — a Zone-2 control must
  //    not silently move a Zone-1 glance number) ─────────────────────────────
  const openRisks = (risks.data ?? []).filter(x => !["ACCEPTED", "CLOSED"].includes(x.status)).length
  const reviewSoonCutoff = Date.now() + 7 * 24 * 60 * 60 * 1000
  const risksReviewDue = (risks.data ?? []).filter(
    x => !["ACCEPTED", "CLOSED"].includes(x.status) && x.reviewDate && new Date(x.reviewDate).getTime() <= reviewSoonCutoff
  ).length
  const openIssues = (issues.data ?? []).filter(x => !["RESOLVED", "CLOSED"].includes(x.status)).length
  const openTasks = (tasks.data ?? []).filter(x => x.status !== "DONE").length
  const overdueChecks = (checks.data ?? []).filter(c => !["COMPLETED", "CLOSED", "CANCELLED"].includes(c.status) && isOverdue(c.scheduledAt))
  const pendingReviewChecks = (checks.data ?? []).filter(x => x.status === "PENDING_REVIEW").length

  // ── Trend data (period-filtered) ───────────────────────────────────────
  const srInPeriod = filteredSrs.filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const srClosedInPeriod = filteredSrs.filter(x => ["COMPLETED", "CLOSED"].includes(x.status) && inDateRange(x.updatedAt, dateFrom, dateTo))
  const risksInPeriod = (risks.data ?? []).filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const risksClosed = (risks.data ?? []).filter(x => ["ACCEPTED", "CLOSED"].includes(x.status) && inDateRange(x.updatedAt, dateFrom, dateTo))
  const issuesInPeriod = (issues.data ?? []).filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const issuesClosed = (issues.data ?? []).filter(x => ["RESOLVED", "CLOSED"].includes(x.status) && inDateRange(x.updatedAt, dateFrom, dateTo))
  const tasksInPeriod = filteredTasks.filter(x => inDateRange(x.createdAt, dateFrom, dateTo))
  const tasksDone = filteredTasks.filter(x => x.status === "DONE" && inDateRange(x.updatedAt, dateFrom, dateTo))

  // ── Chart data ─────────────────────────────────────────────────────────
  const srChart = buildChartData(filteredSrs, dateFrom, dateTo, ["COMPLETED", "CLOSED"])
  const riChart = buildChartData([...(risks.data ?? []), ...(issues.data ?? [])], dateFrom, dateTo, ["ACCEPTED", "CLOSED", "RESOLVED"])
  const taskChart = buildChartData(filteredTasks, dateFrom, dateTo, ["DONE"])

  // ── Recent activity ────────────────────────────────────────────────────
  const recentItems = [
    ...(srs.data ?? []).map(x => ({ kind: "SR", id: x.id, reference: "", title: `Service request · ${x.status}`, status: x.status, updatedAt: x.updatedAt })),
    ...(tasks.data ?? []).map(x => ({ kind: "TASK", id: x.id, reference: x.reference, title: x.title, status: x.status, updatedAt: x.updatedAt })),
    ...(checks.data ?? []).map(x => ({ kind: "CHECK", id: x.id, reference: x.reference, title: x.title, status: x.status, updatedAt: x.updatedAt })),
    ...(risks.data ?? []).map(x => ({ kind: "RISK", id: x.id, reference: "", title: `Risk · ${x.status}`, status: x.status, updatedAt: x.updatedAt }))
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6)

  // ── Export ─────────────────────────────────────────────────────────────
  async function exportCsv(kind: "service-requests" | "tasks") {
    setIsExporting(kind)
    try {
      const res = await api.get<Blob>(`/${kind}/export`, {
        params: { dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, assigneeId: assigneeId || undefined },
        responseType: "blob"
      })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8;" }))
      const a = document.createElement("a")
      a.href = url; a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } finally { setIsExporting(null) }
  }

  function applyPreset(preset: "7d" | "30d" | "90d" | "ytd") {
    const range = getDateRangeFromPreset(preset)
    setDateFrom(range.from); setDateTo(range.to); setActivePreset(preset)
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Box>
      {isLoading ? <LoadingState label="Loading dashboard..." /> : null}
      {hasError ? <ErrorState title="Failed to load dashboard data" /> : null}

      {!isLoading && !hasError ? (
        <Stack spacing="20px">

          {/* ══ ZONE 1 · OPERATIONAL ═══════════════════════════════════════ */}
          <ZoneHeading label="Operational" first />

          {/* Row A — SLA compliance (hero) + Open tickets */}
          <Grid container spacing="16px">
            <Grid item xs={12} md={7}><SlaComplianceCard /></Grid>
            <Grid item xs={12} md={5}><OpenTicketsCard /></Grid>
          </Grid>

          {/* Row B — Needs-attention summary cards */}
          <Grid container spacing="16px">
            <Grid item xs={12} sm={4}>
              {/* FLAG: /checks has no per-status URL filter today — both counters land
                  on the unfiltered list. Wire to ?status=overdue / ?status=pending-review
                  if/when ChecksPage gains query-param filtering. */}
              <MetricCard
                title="Checks"
                cells={[
                  { label: "Overdue", value: overdueChecks.length, intent: "danger", onClick: () => navigate("/checks") },
                  { label: "Pending review", value: pendingReviewChecks, intent: "warning", onClick: () => navigate("/checks") }
                ]}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="Risks"
                cells={[
                  { label: "Active", value: openRisks, intent: "danger", onClick: () => navigate("/risks-issues/risks?view=all") },
                  { label: "Review due", value: risksReviewDue, intent: "warning", onClick: () => navigate("/risks-issues/risks?view=review_due") }
                ]}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="Issues & tasks"
                cells={[
                  { label: "Open issues", value: openIssues, intent: "danger", onClick: () => navigate("/risks-issues/issues?view=all") },
                  { label: "Open tasks", value: openTasks, intent: "neutral", onClick: () => navigate("/service-desk?type=task") }
                ]}
              />
            </Grid>
          </Grid>

          {/* Light section divider between zones */}
          <Divider />

          {/* ══ ZONE 2 · CLIENT ════════════════════════════════════════════ */}
          <ZoneHeading label="Client" />

          {/* Part B (Infrastructure) + Part C (Contacts) cards: a row of two
              half-width cards above the trend & activity row. Contacts (Part C)
              fills the right half later. */}
          <Grid container spacing="16px">
            <Grid item xs={12} md={6}>
              <InfrastructureCard />
            </Grid>
          </Grid>

          {/* Row C — de-emphasised Trend Snapshot + Recent Activity */}
          <Grid container spacing="16px">
            <Grid item xs={12} md={7}>
              <Card variant="outlined" sx={DASH_CARD_SX}>
                <CardContent sx={CARD_CONTENT_SX}>

                  {/* Filter bar */}
                  <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ xs: "flex-start", md: "center" }} gap="12px" sx={{ mb: "18px" }}>
                    <SectionHeader
                      label="Trend Snapshot"
                      action={<TrendingUpIcon sx={{ fontSize: 15, color: "var(--color-text-secondary)" }} />}
                    />
                    <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
                      <TextField
                        select size="small" label="Assignee" value={assigneeId}
                        onChange={e => setAssigneeId(e.target.value)}
                        sx={{ minWidth: 150, "& .MuiInputBase-root": { fontSize: 12 } }}
                      >
                        <MenuItem value="" sx={{ fontSize: 12 }}>All assignees</MenuItem>
                        {assignees.map(a => (
                          <MenuItem key={a.id} value={a.id} sx={{ fontSize: 12 }}>{a.displayName}</MenuItem>
                        ))}
                      </TextField>
                      <ButtonGroup size="small" variant="outlined">
                        {(["7d", "30d", "90d", "ytd"] as const).map(p => (
                          <Button key={p}
                            variant={activePreset === p ? "contained" : "outlined"}
                            onClick={() => applyPreset(p)}
                            sx={{ fontSize: 11, fontWeight: 500, px: "10px", minWidth: 0 }}>
                            {p.toUpperCase()}
                          </Button>
                        ))}
                      </ButtonGroup>
                      <Button size="small" variant="text"
                        onClick={() => { applyPreset("30d"); setAssigneeId("") }}
                        sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        Reset
                      </Button>
                    </Stack>
                  </Stack>

                  {/* Three trend cards with charts */}
                  <Stack direction={{ xs: "column", md: "row" }} gap="20px" divider={<Divider orientation="vertical" flexItem />}>
                    <TrendCard
                      label="Service Requests"
                      opened={srInPeriod.length} closed={srClosedInPeriod.length}
                      closedLabel="Closed" chartData={srChart}
                      onExport={() => exportCsv("service-requests")}
                      exporting={isExporting === "service-requests"}
                    />
                    <TrendCard
                      label="Risks & Issues"
                      opened={risksInPeriod.length + issuesInPeriod.length}
                      closed={risksClosed.length + issuesClosed.length}
                      closedLabel="Closed" chartData={riChart}
                    />
                    <TrendCard
                      label="Tasks"
                      opened={tasksInPeriod.length} closed={tasksDone.length}
                      closedLabel="Done" chartData={taskChart}
                      onExport={() => exportCsv("tasks")}
                      exporting={isExporting === "tasks"}
                    />
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={5}>
              <Card variant="outlined" sx={DASH_CARD_SX}>
                <CardContent sx={CARD_CONTENT_SX}>
                  <Box sx={{ mb: "12px" }}>
                    <SectionHeader
                      label="Recent Activity"
                      action={<Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>Last updated items</Typography>}
                    />
                  </Box>
                  {recentItems.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">No recent activity.</Typography>
                  ) : null}
                  {recentItems.map(item => (
                    <RecentRow
                      key={`${item.kind}-${item.id}`}
                      type={item.kind} reference={item.reference ?? ""} title={item.title}
                      status={item.status} updatedAt={item.updatedAt}
                      onClick={() => {
                        if (item.kind === "SR") navigate("/service-desk")
                        else if (item.kind === "TASK") navigate(`/service-desk/task/${item.id}`)
                        else if (item.kind === "CHECK") navigate(`/checks/${item.id}`)
                        else if (item.kind === "RISK") navigate("/risks-issues/risks?view=all")
                        else if (item.kind === "ISSUE") navigate("/risks-issues/issues?view=all")
                      }}
                    />
                  ))}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Row D — Resolution & SLA trends (honest server aggregates over resolvedAt).
              Driven by the same period + assignee filter as the Trend Snapshot above. */}
          <Grid container spacing="16px">
            <Grid item xs={12} md={6}>
              <MttrTrendCard dateFrom={dateFrom} dateTo={dateTo} assigneeId={assigneeId} />
            </Grid>
            <Grid item xs={12} md={6}>
              <SlaComplianceTrendCard dateFrom={dateFrom} dateTo={dateTo} assigneeId={assigneeId} />
            </Grid>
          </Grid>

        </Stack>
      ) : null}
    </Box>
  )
}
