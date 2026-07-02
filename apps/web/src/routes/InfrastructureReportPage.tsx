import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material"
import DownloadIcon from "@mui/icons-material/Download"
import { api } from "../lib/api"
import { useBreadcrumb } from "./Shell"
import { useNotification } from "../components/NotificationProvider"
import { useThemeMode } from "../lib/theme"
import { EmptyState, LoadingState } from "../components/PageState"
import { kw, pctColor, Metered } from "../lib/capacity"
import { getApiErrorMessage } from "../lib/infrastructure"

type Site = { id: string; name: string }
type ReportModel = {
  clientName: string; siteName: string; generatedAt: string
  contracted: { kw: number | null; u: number | null }
  totals: {
    cabinets: number; activeAssets: number
    space: { usedU: number; totalU: number; pct: number }
    power: Metered; weight: Metered; strandedCabinets: number
  }
  cabinets: { name: string; usedU: number; totalU: number; budgetedKw: number; powerPct: number | null; activeAssets: number; stranded: string | null }[]
  lifecycle: { state: string; count: number }[]
  assetTypes: { type: string; count: number }[]
  maintenance: { last90Days: number; overdue: number; upcoming: { assetName: string; workType: string; dueAt: string }[] }
  reservations: { cabinetName: string; range: string; name: string; expiresAt: string | null }[]
}

