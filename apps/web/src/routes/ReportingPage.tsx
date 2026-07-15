import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Button, Card, LinearProgress, MenuItem, Stack, TextField, Typography } from "@mui/material"
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf"
import TableChartIcon from "@mui/icons-material/TableChart"
import { LineChart } from "@mui/x-charts"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import {
  fetchReportingSummary,
  downloadReportingPdf,
  downloadReportingCsv,
  msToHoursLabel,
  gbp,
  slaPct,
  type ReportingSummary,
} from "../lib/reporting"

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ p: 2 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1.5 }}>{title}</Typography>
      {children}
    </Card>
  )
}

// Big-number stat tile — label + value + optional intent colour.
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700, color: color ?? "text.primary", lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  )
}

// A labelled proportional bar (value vs a row-set max), with a right-aligned figure.
function BarRow({ label, sub, pct, figure }: { label: string; sub?: string; pct: number; figure: string }) {
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25, gap: 1 }}>
        <Typography sx={{ fontSize: 12.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}{sub ? <Typography component="span" sx={{ color: "var(--color-text-muted)", ml: 0.5 }}>· {sub}</Typography> : null}
        </Typography>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, flexShrink: 0 }}>{figure}</Typography>
      </Box>
      <LinearProgress variant="determinate" value={Math.max(2, Math.min(100, pct))} sx={{ height: 6, borderRadius: 3 }} />
    </Box>
  )
}

const intentColor = (pct: number | null) =>
  pct == null ? undefined : pct > 85 ? "#dc2626" : pct > 65 ? "#d97706" : "#16a34a"

function monthLabel(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
}

function ServiceDeskPanel({ sd }: { sd: NonNullable<ReportingSummary["sections"]["serviceDesk"]> }) {
  const pct = slaPct(sd.sla.overallMet, sd.sla.overallBreached)
  const trend = sd.mttr.buckets.filter((b) => b.meanMs != null)
  return (
    <Panel title="Service Desk">
      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", rowGap: 1.5, mb: 2 }}>
        <Stat label="Open incidents" value={String(sd.volumes.openIncidents)} />
        <Stat label="Open requests" value={String(sd.volumes.openServiceRequests)} />
        <Stat label="Open tasks" value={String(sd.volumes.openTasks)} />
        <Stat label="Mean resolve" value={msToHoursLabel(sd.mttr.overallMeanMs)} />
        <Stat label="Median resolve" value={msToHoursLabel(sd.mttr.overallMedianMs)} />
        <Stat label="SLA compliance" value={pct == null ? "—" : `${pct}%`} color={pct == null ? undefined : intentColor(100 - pct)} />
      </Stack>
      {trend.length >= 2 ? (
        <Box>
          <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)", mb: 0.5 }}>Mean time to resolve by month (hours)</Typography>
          <LineChart
            height={180}
            xAxis={[{ scaleType: "point", data: trend.map((b) => monthLabel(b.bucketStart)) }]}
            series={[{ data: trend.map((b) => Number(((b.meanMs ?? 0) / 3_600_000).toFixed(1))), area: true, color: "#1d4ed8", showMark: false }]}
            margin={{ left: 44, right: 12, top: 12, bottom: 24 }}
          />
        </Box>
      ) : (
        <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>Not enough resolved history for a trend yet.</Typography>
      )}
    </Panel>
  )
}

function DcimPanel({ dcim }: { dcim: NonNullable<ReportingSummary["sections"]["dcim"]> }) {
  const t = dcim.totals
  return (
    <Panel title="DCIM — capacity">
      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", rowGap: 1.5, mb: 2 }}>
        <Stat label="Sites" value={String(t.sites)} />
        <Stat label="Cabinets" value={String(t.cabinets)} />
        <Stat label="Active assets" value={String(t.activeAssets)} />
        <Stat label="Space used" value={`${t.spacePct}%`} color={intentColor(t.spacePct)} />
        <Stat label="Power used" value={t.powerPct == null ? "—" : `${t.powerPct}%`} color={intentColor(t.powerPct)} />
        <Stat label="Stranded" value={String(t.strandedCabinets)} color={t.strandedCabinets > 0 ? "#d97706" : undefined} />
      </Stack>
      {dcim.sites.length ? (
        <Stack spacing={1.25}>
          {dcim.sites.map((s) => (
            <BarRow key={s.siteId} label={s.name} sub={`${s.cabinetCount} cab`} pct={s.space.pct} figure={`${s.space.pct}% space${s.power.pct != null ? ` · ${s.power.pct}% power` : ""}`} />
          ))}
        </Stack>
      ) : (
        <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No sites yet.</Typography>
      )}
    </Panel>
  )
}

