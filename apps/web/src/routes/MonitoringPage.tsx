import React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography
} from "@mui/material"
import { api } from "../lib/api"
import { useBreadcrumb } from "./Shell"
import { useThemeMode } from "../lib/theme"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ROLES } from "../lib/rbac"
import { ListToolbar, ToolbarButton } from "../components/shared/ListToolbar"
import Sparkline from "../components/shared/Sparkline"
import { getSiteCapacity, kw, Health } from "../lib/capacity"
import {
  HEALTH_LABEL, METRIC_LABEL, METRIC_UNIT, SENSOR_METRICS, SensorMetric, SensorReading,
  healthColor, importReadings, listReadings, recordReading,
} from "../lib/readings"
import { Cabinet, Site, barColor, getApiErrorMessage } from "../lib/infrastructure"

// Monitoring (DCIM_DESIGN_SPEC §6b, Horizon 3) — the manual/CSV telemetry
// surface: per-cabinet measured power vs budgeted vs feed, ASHRAE environment,
// and per-asset readings with a power-over-time sparkline. Record + CSV import.
export default function MonitoringPage() {
  const { setBreadcrumbs, setHideModuleLabel, setPageFullBleed } = useBreadcrumb()
  const { mode } = useThemeMode()
  const { notify } = useNotification()
  const qc = useQueryClient()
  const canWrite = hasAnyRole([ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.ADMIN, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  React.useEffect(() => {
    setHideModuleLabel(true); setPageFullBleed(true); setBreadcrumbs([{ label: "Monitoring" }])
    return () => { setHideModuleLabel(false); setPageFullBleed(false) }
  }, [setBreadcrumbs, setHideModuleLabel, setPageFullBleed])

  const [siteId, setSiteId] = React.useState<string>("")
  const [selectedCabId, setSelectedCabId] = React.useState<string | null>(null)
  const [recordFor, setRecordFor] = React.useState<{ id: string; name: string } | null>(null)
  const [importOpen, setImportOpen] = React.useState(false)

  const { data: sites = [] } = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get<Site[]>("/sites")).data })
  React.useEffect(() => { if (!siteId && sites.length) setSiteId(sites[0].id) }, [sites, siteId])

  const { data: capacity } = useQuery({ queryKey: ["site-capacity", siteId], enabled: !!siteId, queryFn: () => getSiteCapacity(siteId) })
  const { data: cabinets = [] } = useQuery({ queryKey: ["site-cabinets", siteId], enabled: !!siteId, queryFn: async () => (await api.get<Cabinet[]>(`/sites/${siteId}/cabinets`)).data })

  const rows = capacity?.cabinets ?? []
  const selectedCap = rows.find(r => r.cabinetId === selectedCabId) ?? null
  const selectedCabinet = cabinets.find(c => c.id === selectedCabId) ?? null

  const refresh = () => { qc.invalidateQueries({ queryKey: ["site-capacity", siteId] }); qc.invalidateQueries({ queryKey: ["asset-readings"] }) }

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <ListToolbar>
        <TextField select size="small" label="Site" value={siteId} onChange={e => { setSiteId(e.target.value); setSelectedCabId(null) }} sx={{ minWidth: 180 }}>
          {sites.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        {capacity ? (
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", ml: 1 }}>
            {capacity.totals.monitoredCabinets ?? 0} of {capacity.totals.cabinets} cabinets monitored
            {capacity.totals.power.measured != null ? ` · measured ${kw(capacity.totals.power.measured)}` : ""}
          </Typography>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {canWrite ? <ToolbarButton variant="primary" onClick={() => setImportOpen(true)}>Import readings (CSV)</ToolbarButton> : null}
      </ListToolbar>

      <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* Cabinet list — measured / environment / health */}
        <Box sx={{ width: 380, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", overflowY: "auto", bgcolor: "background.paper" }}>
          {rows.length === 0 ? (
            <Typography sx={{ p: "16px", fontSize: 12.5, color: "text.secondary" }}>No cabinets in this site.</Typography>
          ) : rows.map(c => {
            const env = c.environment
            const health: Health = env?.health ?? "UNKNOWN"
            return (
              <Box key={c.cabinetId} onClick={() => setSelectedCabId(c.cabinetId)} sx={{
                px: "16px", py: "11px", borderBottom: "1px solid", borderColor: "divider", cursor: "pointer",
                bgcolor: selectedCabId === c.cabinetId ? (mode === "dark" ? "rgba(59,130,246,.1)" : "rgba(29,78,216,.06)") : "transparent",
                borderLeft: "2px solid", borderLeftColor: selectedCabId === c.cabinetId ? "primary.main" : "transparent",
                "&:hover": { bgcolor: mode === "dark" ? "rgba(59,130,246,.07)" : "rgba(29,78,216,.04)" },
              }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: healthColor(health, mode), flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
                  <Typography sx={{ fontSize: 10.5, color: "text.tertiary" }}>{HEALTH_LABEL[health]}</Typography>
                </Stack>
                <Box sx={{ mt: "8px" }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: "3px" }}>
                    <Typography sx={{ fontSize: 10.5, color: "text.tertiary" }}>Power</Typography>
                    <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                      {c.power.measured != null ? `${kw(c.power.measured)} meas` : "no reading"} · {kw(c.power.value)} budg{c.power.capacity != null ? ` / ${kw(c.power.capacity)}` : ""}
                    </Typography>
                  </Stack>
                  <Box sx={{ height: 5, borderRadius: "3px", bgcolor: mode === "dark" ? "rgba(148,163,184,.16)" : "rgba(100,116,139,.15)", overflow: "hidden", position: "relative" }}>
                    {/* budgeted (faint) + measured (solid) on the same feed scale */}
                    {c.power.pct != null ? <Box sx={{ position: "absolute", inset: 0, width: `${Math.min(100, c.power.pct)}%`, bgcolor: mode === "dark" ? "rgba(148,163,184,.35)" : "rgba(100,116,139,.3)" }} /> : null}
                    {c.power.measuredPct != null ? <Box sx={{ position: "absolute", inset: 0, width: `${Math.min(100, c.power.measuredPct)}%`, bgcolor: barColor(c.power.measuredPct, mode) }} /> : null}
                  </Box>
                </Box>
                {env && (env.temperatureC != null || env.humidityPct != null) ? (
                  <Stack direction="row" spacing={1} sx={{ mt: "7px" }}>
                    {env.temperatureC != null ? <Chip size="small" label={`${env.temperatureC}°C`} sx={{ height: 18, fontSize: 10, fontWeight: 600 }} /> : null}
                    {env.humidityPct != null ? <Chip size="small" label={`${env.humidityPct}% RH`} sx={{ height: 18, fontSize: 10, fontWeight: 600 }} /> : null}
                  </Stack>
                ) : null}
              </Box>
            )
          })}
        </Box>

        {/* Selected cabinet — per-asset readings + sparkline */}
        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: "16px 20px" }}>
          {!selectedCabinet ? (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", p: 2 }}>Select a cabinet to view and record its assets' readings.</Typography>
          ) : (
            <>
              <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: "14px" }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{selectedCabinet.name}</Typography>
                {selectedCap?.power.measured != null ? (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>measured {kw(selectedCap.power.measured)} · budgeted {kw(selectedCap.power.value)}{selectedCap.power.capacity != null ? ` · feed ${kw(selectedCap.power.capacity)}` : ""}</Typography>
                ) : null}
              </Stack>
              <Stack spacing={1.25}>
                {selectedCabinet.assets.filter(a => a.uPosition != null).map(a => (
                  <AssetReadingRow key={a.id} assetId={a.id} name={a.name} tag={a.assetTag} mode={mode}
                    canWrite={canWrite} onRecord={() => setRecordFor({ id: a.id, name: a.name })} />
                ))}
                {selectedCabinet.assets.filter(a => a.uPosition != null).length === 0 ? (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No racked assets in this cabinet.</Typography>
                ) : null}
              </Stack>
            </>
          )}
        </Box>
      </Box>

      {recordFor ? <RecordReadingDialog asset={recordFor} onClose={() => setRecordFor(null)} onDone={refresh} /> : null}
      {importOpen ? <ImportReadingsDialog onClose={() => setImportOpen(false)} onDone={refresh} /> : null}
    </Box>
  )
}

