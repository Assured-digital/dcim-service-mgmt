import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Box, Button } from "@mui/material"
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined"
import { useBreadcrumb } from "./Shell"
import { useThemeMode } from "../lib/theme"
import { ListToolbar, SearchField, ToolbarButton } from "../components/shared/ListToolbar"
import { ChipOption, FilterChip } from "../components/shared/FilterChip"
import AssetRegister from "./AssetRegister"
import AssetDetailPage from "./AssetDetailPage"
import { Asset, assetTypeAccent, lifecycleGlyphColor } from "../lib/infrastructure"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { listCustomFields } from "../lib/customFields"
import { ManageCustomFieldsDialog } from "./customFieldsUi"
import { AssetBulkBar } from "./AssetBulkBar"
import { AssetSavedViews } from "./AssetSavedViews"
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

  // ── Filter state (search is instant — SearchField debounces) ───────────
  const [filters, setFilters] = React.useState<FilterState>(() => ({ ...emptyFilters(), lifecycles: new Set(["ACTIVE"]) }))
  const [searchInput, setSearchInput] = React.useState("")
  const commitSearch = React.useCallback((q: string) => {
    setFilters(prev => (prev.search === q ? prev : { ...prev, search: q }))
  }, [])

  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<Asset[]>("/assets")).data,
    staleTime: 5 * 60 * 1000
  })

  // Custom asset fields: drive extra export columns + the Manage fields dialog.
  const canManageFields = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])
  const canBulkEdit = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  const [manageFields, setManageFields] = React.useState(false)
  const { data: customFields = [] } = useQuery({ queryKey: ["asset-custom-fields"], queryFn: listCustomFields })

  // Bulk selection (ids ticked across the filtered set).
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const toggleRow = React.useCallback((id: string) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  }), [])
  const toggleAll = React.useCallback((ids: string[], checked: boolean) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (checked) ids.forEach(i => next.add(i)); else ids.forEach(i => next.delete(i))
    return next
  }), [])
  const clearSelection = React.useCallback(() => setSelectedIds(new Set()), [])

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
  const applyView = React.useCallback((next: FilterState) => { setFilters(next); setSearchInput(next.search) }, [])

  const handleAssetClick = React.useCallback((asset: Asset) => {
    navigate(`/asset-register/assets/${asset.id}`)
  }, [navigate])
  const handleBackToRegister = React.useCallback(() => { navigate("/asset-register") }, [navigate])

  const assetEmbedded = !!params.assetId
  const activeCount = activeFilterCount(filters)
  const selectedAssets = React.useMemo(() => allAssets.filter(a => selectedIds.has(a.id)), [allAssets, selectedIds])

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
          <ListToolbar>
            <SearchField
              placeholder="Search assets — tag, serial, IP, model…"
              value={searchInput} onValueChange={setSearchInput} onSearch={commitSearch}
            />
            <AssetSavedViews filters={filters} onApply={applyView} />
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
            {canManageFields ? <ToolbarButton onClick={() => setManageFields(true)}>Manage fields</ToolbarButton> : null}
            <ToolbarButton onClick={() => exportAssetsCsv(filteredRows, customFields)} disabled={filteredRows.length === 0}
              startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: "15px !important" }} />}>
              Export {filteredRows.length}{activeCount > 0 ? " (filtered)" : ""}
            </ToolbarButton>
          </ListToolbar>

          {/* ── Bulk selection bar ──────────────────────────────────────── */}
          {selectedAssets.length > 0 ? (
            <AssetBulkBar selected={selectedAssets} customFields={customFields} canManage={canBulkEdit} onClear={clearSelection} />
          ) : null}

          {/* ── Table ───────────────────────────────────────────────────── */}
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", bgcolor: "background.paper" }}>
            <AssetRegister filteredRows={filteredRows} onAssetClick={handleAssetClick}
              selectedIds={selectedIds} onToggleRow={toggleRow} onToggleAll={toggleAll} />
          </Box>
        </>
      )}
      {manageFields ? <ManageCustomFieldsDialog onClose={() => setManageFields(false)} /> : null}
    </Box>
  )
}
