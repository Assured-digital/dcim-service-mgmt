import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Checkbox, InputAdornment, Menu, MenuItem, TextField, Typography
} from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined"
import { useBreadcrumb } from "./Shell"
import { useThemeMode } from "../lib/theme"
import AssetRegister from "./AssetRegister"
import AssetDetailPage from "./AssetDetailPage"
import { Asset, assetTypeAccent, lifecycleGlyphColor } from "../lib/infrastructure"
import {
  FilterState, WarrantyKey, activeFilterCount, applyFilters, applyFiltersExcluding,
  emptyFilters, exportAssetsCsv, UNKNOWN_MANUFACTURER, warrantyStatus,
} from "./assetRegisterFilters"

// Asset register — the flat, non-spatial escape hatch (DCIM_DESIGN_BRIEF §4.5):
// instant search + top filter chips over a dense table. Spatial drill-down is
// Sites & cabinets' job; here location is just one flat facet (Site).

const LIFECYCLE_LABEL: Record<string, string> = {
  ACTIVE: "Active", STAGING: "Staging", PLANNED: "Planned", PROCUREMENT: "Procurement", RETIRED: "Retired",
}

type ChipOption = { key: string; label: string; count: number; glyph?: { color: string; shape: "square" | "dot" } }

// One filter facet: a chip-style button opening a multi-select menu. Stays open
// across toggles so several options can be picked in one visit.
function FilterChip({ label, options, selected, onToggle, onClear }: {
  label: string
  options: ChipOption[]
  selected: Set<string>
  onToggle: (key: string) => void
  onClear: () => void
}) {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const active = options.reduce((n, o) => n + (selected.has(o.key) ? 1 : 0), 0)
  if (options.length === 0 && active === 0) return null
  return (
    <>
      <Button size="small" onClick={e => setAnchor(e.currentTarget)}
        endIcon={<KeyboardArrowDownIcon sx={{ fontSize: "14px !important", ml: "-3px" }} />}
        sx={{
          textTransform: "none", fontSize: 12, fontWeight: active ? 700 : 500, px: "10px", py: "2px",
          borderRadius: "16px", border: "1px solid", minWidth: 0,
          borderColor: active ? "rgba(29,78,216,0.4)" : "divider",
          bgcolor: active ? "rgba(29,78,216,0.1)" : "transparent",
          color: active ? "primary.main" : "text.secondary",
        }}>
        {label}{active ? ` · ${active}` : ""}
      </Button>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 210, maxHeight: 380 } } }}>
        {options.map(o => (
          <MenuItem key={o.key} dense onClick={() => onToggle(o.key)} sx={{ py: "3px" }}>
            <Checkbox checked={selected.has(o.key)} size="small" sx={{ p: 0, mr: "8px", "& .MuiSvgIcon-root": { fontSize: 15 } }} />
            {o.glyph ? (
              <Box sx={{
                width: o.glyph.shape === "square" ? 9 : 8, height: o.glyph.shape === "square" ? 9 : 8,
                borderRadius: o.glyph.shape === "square" ? "3px" : "50%", bgcolor: o.glyph.color, mr: "7px", flexShrink: 0,
              }} />
            ) : null}
            <Typography sx={{ flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</Typography>
            <Typography sx={{ fontSize: 10.5, color: "text.tertiary", ml: "10px", fontVariantNumeric: "tabular-nums" }}>{o.count}</Typography>
          </MenuItem>
        ))}
        {active > 0 ? (
          <MenuItem dense onClick={() => { onClear(); setAnchor(null) }} sx={{ py: "4px", borderTop: "1px solid", borderColor: "divider", mt: "4px" }}>
            <Typography sx={{ fontSize: 12, color: "primary.main", fontWeight: 600 }}>Clear {label.toLowerCase()}</Typography>
          </MenuItem>
        ) : null}
      </Menu>
    </>
  )
}