// One asset's latest readings + a power sparkline. Fetches its own history.
function AssetReadingRow({ assetId, name, tag, mode, canWrite, onRecord }: {
  assetId: string; name: string; tag: string; mode: "light" | "dark"; canWrite: boolean; onRecord: () => void
}) {
  const { data: readings = [] } = useQuery({ queryKey: ["asset-readings", assetId], queryFn: () => listReadings(assetId) })
  const latest: Partial<Record<SensorMetric, SensorReading>> = {}
  for (const r of readings) if (!latest[r.metric as SensorMetric]) latest[r.metric as SensorMetric] = r // newest-first
  // Power series oldest→newest for the sparkline.
  const powerSeries = readings.filter(r => r.metric === "powerW").map(r => r.value).reverse()

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "11px 14px", display: "flex", alignItems: "center", gap: 2 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</Typography>
        <Typography sx={{ fontSize: 10.5, fontFamily: "monospace", color: "text.tertiary" }}>{tag}</Typography>
        <Stack direction="row" spacing={1.5} sx={{ mt: "5px", flexWrap: "wrap" }}>
          {SENSOR_METRICS.map(m => (
            <Typography key={m} sx={{ fontSize: 11, color: latest[m] ? "text.secondary" : "text.tertiary", fontVariantNumeric: "tabular-nums" }}>
              {METRIC_LABEL[m]} {latest[m] ? `${latest[m]!.value}${METRIC_UNIT[m]}` : "—"}
            </Typography>
          ))}
        </Stack>
      </Box>
      {powerSeries.length > 1 ? <Sparkline values={powerSeries} color={mode === "dark" ? "#f59e0b" : "#d97706"} /> : null}
      {canWrite ? <ToolbarButton onClick={onRecord} sx={{ flexShrink: 0 }}>Record</ToolbarButton> : null}
    </Box>
  )
}

