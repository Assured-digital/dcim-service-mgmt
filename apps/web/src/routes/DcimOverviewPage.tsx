import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Box, Stack, Typography } from "@mui/material"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import { EmptyState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { useThemeMode } from "../lib/theme"
import { api } from "../lib/api"
import { CapacityOverview, Metered, getCapacityOverview, kw, pctColor } from "../lib/capacity"
import { Asset, Site } from "../lib/infrastructure"
import SitesMapCard, { SiteAssetCounts } from "../components/SitesMapCard"
import { ToolbarButton } from "../components/shared/ListToolbar"

// DCIM capacity dashboard (DCIM_DESIGN_SPEC.md §4.4). Replaces the old count-cards
// overview: KPI row → per-site RYG capacity strips → top cabinets by budgeted
// power, all drilling through to the hierarchy. Budgeted-watts model throughout.
export default function DcimOverviewPage() {
  const nav = useNavigate()
  const { mode } = useThemeMode()
  const { setBreadcrumbs, setHideModuleLabel } = useBreadcrumb()

  React.useEffect(() => {
    setHideModuleLabel(true); setBreadcrumbs([{ label: "Overview" }])
    return () => setHideModuleLabel(false)
  }, [setBreadcrumbs, setHideModuleLabel])

  const { data, isLoading, isError } = useQuery({ queryKey: ["capacity-overview"], queryFn: getCapacityOverview })

  // Estate map (moved here from the retired Sites & cabinets overview). Sites
  // carry the geocoords; per-site cabinet/asset counts feed the marker popups.
  const { data: sites = [] } = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get<Site[]>("/sites")).data })
  const { data: allAssets = [] } = useQuery({ queryKey: ["assets"], queryFn: async () => (await api.get<Asset[]>("/assets")).data, staleTime: 5 * 60 * 1000 })
  const siteAssetCounts = React.useMemo<SiteAssetCounts>(() => {
    const byCabinet = new Map<string, Set<string>>()
    const byAsset = new Map<string, number>()
    for (const asset of allAssets) {
      if (!asset.siteId) continue
      byAsset.set(asset.siteId, (byAsset.get(asset.siteId) ?? 0) + 1)
      if (asset.cabinetId) {
        const cabs = byCabinet.get(asset.siteId) ?? new Set<string>()
        cabs.add(asset.cabinetId)
        byCabinet.set(asset.siteId, cabs)
      }
    }
    const out: SiteAssetCounts = {}
    for (const site of sites) {
      out[site.id] = { cabinets: byCabinet.get(site.id)?.size ?? 0, assets: byAsset.get(site.id) ?? 0 }
    }
    return out
  }, [sites, allAssets])

  if (isLoading) return <LoadingState />
  if (isError || !data) return <EmptyState title="Couldn't load capacity" detail="The capacity overview is unavailable." />
  if (data.totals.cabinets === 0) {
    return <EmptyState title="No cabinets yet" detail="Add sites and cabinets to see space, power and weight capacity." />
  }

  const t = data.totals
  const maxTopKw = Math.max(...data.topCabinets.map(c => c.budgetedKw), 0.001)

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" alignItems="center" spacing={2}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          Space, power and weight across the estate — budgeted power (nameplate derated), calm-by-exception.
        </Typography>
        <ToolbarButton variant="primary" onClick={() => nav("/dcim/place")}>Place equipment</ToolbarButton>
      </Stack>

      {/* KPI row */}
      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(5, minmax(0,1fr))" } }}>
        <Kpi label="Space used" value={`${t.spacePct}%`} detail={`${t.usedU} / ${t.totalU} U`} accent={pctColor(t.spacePct, mode)} />
        <Kpi label="Budgeted power" value={kw(t.budgetedKw)} detail={t.capacityKw != null ? `of ${kw(t.capacityKw)} feed · ${t.powerPct}%` : "no feed capacity set"} accent={pctColor(t.powerPct, mode)} />
        <Kpi label="Stranded cabinets" value={String(t.strandedCabinets)} detail="space / power imbalance" accent={t.strandedCabinets > 0 ? pctColor(90, mode) : undefined} warn={t.strandedCabinets > 0} />
        <Kpi label="Reservations expiring" value={String(t.expiringReservations)} detail="within 14 days" />
        <Kpi label="Active assets" value={String(t.activeAssets)} detail={`across ${t.cabinets} cabinets`} />
      </Box>

      <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "1.3fr 1fr" } }}>
        {/* Per-site strips */}
        <Panel title="Capacity by site">
          <Stack spacing={1.75}>
            {data.sites.map(s => (
              <Box key={s.siteId} sx={{ cursor: "pointer" }} onClick={() => nav(`/asset-hierarchy/${s.siteId}`)}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{s.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>{s.cabinetCount} cabinet{s.cabinetCount === 1 ? "" : "s"}{s.strandedCabinets ? ` · ${s.strandedCabinets} stranded` : ""}</Typography>
                </Box>
                <MeterRow label="Space" pct={s.space.pct} caption={`${s.space.usedU}/${s.space.totalU} U`} mode={mode} />
                <MeterRow label="Power" pct={s.power.pct} caption={s.power.capacity != null ? `${kw(s.power.value)} / ${kw(s.power.capacity)}` : kw(s.power.value)} mode={mode} />
                <MeterRow label="Weight" pct={s.weight.pct} caption={s.weight.capacity != null ? `${Math.round(s.weight.value)}/${Math.round(s.weight.capacity)} kg` : "—"} mode={mode} />
              </Box>
            ))}
          </Stack>
        </Panel>

        {/* Top cabinets by budgeted power */}
        <Panel title="Top cabinets by budgeted power">
          {data.topCabinets.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No powered cabinets yet.</Typography>
          ) : (
            <Stack spacing={0.75}>
              {data.topCabinets.map(c => (
                <Box key={c.cabinetId} onClick={() => nav(`/asset-hierarchy/${c.siteId}/cabinets/${c.cabinetId}`)}
                  sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer", "&:hover .barLabel": { color: "primary.main" } }}>
                  <Typography className="barLabel" sx={{ fontSize: 11.5, fontWeight: 600, width: 74, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
                  <Box sx={{ flex: 1, height: 9, borderRadius: "3px", bgcolor: mode === "dark" ? "#1e293b" : "#f1f5f9", overflow: "hidden" }}>
                    <Box sx={{ width: `${Math.max(3, Math.round((c.budgetedKw / maxTopKw) * 100))}%`, height: "100%", bgcolor: "primary.main", borderRadius: "3px" }} />
                  </Box>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", width: 52, textAlign: "right", flexShrink: 0 }}>{kw(c.budgetedKw)}</Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Panel>
      </Box>

      <SitesMapCard sites={sites} siteAssetCounts={siteAssetCounts} />
    </Stack>
  )
}

function Kpi({ label, value, detail, accent, warn }: { label: string; value: string; detail?: string; accent?: string; warn?: boolean }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "12px 14px", position: "relative", overflow: "hidden" }}>
      {accent ? <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, bgcolor: accent }} /> : null}
      <Typography sx={{ fontSize: 10.5, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: "4px" }}>{label}</Typography>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {warn ? <WarningAmberIcon sx={{ fontSize: 16, color: accent }} /> : null}
        <Typography sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1 }}>{value}</Typography>
      </Stack>
      {detail ? <Typography sx={{ fontSize: 11, color: "text.secondary", mt: "2px" }}>{detail}</Typography> : null}
    </Box>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "14px 16px" }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary", mb: 1.25 }}>{title}</Typography>
      {children}
    </Box>
  )
}

function MeterRow({ label, pct, caption, mode }: { label: string; pct: number | null; caption: string; mode: "light" | "dark" }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: "3px" }}>
      <Typography sx={{ fontSize: 11, color: "text.secondary", width: 44, flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ flex: 1, height: 6, borderRadius: "3px", bgcolor: mode === "dark" ? "#1e293b" : "#f1f5f9", overflow: "hidden" }}>
        <Box sx={{ width: `${Math.min(100, pct ?? 0)}%`, height: "100%", bgcolor: pctColor(pct, mode), borderRadius: "3px" }} />
      </Box>
      <Typography sx={{ fontSize: 11, color: "text.secondary", width: 96, textAlign: "right", flexShrink: 0 }}>{caption}</Typography>
    </Box>
  )
}