function CrmPanel({ crm }: { crm: NonNullable<ReportingSummary["sections"]["crm"]> }) {
  const pipelineMax = Math.max(1, ...crm.pipeline.map((p) => p.value))
  const hasPipeline = crm.pipeline.some((p) => p.count > 0)
  return (
    <Panel title="CRM — commercial">
      <Stack direction="row" spacing={3} sx={{ flexWrap: "wrap", rowGap: 1.5, mb: 2 }}>
        <Stat label="Win rate" value={crm.winLoss.winRate == null ? "—" : `${crm.winLoss.winRate}%`} />
        <Stat label="Won / lost" value={`${crm.winLoss.won} / ${crm.winLoss.lost}`} />
        <Stat label="Won value" value={gbp(crm.winLoss.wonValue)} />
      </Stack>
      {hasPipeline ? (
        <Stack spacing={1.25}>
          {crm.pipeline.filter((p) => p.count > 0).map((p) => (
            <BarRow key={p.stage} label={p.stage} sub={`${p.count}`} pct={(p.value / pipelineMax) * 100} figure={`${gbp(p.value)} · w ${gbp(p.weighted)}`} />
          ))}
        </Stack>
      ) : (
        <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No open pipeline.</Typography>
      )}
    </Panel>
  )
}

export default function ReportingPage() {
  const { notify } = useNotification()
  const [months, setMonths] = React.useState(6)
  const [exporting, setExporting] = React.useState<"" | "pdf" | "csv">("")

  const summary = useQuery({ queryKey: ["reporting-summary", months], queryFn: () => fetchReportingSummary(months) })

  const doExport = async (kind: "pdf" | "csv") => {
    setExporting(kind)
    try {
      await (kind === "pdf" ? downloadReportingPdf(months) : downloadReportingCsv(months))
    } catch {
      notify.error(`Couldn't export ${kind.toUpperCase()}`)
    } finally {
      setExporting("")
    }
  }

  if (summary.isLoading) return <LoadingState />
  if (summary.isError || !summary.data) return <ErrorState title="Failed to load reporting" />
  const data = summary.data
  const { serviceDesk, dcim, crm } = data.sections
  const anySection = serviceDesk || dcim || crm

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Reporting</Typography>
          <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {data.clientName} · trailing {data.range.months} months
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          <TextField select size="small" label="Window" value={months} onChange={(e) => setMonths(Number(e.target.value))} sx={{ width: 150 }} InputLabelProps={{ shrink: true }}>
            <MenuItem value={3}>Last 3 months</MenuItem>
            <MenuItem value={6}>Last 6 months</MenuItem>
            <MenuItem value={12}>Last 12 months</MenuItem>
          </TextField>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={!!exporting} onClick={() => doExport("pdf")}>
            {exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
          <Button size="small" variant="outlined" startIcon={<TableChartIcon />} disabled={!!exporting} onClick={() => doExport("csv")}>
            {exporting === "csv" ? "Exporting…" : "CSV"}
          </Button>
        </Stack>
      </Box>

      {!anySection ? (
        <Card sx={{ p: 4, textAlign: "center" }}>
          <Typography sx={{ fontSize: 14, color: "var(--color-text-muted)" }}>
            No licensed modules to report for this client.
          </Typography>
        </Card>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr", gap: 2 }}>
          {serviceDesk ? <ServiceDeskPanel sd={serviceDesk} /> : null}
          {dcim ? <DcimPanel dcim={dcim} /> : null}
          {crm ? <CrmPanel crm={crm} /> : null}
        </Box>
      )}
    </Box>
  )
}
