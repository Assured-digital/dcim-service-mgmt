import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Box, Card, Chip, LinearProgress, MenuItem, Stack, TextField, Typography } from "@mui/material"
import { ErrorState, LoadingState } from "../components/PageState"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import {
  LOST_REASON_LABELS, OPPORTUNITY_STAGE_LABELS, formatMoney, getCrmReports
} from "../lib/crm"

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card sx={{ p: 2 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1.5 }}>{title}</Typography>
      {children}
    </Card>
  )
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number)
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
}

export default function CrmReportsPage() {
  const navigate = useNavigate()
  const { mode: themeMode } = useThemeMode()
  const [months, setMonths] = React.useState(6)

  const reports = useQuery({ queryKey: ["crm-reports", months], queryFn: () => getCrmReports(months) })

  if (reports.isLoading) return <LoadingState />
  if (reports.isError || !reports.data) return <ErrorState title="Failed to load reports" />
  const r = reports.data

  const pipelineMax = Math.max(1, ...r.pipeline.map(p => p.value))
  const forecastMax = Math.max(1, ...r.forecast.map(f => f.value))

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 700, color: themeMode === "dark" ? "#e2e8f0" : "#334155" }}>Reports</Typography>
        <TextField select size="small" label="Win/loss window" value={months} onChange={e => setMonths(Number(e.target.value))} sx={{ width: 170 }} InputLabelProps={{ shrink: true }}>
          <MenuItem value={3}>Last 3 months</MenuItem>
          <MenuItem value={6}>Last 6 months</MenuItem>
          <MenuItem value={12}>Last 12 months</MenuItem>
        </TextField>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        {/* Pipeline by stage */}
        <Panel title="Pipeline by stage">
          {r.pipeline.every(p => p.count === 0) ? <Empty /> : (
            <Stack spacing={1.25}>
              {r.pipeline.map(p => (
                <Box key={p.stage}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
                    <Typography sx={{ fontSize: 12.5 }}>{OPPORTUNITY_STAGE_LABELS[p.stage]} · {p.count}</Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{formatMoney(p.value) ?? "£0"}<Typography component="span" sx={{ fontSize: 11, color: "var(--color-text-muted)", ml: 0.5 }}>w {formatMoney(p.weighted) ?? "£0"}</Typography></Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={(p.value / pipelineMax) * 100} sx={{ height: 7, borderRadius: 3 }} />
                </Box>
              ))}
            </Stack>
          )}
        </Panel>

        {/* Forecast by close month */}
        <Panel title="Forecast by close month">
          {r.forecast.length === 0 ? <Empty text="No open deals with a close date." /> : (
            <Stack spacing={1.25}>
              {r.forecast.map(f => (
                <Box key={f.month}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.25 }}>
                    <Typography sx={{ fontSize: 12.5 }}>{monthLabel(f.month)} · {f.count}</Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{formatMoney(f.value) ?? "£0"}<Typography component="span" sx={{ fontSize: 11, color: "var(--color-text-muted)", ml: 0.5 }}>w {formatMoney(f.weighted) ?? "£0"}</Typography></Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={(f.value / forecastMax) * 100} color="secondary" sx={{ height: 7, borderRadius: 3 }} />
                </Box>
              ))}
            </Stack>
          )}
        </Panel>

        {/* Win / loss */}
        <Panel title={`Win / loss (last ${months} months)`}>
          <Box sx={{ display: "flex", gap: 3, mb: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: 24, fontWeight: 700 }}>{r.winLoss.winRate !== null ? `${r.winLoss.winRate}%` : "—"}</Typography>
              <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>win rate</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>{r.winLoss.won}</Typography>
              <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>won · {formatMoney(r.winLoss.wonValue) ?? "£0"}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: "#dc2626" }}>{r.winLoss.lost}</Typography>
              <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>lost</Typography>
            </Box>
          </Box>
          {Object.keys(r.winLoss.lossReasons).length > 0 ? (
            <Box>
              <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", mb: 0.5 }}>Loss reasons</Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {Object.entries(r.winLoss.lossReasons).map(([reason, n]) => (
                  <Chip key={reason} size="small" label={`${LOST_REASON_LABELS[reason] ?? reason}: ${n}`} sx={{ fontSize: 11, height: 22 }} />
                ))}
              </Stack>
            </Box>
          ) : <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>No closed deals in this window.</Typography>}
        </Panel>

        {/* Stalled deals */}
        <Panel title="Stalled deals">
          {r.stalled.length === 0 ? <Empty text="Nothing stalled — pipeline is moving." /> : (
            <Stack spacing={0.5}>
              {r.stalled.map(s => (
                <Box key={s.id} onClick={() => navigate(`/crm/opportunities/${s.id}`)}
                  sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.6, borderRadius: "6px", cursor: "pointer", "&:hover": { bgcolor: "rgba(29,78,216,0.05)" } }}>
                  <StatusPill intent={entityStatusIntent(s.stage)} label={OPPORTUNITY_STAGE_LABELS[s.stage] ?? s.stage} size="sm" />
                  <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{s.title}</Typography>
                  <Chip size="small" label={s.nextStepOverdue ? "step overdue" : `${s.daysInStage}d in stage`}
                    sx={{ fontSize: 10.5, height: 18, bgcolor: "rgba(220,38,38,0.1)", color: "#dc2626" }} />
                </Box>
              ))}
            </Stack>
          )}
        </Panel>
      </Box>
    </Box>
  )
}

function Empty({ text = "No data yet." }: { text?: string }) {
  return <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{text}</Typography>
}
