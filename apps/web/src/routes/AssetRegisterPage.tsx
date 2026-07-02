import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Stack, TextField
} from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import { useBreadcrumb } from "./Shell"
import AssetFilterRail, {
  FilterState, INITIAL_FILTERS, WarrantyKey, applyFilters
} from "./AssetFilterRail"
import AssetRegister from "./AssetRegister"
import AssetDetailPage from "./AssetDetailPage"
import { Asset, HEADER_HEIGHT } from "../lib/infrastructure"

function buildDefaultFilters(): FilterState {
  return {
    siteIds: new Set(),
    roomIds: new Set(),
    cabinetIds: new Set(),
    types: new Set(),
    lifecycles: new Set(["ACTIVE"]),
    manufacturers: new Set(),
    warranty: new Set(),
    search: "",
  }
}

function toggleSetValue<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export default function AssetRegisterPage() {
  const params = useParams<{ assetId?: string }>()
  const navigate = useNavigate()
  const { setBreadcrumbs, setHideModuleLabel } = useBreadcrumb()

  React.useEffect(() => {
    setHideModuleLabel(true)
    return () => setHideModuleLabel(false)
  }, [setHideModuleLabel])

  // ── Filter state ──────────────────────────────────────────────────────
  const [filters, setFilters] = React.useState<FilterState>(() => buildDefaultFilters())
  const [searchInput, setSearchInput] = React.useState("")

  // ── Data query ────────────────────────────────────────────────────────
  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<Asset[]>("/assets")).data,
    staleTime: 5 * 60 * 1000
  })

  // ── Memoized rows ─────────────────────────────────────────────────────
  const filteredRegisterRows = React.useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
    const rows = applyFilters(allAssets, filters) as Asset[]
    return [...rows].sort((a, b) =>
      collator.compare(a.site?.name ?? "", b.site?.name ?? "")
      || collator.compare(a.cabinet?.room?.name ?? "", b.cabinet?.room?.name ?? "")
      || collator.compare(a.cabinet?.name ?? "", b.cabinet?.name ?? "")
      || ((b.uPosition ?? -1) - (a.uPosition ?? -1))
    )
  }, [allAssets, filters])

  // ── Fix parent overflow ───────────────────────────────────────────────
  const containerRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return
    const prev = parent.style.overflow
    parent.style.overflow = "hidden"
    return () => { parent.style.overflow = prev }
  }, [])

  // ── Breadcrumb ────────────────────────────────────────────────────────
  React.useEffect(() => {
    setBreadcrumbs([{ label: "Asset Register" }])
  }, [setBreadcrumbs])

  // ── Callbacks ─────────────────────────────────────────────────────────

  const handleRegisterAssetClick = React.useCallback((asset: Asset) => {
    navigate(`/asset-register/assets/${asset.id}`)
  }, [navigate])

  const handleBackToRegister = React.useCallback(() => {
    navigate("/asset-register")
  }, [navigate])

  const handleFilterToggleSite = React.useCallback((id: string) => {
    setFilters(prev => ({ ...prev, siteIds: toggleSetValue(prev.siteIds, id) }))
  }, [])
  const handleFilterToggleRoom = React.useCallback((id: string) => {
    setFilters(prev => ({ ...prev, roomIds: toggleSetValue(prev.roomIds, id) }))
  }, [])
  const handleFilterToggleCabinet = React.useCallback((id: string) => {
    setFilters(prev => ({ ...prev, cabinetIds: toggleSetValue(prev.cabinetIds, id) }))
  }, [])
  const handleToggleType = React.useCallback((v: string) => {
    setFilters(prev => ({ ...prev, types: toggleSetValue(prev.types, v) }))
  }, [])
  const handleToggleLifecycle = React.useCallback((v: string) => {
    setFilters(prev => ({ ...prev, lifecycles: toggleSetValue(prev.lifecycles, v) }))
  }, [])
  const handleToggleManufacturer = React.useCallback((v: string) => {
    setFilters(prev => ({ ...prev, manufacturers: toggleSetValue(prev.manufacturers, v) }))
  }, [])
  const handleToggleWarranty = React.useCallback((v: WarrantyKey) => {
    setFilters(prev => ({ ...prev, warranty: toggleSetValue(prev.warranty, v) }))
  }, [])
  const handleClearAllFilters = React.useCallback(() => {
    setFilters({ ...INITIAL_FILTERS, siteIds: new Set(), roomIds: new Set(), cabinetIds: new Set(), types: new Set(), lifecycles: new Set(), manufacturers: new Set(), warranty: new Set(), search: "" })
    setSearchInput("")
  }, [])
  const commitSearch = React.useCallback(() => {
    setFilters(prev => prev.search === searchInput ? prev : ({ ...prev, search: searchInput }))
  }, [searchInput])
  const clearCommittedSearch = React.useCallback(() => {
    setSearchInput("")
    setFilters(prev => prev.search === "" ? prev : ({ ...prev, search: "" }))
  }, [])

  const assetEmbedded = !!params.assetId

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Box ref={containerRef} sx={{
      mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" },
      height: "calc(100vh - 56px)", display: "flex", overflow: "hidden", bgcolor: "var(--color-background-tertiary)"
    }}>

      {/* ── Left panel (hidden when an asset is embedded) ───────────── */}
      {!assetEmbedded ? (
        <Box sx={{ width: 260, minWidth: 260, bgcolor: "var(--color-background-primary)", borderRight: "1px solid var(--color-border-primary)", overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column" }}>
          <AssetFilterRail
            assets={allAssets}
            filters={filters}
            filteredCount={filteredRegisterRows.length}
            totalCount={allAssets.length}
            onToggleSite={handleFilterToggleSite}
            onToggleRoom={handleFilterToggleRoom}
            onToggleCabinet={handleFilterToggleCabinet}
            onToggleType={handleToggleType}
            onToggleLifecycle={handleToggleLifecycle}
            onToggleManufacturer={handleToggleManufacturer}
            onToggleWarranty={handleToggleWarranty}
            onClearAll={handleClearAllFilters}
          />
        </Box>
      ) : null}

      {/* ── Right panel ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, minHeight: 0 }}>

        {/* ── Header bar (suppressed when an asset is embedded) ──────── */}
        {!assetEmbedded ? (
          <Box sx={{
            height: HEADER_HEIGHT, bgcolor: "var(--color-background-primary)",
            borderBottom: "1px solid var(--color-border-primary)",
            px: "24px", display: "flex", alignItems: "center", flexShrink: 0, gap: 2
          }}>
            <TextField
              size="small"
              placeholder="Search assets…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => {
                if (e.key !== "Enter") return
                e.preventDefault()
                commitSearch()
              }}
              sx={{ flex: 1, maxWidth: 420 }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ fontSize: 16, color: "text.tertiary", mr: 1 }} />,
                endAdornment: (
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: 1 }}>
                    {filters.search && searchInput === filters.search ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={clearCommittedSearch}
                        sx={{ fontSize: 11, textTransform: "none", minWidth: 0, px: 0.75, py: "2px", height: 24, color: "text.secondary" }}
                      >
                        Clear
                      </Button>
                    ) : null}
                    {searchInput !== filters.search ? (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={commitSearch}
                        sx={{ fontSize: 11, textTransform: "none", boxShadow: "none", minWidth: 0, px: 1.25, py: "2px", height: 24 }}
                      >
                        Search
                      </Button>
                    ) : null}
                  </Stack>
                ),
                sx: { fontSize: 12.5, bgcolor: "background.default", height: 34 },
              }}
            />
          </Box>
        ) : null}

        {/* ── Content body ───────────────────────────────────────────── */}
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
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AssetRegister filteredRows={filteredRegisterRows} onAssetClick={handleRegisterAssetClick} />
          </Box>
        )}
      </Box>
    </Box>
  )
}
