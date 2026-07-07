import React from "react"
import { Box, Card, CardContent, Stack, Typography } from "@mui/material"
import { LineChart } from "@mui/x-charts"
import { useThemeMode } from "../../lib/theme"
import { semanticToken, slate } from "../shared"
import { SectionHeader } from "../shared/primitives/SectionHeader"
import { DASH_CARD_SX, CARD_CONTENT_SX } from "./primitives"
import { LoadingState, ErrorState } from "../PageState"
import {
  bucketForRange, useMttrTrend, useSlaComplianceTrend, formatDurationMs, msToHours
} from "../../lib/metrics"

// Resolution-performance trends (MTTR + SLA compliance over time) — the
// rich-dashboards value, grafted onto the current dashboard as a self-contained
// row. Owns its own period (last 8 weeks) so it drops in anywhere without needing
// the page's filter state. Driven by the honest server `resolvedAt` aggregates.

function formatDateShort(value: string) {
  const d = new Date(value)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

type MetricIntent = "danger" | "warning" | "success" | "neutral"
function MetricCell({ label, value, intent = "neutral" }: { label: string; value: number; intent?: MetricIntent }) {
  const { mode } = useThemeMode()
  const active = value > 0
  const valueColor = intent === "neutral" || !active ? "text.primary" : semanticToken(intent, mode).solid
  return (
    <Box sx={{ flex: 1, minWidth: 0, bgcolor: "var(--color-background-secondary)", borderRadius: "8px", px: "11px", py: "10px" }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "5px" }}>{label}</Typography>
      <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: valueColor }}>{value}</Typography>
    </Box>
  )
}

// A quiet line over the period — hidden axes, first/last date labels below.
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
          sx={{ "& .MuiAreaElement-root": { fillOpacity: 0.08 }, "& .MuiChartsAxis-root": { display: "none" } }}
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

function MttrTrendCard({ dateFrom, dateTo, assigneeId }: { dateFrom: string; dateTo: string; assigneeId: string }) {
  const { mode } = useThemeMode()
  const bucket = bucketForRange(dateFrom, dateTo)
  const { data, isLoading, error } = useMttrTrend({ from: dateFrom, to: dateTo, bucket, assigneeId })
  const line = mode === "dark" ? slate[400] : slate[500]

  return (
    <Card variant="outlined" sx={DASH_CARD_SX}>
      <CardContent sx={CARD_CONTENT_SX}>
        <SectionHeader label="Resolution time" tooltip="Mean time to resolve Service Requests & Incidents, by resolution date, for the selected client. Based only on records with a recorded resolution time." />
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", mt: "3px" }}>Service Requests &amp; Incidents · time to resolve</Typography>
        {isLoading ? (
          <Box sx={{ mt: "12px" }}><LoadingState /></Box>
        ) : error ? (
          <Box sx={{ mt: "12px" }}><ErrorState title="Failed to load resolution metrics" /></Box>
        ) : !data || data.totalResolved === 0 ? (
          <Box sx={{ mt: "18px", mb: "8px" }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No resolutions recorded in this period.</Typography>
            <Typography sx={{ fontSize: 11.5, color: "text.tertiary", mt: "4px" }}>Resolution time is captured when a record is resolved or closed — older records may not have it yet.</Typography>
          </Box>
        ) : (
          <>
            <Stack direction="row" gap="18px" sx={{ mt: "14px", mb: "10px" }} alignItems="baseline">
              <Box>
                <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Mean</Typography>
                <Typography sx={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>{formatDurationMs(data.overallMeanMs)}</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Median</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: "text.secondary" }}>{formatDurationMs(data.overallMedianMs)}</Typography>
              </Box>
              <Box sx={{ ml: "auto", textAlign: "right" }}>
                <Typography sx={{ fontSize: 9.5, color: "text.tertiary", mb: "1px" }}>Resolved</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>{data.totalResolved}</Typography>
              </Box>
            </Stack>
            <MetricLineChart points={data.buckets.map(b => msToHours(b.meanMs))} labels={data.buckets.map(b => formatDateShort(b.bucketStart))} color={line} valueFormatter={(v) => (v == null ? "—" : `${v}h`)} />
            <Typography sx={{ fontSize: 10.5, color: "text.tertiary", mt: "8px" }}>Mean hours to resolve, per {bucket}. Based on {data.totalResolved} resolved in period.</Typography>
          </>
        )}
      </CardContent>
    </Card>
  )
}

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
        <SectionHeader label="SLA compliance trend" tooltip="Share of Service Requests & Incidents resolved within their SLA due date, by resolution date. Records with no due target are excluded." />
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", mt: "3px" }}>Service Requests &amp; Incidents · % resolved within SLA</Typography>
        {isLoading ? (
          <Box sx={{ mt: "12px" }}><LoadingState /></Box>
        ) : error ? (
          <Box sx={{ mt: "12px" }}><ErrorState title="Failed to load SLA compliance" /></Box>
        ) : !data || judged === 0 ? (
          <Box sx={{ mt: "18px", mb: "8px" }}>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No resolved records with an SLA due target in this period.</Typography>
            {data && data.noDueTarget > 0 ? (
              <Typography sx={{ fontSize: 11.5, color: "text.tertiary", mt: "4px" }}>{data.noDueTarget} resolved {data.noDueTarget === 1 ? "record has" : "records have"} no due date set.</Typography>
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
            <MetricLineChart points={data.buckets.map(b => (b.total > 0 ? Math.round((b.met / b.total) * 100) : null))} labels={data.buckets.map(b => formatDateShort(b.bucketStart))} color={success} valueFormatter={(v) => (v == null ? "—" : `${v}%`)} yMax={100} />
            <Typography sx={{ fontSize: 10.5, color: "text.tertiary", mt: "8px" }}>% resolved within SLA, per {bucket}. Based on {judged} with a due target{data.noDueTarget > 0 ? ` · ${data.noDueTarget} excluded (no due date)` : ""}.</Typography>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// The public export — a self-contained row of the two trend cards over the last
// 8 weeks. Drop into any dashboard section.
export default function MetricsTrends() {
  const { dateFrom, dateTo } = React.useMemo(() => {
    const to = new Date()
    const from = new Date(to.getTime() - 56 * 24 * 60 * 60 * 1000)
    return { dateFrom: from.toISOString(), dateTo: to.toISOString() }
  }, [])
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "16px" }}>
      <MttrTrendCard dateFrom={dateFrom} dateTo={dateTo} assigneeId="" />
      <SlaComplianceTrendCard dateFrom={dateFrom} dateTo={dateTo} assigneeId="" />
    </Box>
  )
}