function RecordReadingDialog({ asset, onClose, onDone }: { asset: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const { notify } = useNotification()
  const [metric, setMetric] = React.useState<SensorMetric>("powerW")
  const [value, setValue] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  async function save() {
    const v = Number(value)
    if (Number.isNaN(v)) { notify.error("Enter a numeric value"); return }
    setSaving(true)
    try { await recordReading(asset.id, { metric, value: v }); notify.success("Reading recorded"); onDone(); onClose() }
    catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to record")) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Record reading — {asset.name}</DialogTitle>
      <DialogContent>
        <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
          <TextField select size="small" label="Metric" value={metric} onChange={e => setMetric(e.target.value as SensorMetric)} sx={{ flex: 1 }}>
            {SENSOR_METRICS.map(m => <MenuItem key={m} value={m}>{METRIC_LABEL[m]} ({METRIC_UNIT[m]})</MenuItem>)}
          </TextField>
          <TextField size="small" label="Value" type="number" value={value} onChange={e => setValue(e.target.value)} sx={{ width: 120 }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving || !value.trim()} sx={{ textTransform: "none" }}>Record</Button>
      </DialogActions>
    </Dialog>
  )
}

// Paste a field sheet: assetTag,metric,value[,readAt] per line (header optional).
function ImportReadingsDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { notify } = useNotification()
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<{ created: number; skipped: number; errors: { row: number; reason: string }[] } | null>(null)

  async function run() {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const rows = lines
      .filter(l => !/^asset\s*tag/i.test(l)) // drop a header row
      .map(l => {
        const [assetTag, metric, value, readAt] = l.split(",").map(s => s?.trim())
        return { assetTag, metric, value: Number(value), readAt: readAt || undefined }
      })
      .filter(r => r.assetTag && r.metric)
    if (rows.length === 0) { notify.error("No parseable rows"); return }
    setBusy(true)
    try { const res = await importReadings(rows); setResult(res); if (res.created) onDone() }
    catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Import failed")) }
    finally { setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Import readings</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
          One reading per line: <b>assetTag,metric,value</b> (optional <b>,readAt</b>). Metric is one of
          powerW, temperatureC, humidityPct.
        </Typography>
        <TextField
          multiline minRows={6} fullWidth size="small"
          placeholder={"CL-9EF5EB-SWT-01,powerW,220\nCL-9EF5EB-SWT-01,temperatureC,24.5"}
          value={text} onChange={e => setText(e.target.value)}
          InputProps={{ sx: { fontFamily: "monospace", fontSize: 12 } }}
        />
        {result ? (
          <Box sx={{ mt: 1.5 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
              {result.created} recorded{result.skipped ? `, ${result.skipped} skipped` : ""}.
            </Typography>
            {result.errors.map(e => (
              <Typography key={e.row} sx={{ fontSize: 11, color: "error.main" }}>Row {e.row}: {e.reason}</Typography>
            ))}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} sx={{ textTransform: "none" }}>Close</Button>
        <Button size="small" variant="contained" onClick={run} disabled={busy || !text.trim()} sx={{ textTransform: "none" }}>Import</Button>
      </DialogActions>
    </Dialog>
  )
}