// Client-facing infrastructure report (DCIM spec §5). The same JSON model the PDF
// renders — readable by CLIENT_VIEWER (the "Reporting role" surface). Staff and
// clients download the PDF from here.
export default function InfrastructureReportPage() {
  const { setBreadcrumbs, setHideModuleLabel } = useBreadcrumb()
  const { mode } = useThemeMode()
  const { notify } = useNotification()
  const [siteId, setSiteId] = React.useState<string | null>(null)
  const [downloading, setDownloading] = React.useState(false)

  React.useEffect(() => {
    setHideModuleLabel(true); setBreadcrumbs([{ label: "Report" }])
    return () => setHideModuleLabel(false)
  }, [setBreadcrumbs, setHideModuleLabel])

  const { data: sites = [] } = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get<Site[]>("/sites")).data })
  React.useEffect(() => { if (!siteId && sites.length) setSiteId(sites[0].id) }, [sites, siteId])

  const { data: report, isLoading } = useQuery({
    queryKey: ["infrastructure-report", siteId], enabled: !!siteId,
    queryFn: async () => (await api.get<ReportModel>("/reports/infrastructure", { params: { siteId } })).data,
  })

  async function downloadPdf() {
    if (!siteId) return
    setDownloading(true)
    try {
      const res = await api.get("/reports/infrastructure.pdf", { params: { siteId }, responseType: "blob" })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `infrastructure-${(report?.siteName ?? "site").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to download the report"))
    } finally { setDownloading(false) }
  }

  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"

  return (
    <Stack spacing={2} sx={{ maxWidth: 880 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <TextField select size="small" label="Site" value={siteId ?? ""} onChange={e => setSiteId(e.target.value)} sx={{ minWidth: 220 }}>
          {sites.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="contained" startIcon={<DownloadIcon />} onClick={downloadPdf} disabled={!siteId || downloading} sx={{ textTransform: "none" }}>
          {downloading ? "Preparing…" : "Download PDF"}
        </Button>
      </Stack>

      {isLoading ? <LoadingState /> : !report ? (
        <EmptyState title="No report available" detail="Pick a site to generate its infrastructure report." />
      ) : (
        <>
          <Panel>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{report.siteName}</Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
              {report.clientName} · {report.totals.cabinets} cabinet{report.totals.cabinets === 1 ? "" : "s"} · {report.totals.activeAssets} active assets · generated {fmtDate(report.generatedAt)}
            </Typography>
            <MeterRow label="Space (physical)" pct={report.totals.space.pct} caption={`${report.totals.space.usedU} / ${report.totals.space.totalU} U · ${report.totals.space.pct}%`} mode={mode} />
            {report.contracted.u != null ? (
              <MeterRow label="Space (contracted)" pct={Math.round((report.totals.space.usedU / report.contracted.u) * 100)}
                caption={`${report.totals.space.usedU} / ${report.contracted.u} U`} mode={mode} />
            ) : null}
            <MeterRow label="Power (budgeted)" pct={report.totals.power.pct}
              caption={report.totals.power.capacity != null ? `${kw(report.totals.power.value)} / ${kw(report.totals.power.capacity)}` : kw(report.totals.power.value)} mode={mode} />
            {report.contracted.kw != null ? (
              <MeterRow label="Power (contracted)" pct={Math.round((report.totals.power.value / report.contracted.kw) * 100)}
                caption={`${kw(report.totals.power.value)} / ${kw(report.contracted.kw)}`} mode={mode} />
            ) : null}
            <MeterRow label="Weight" pct={report.totals.weight.pct}
              caption={report.totals.weight.capacity != null ? `${Math.round(report.totals.weight.value)} / ${Math.round(report.totals.weight.capacity)} kg` : "—"} mode={mode} />
            <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontStyle: "italic", mt: 0.5 }}>
              Power figures are budgeted (nameplate derated), not live metered readings.
            </Typography>
          </Panel>

          <Panel title="Cabinets">
            {report.cabinets.map(c => (
              <Box key={c.name} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: "6px", borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" } }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, width: 160, flexShrink: 0 }}>{c.name}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary", width: 80 }}>{c.usedU}/{c.totalU} U</Typography>
                <Typography sx={{ fontSize: 12, width: 130, color: pctColor(c.powerPct, mode) }}>{kw(c.budgetedKw)}{c.powerPct != null ? ` (${c.powerPct}%)` : ""}</Typography>
                <Typography sx={{ fontSize: 12, color: "text.secondary", width: 70 }}>{c.activeAssets} assets</Typography>
                {c.stranded ? <Typography sx={{ fontSize: 11, fontWeight: 700, color: pctColor(75, mode) }}>stranded {c.stranded}</Typography> : null}
              </Box>
            ))}
          </Panel>

          <Panel title="Inventory">
            <Typography sx={{ fontSize: 12.5 }}>
              By lifecycle — {report.lifecycle.map(l => `${l.state.toLowerCase()}: ${l.count}`).join(" · ") || "no assets"}
            </Typography>
            <Typography sx={{ fontSize: 12.5, mt: 0.5 }}>
              By type — {report.assetTypes.map(a => `${a.type}: ${a.count}`).join(" · ") || "no assets"}
            </Typography>
          </Panel>

          <Panel title="Maintenance">
            <Typography sx={{ fontSize: 12.5 }}>{report.maintenance.last90Days} record(s) in the last 90 days · {report.maintenance.overdue} overdue</Typography>
            {report.maintenance.upcoming.length ? report.maintenance.upcoming.map((m, i) => (
              <Typography key={i} sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>• {m.assetName} — {m.workType.replaceAll("_", " ").toLowerCase()} due {fmtDate(m.dueAt)}</Typography>
            )) : <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>No upcoming scheduled maintenance.</Typography>}
          </Panel>

          {report.reservations.length ? (
            <Panel title="Outstanding reservations">
              {report.reservations.map((r, i) => (
                <Typography key={i} sx={{ fontSize: 12.5, mt: i ? 0.5 : 0 }}>
                  {r.cabinetName} {r.range} — {r.name} <Box component="span" sx={{ color: "text.secondary" }}>{r.expiresAt ? `(expires ${fmtDate(r.expiresAt)})` : "(open-ended)"}</Box>
                </Typography>
              ))}
            </Panel>
          ) : null}
        </>
      )}
    </Stack>
  )
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "14px 16px" }}>
      {title ? <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary", mb: 1 }}>{title}</Typography> : null}
      {children}
    </Box>
  )
}

function MeterRow({ label, pct, caption, mode }: { label: string; pct: number | null; caption: string; mode: "light" | "dark" }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: "4px" }}>
      <Typography sx={{ fontSize: 12, color: "text.secondary", width: 130, flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ flex: 1, height: 6, borderRadius: "3px", bgcolor: mode === "dark" ? "#1e293b" : "#f1f5f9", overflow: "hidden" }}>
        <Box sx={{ width: `${Math.min(100, pct ?? 0)}%`, height: "100%", bgcolor: pctColor(pct, mode), borderRadius: "3px" }} />
      </Box>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary", width: 150, textAlign: "right", flexShrink: 0 }}>{caption}</Typography>
    </Box>
  )
}