export default function AssetRegisterPage() {
  const params = useParams<{ assetId?: string }>()
  const navigate = useNavigate()
  const { mode } = useThemeMode()
  const { setBreadcrumbs, setHideModuleLabel, setPageFullBleed } = useBreadcrumb()

  React.useEffect(() => {
    setHideModuleLabel(true)
    setPageFullBleed(true)
    return () => { setHideModuleLabel(false); setPageFullBleed(false) }
  }, [setHideModuleLabel, setPageFullBleed])

  React.useEffect(() => { setBreadcrumbs([{ label: "Asset Register" }]) }, [setBreadcrumbs])

  // ── Filter state (search is instant — debounced, no commit step) ───────
  const [filters, setFilters] = React.useState<FilterState>(() => ({ ...emptyFilters(), lifecycles: new Set(["ACTIVE"]) }))
  const [searchInput, setSearchInput] = React.useState("")
  React.useEffect(() => {
    const t = setTimeout(() => setFilters(prev => prev.search === searchInput.trim() ? prev : { ...prev, search: searchInput.trim() }), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<Asset[]>("/assets")).data,
    staleTime: 5 * 60 * 1000
  })

  const filteredRows = React.useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
    const rows = applyFilters(allAssets, filters)
    return [...rows].sort((a, b) =>
      collator.compare(a.site?.name ?? "", b.site?.name ?? "")
      || collator.compare(a.cabinet?.room?.name ?? "", b.cabinet?.room?.name ?? "")
      || collator.compare(a.cabinet?.name ?? "", b.cabinet?.name ?? "")
      || ((b.uPosition ?? -1) - (a.uPosition ?? -1))
    )
  }, [allAssets, filters])

  // ── Chip options (each facet reflects the OTHER active filters) ────────
  const siteOptions = React.useMemo<ChipOption[]>(() => {
    const sub = applyFiltersExcluding(allAssets, filters, "siteIds")
    const byId = new Map<string, { label: string; count: number }>()
    for (const a of sub) {
      if (!a.siteId) continue
      const cur = byId.get(a.siteId)
      if (cur) cur.count++
      else byId.set(a.siteId, { label: a.site?.name ?? "Unknown site", count: 1 })
    }
    return Array.from(byId.entries()).map(([key, v]) => ({ key, label: v.label, count: v.count }))
      .sort((x, y) => x.label.localeCompare(y.label))
  }, [allAssets, filters])

  const typeOptions = React.useMemo<ChipOption[]>(() => {
    const sub = applyFiltersExcluding(allAssets, filters, "types")
    const counts = new Map<string, number>()
    for (const a of sub) counts.set(a.assetType, (counts.get(a.assetType) ?? 0) + 1)
    return Array.from(counts.keys()).sort().map(key => ({
      key, label: key, count: counts.get(key)!,
      glyph: { color: assetTypeAccent(key, mode).fg, shape: "square" as const },
    }))
  }, [allAssets, filters, mode])

  const lifecycleOptions = React.useMemo<ChipOption[]>(() => {
    const sub = applyFiltersExcluding(allAssets, filters, "lifecycles")
    const counts = new Map<string, number>()
    for (const a of sub) counts.set(a.lifecycleState, (counts.get(a.lifecycleState) ?? 0) + 1)
    return ["ACTIVE", "STAGING", "PLANNED", "PROCUREMENT", "RETIRED"]
      .filter(lc => counts.has(lc))
      .map(lc => ({
        key: lc, label: LIFECYCLE_LABEL[lc] ?? lc, count: counts.get(lc)!,
        glyph: { color: lifecycleGlyphColor(lc, mode), shape: "dot" as const },
      }))
  }, [allAssets, filters, mode])

  const manufacturerOptions = React.useMemo<ChipOption[]>(() => {
    const sub = applyFiltersExcluding(allAssets, filters, "manufacturers")
    const counts = new Map<string, number>()
    for (const a of sub) {
      const m = a.manufacturer ?? UNKNOWN_MANUFACTURER
      counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    return Array.from(counts.keys()).sort().map(key => ({ key, label: key, count: counts.get(key)! }))
  }, [allAssets, filters])

  const warrantyOptions = React.useMemo<ChipOption[]>(() => {
    const sub = applyFiltersExcluding(allAssets, filters, "warranty")
    let expired = 0, soon = 0, healthy = 0
    for (const a of sub) {
      const s = warrantyStatus(a.warrantyExpiry)
      if (s === "expired") expired++
      else if (s === "soon") soon++
      else if (s === "ok") healthy++
    }
    const sev = mode === "dark"
      ? { expired: "#ef4444", soon: "#f59e0b", healthy: "#22c55e" }
      : { expired: "#b91c1c", soon: "#b45309", healthy: "#15803d" }
    return [
      { key: "expired", label: "Expired", count: expired, glyph: { color: sev.expired, shape: "dot" as const } },
      { key: "soon", label: "Expiring ≤30d", count: soon, glyph: { color: sev.soon, shape: "dot" as const } },
      { key: "healthy", label: "Healthy", count: healthy, glyph: { color: sev.healthy, shape: "dot" as const } },
    ].filter(w => w.count > 0)
  }, [allAssets, filters, mode])

  // ── Callbacks ───────────────────────────────────────────────────────────
  const toggleIn = (key: Exclude<keyof FilterState, "search">) => (value: string) =>
    setFilters(prev => {
      const next = new Set(prev[key] as Set<string>)
      if (next.has(value)) next.delete(value); else next.add(value)
      return { ...prev, [key]: next }
    })
  const clearKey = (key: Exclude<keyof FilterState, "search">) => () =>
    setFilters(prev => ({ ...prev, [key]: new Set() }))
  const clearAll = React.useCallback(() => { setFilters(emptyFilters()); setSearchInput("") }, [])

  const handleAssetClick = React.useCallback((asset: Asset) => {
    navigate(`/asset-register/assets/${asset.id}`)
  }, [navigate])
  const handleBackToRegister = React.useCallback(() => { navigate("/asset-register") }, [navigate])

  const assetEmbedded = !!params.assetId
  const activeCount = activeFilterCount(filters)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Box sx={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: "var(--color-background-tertiary)" }}>
      {assetEmbedded ? (
        <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <AssetDetailPage
            mode="embedded"
            assetIdProp={params.assetId}
            manageBreadcrumb={false}
            onBackToRegister={handleBackToRegister}
          />
        </Box>
      ) : (
        <>
          {/* ── Toolbar: search + filter chips + export ─────────────────── */}
          <Box sx={{
            px: "16px", py: "9px", bgcolor: "var(--color-background-primary)",
            borderBottom: "1px solid var(--color-border-primary)",
            display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", flexShrink: 0
          }}>
            <TextField
              size="small"
              placeholder="Search assets — tag, serial, IP, model…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              sx={{ width: 300 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: "text.tertiary" }} /></InputAdornment>,
                sx: { fontSize: 12.5, bgcolor: "background.default", height: 32 },
              }}
            />
            <FilterChip label="Site" options={siteOptions} selected={filters.siteIds} onToggle={toggleIn("siteIds")} onClear={clearKey("siteIds")} />
            <FilterChip label="Type" options={typeOptions} selected={filters.types} onToggle={toggleIn("types")} onClear={clearKey("types")} />
            <FilterChip label="Lifecycle" options={lifecycleOptions} selected={filters.lifecycles} onToggle={toggleIn("lifecycles")} onClear={clearKey("lifecycles")} />
            <FilterChip label="Manufacturer" options={manufacturerOptions} selected={filters.manufacturers} onToggle={toggleIn("manufacturers")} onClear={clearKey("manufacturers")} />
            <FilterChip label="Warranty" options={warrantyOptions} selected={filters.warranty as unknown as Set<string>} onToggle={(k) => toggleIn("warranty")(k as WarrantyKey)} onClear={clearKey("warranty")} />
            {activeCount > 0 ? (
              <Button size="small" onClick={clearAll}
                sx={{ textTransform: "none", fontSize: 11.5, minWidth: 0, px: "8px", color: "text.secondary" }}>
                Clear all
              </Button>
            ) : null}
            <Box sx={{ flex: 1 }} />
            <Button size="small" onClick={() => exportAssetsCsv(filteredRows)} disabled={filteredRows.length === 0}
              startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: "15px !important" }} />}
              sx={{ textTransform: "none", fontSize: 12, fontWeight: 600, border: "1px solid", borderColor: "divider", borderRadius: "7px", px: "10px", py: "2px", color: "text.secondary" }}>
              Export {filteredRows.length}{activeCount > 0 ? " (filtered)" : ""}
            </Button>
          </Box>

          {/* ── Table ───────────────────────────────────────────────────── */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", bgcolor: "background.paper" }}>
            <AssetRegister filteredRows={filteredRows} onAssetClick={handleAssetClick} />
          </Box>
        </>
      )}
    </Box>
  )
}
