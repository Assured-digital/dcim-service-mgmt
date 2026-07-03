import React from "react"
import { Box, Button, Checkbox, Stack, Typography } from "@mui/material"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight"
import { useThemeMode } from "../lib/theme"
import { Asset, assetTypeAccent, lifecycleGlyphColor } from "../lib/infrastructure"

// ─── Types ─────────────────────────────────────────────────────────────────

export type WarrantyKey = "expired" | "soon" | "healthy"

export type FilterState = {
  siteIds: Set<string>
  roomIds: Set<string>
  cabinetIds: Set<string>
  types: Set<string>
  lifecycles: Set<string>
  manufacturers: Set<string>
  warranty: Set<WarrantyKey>
  search: string
}

export const INITIAL_FILTERS: FilterState = {
  siteIds: new Set(),
  roomIds: new Set(),
  cabinetIds: new Set(),
  types: new Set(),
  lifecycles: new Set(),
  manufacturers: new Set(),
  warranty: new Set(),
  search: "",
}

export type FilterKey = keyof FilterState

interface AssetFilterRailProps {
  assets: Asset[]
  filters: FilterState
  filteredCount: number
  totalCount: number
  onToggleSite: (id: string) => void
  onToggleRoom: (id: string) => void
  onToggleCabinet: (id: string) => void
  onToggleType: (type: string) => void
  onToggleLifecycle: (lc: string) => void
  onToggleManufacturer: (m: string) => void
  onToggleWarranty: (w: WarrantyKey) => void
  onClearAll: () => void
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const LIFECYCLE_LABEL: Record<string, string> = {
  ACTIVE: "Active", STAGING: "Staging", PLANNED: "Planned",
  PROCUREMENT: "Procurement", RETIRED: "Retired",
}

const UNKNOWN_MANUFACTURER = "Unknown"

function warrantyStatus(expiry: string | null): "expired" | "soon" | "ok" | "none" {
  if (!expiry) return "none"
  const d = new Date(expiry)
  const now = new Date()
  const in30 = new Date(now.getTime() + 30 * 86400000)
  if (d < now) return "expired"
  if (d < in30) return "soon"
  return "ok"
}

export function activeFilterCount(f: FilterState): number {
  return (
    f.siteIds.size + f.roomIds.size + f.cabinetIds.size +
    f.types.size + f.lifecycles.size + f.manufacturers.size + f.warranty.size +
    (f.search ? 1 : 0)
  )
}

export function applyFilters(assets: Asset[], filters: FilterState): Asset[] {
  return assets.filter(a => {
    if (filters.siteIds.size > 0 && !filters.siteIds.has(a.siteId ?? "")) return false
    if (filters.roomIds.size > 0) {
      const rid = a.cabinet?.roomId ?? ""
      if (!filters.roomIds.has(rid)) return false
    }
    if (filters.cabinetIds.size > 0 && !filters.cabinetIds.has(a.cabinetId ?? "")) return false
    if (filters.types.size > 0 && !filters.types.has(a.assetType)) return false
    if (filters.lifecycles.size > 0 && !filters.lifecycles.has(a.lifecycleState)) return false
    if (filters.manufacturers.size > 0 && !filters.manufacturers.has(a.manufacturer ?? UNKNOWN_MANUFACTURER)) return false
    if (filters.warranty.size > 0) {
      const s = warrantyStatus(a.warrantyExpiry)
      const mapped: WarrantyKey | null = s === "expired" ? "expired" : s === "soon" ? "soon" : s === "ok" ? "healthy" : null
      if (!mapped || !filters.warranty.has(mapped)) return false
    }
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const hay = [
        a.name, a.assetTag, a.assetType, a.manufacturer,
        a.modelNumber, a.serialNumber, a.ipAddress,
        a.cabinet?.name, a.cabinet?.room?.name, a.site?.name
      ].filter(Boolean).join(" ").toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

// Re-apply every filter dimension EXCEPT the one specified, used to compute
// contextual option lists for each filter group (so toggling a checkbox inside
// a group doesn't make its siblings disappear).
function emptyForKey(key: FilterKey): FilterState[FilterKey] {
  if (key === "search") return ""
  return new Set()
}
function applyFiltersExcluding(assets: Asset[], filters: FilterState, excludeKeys: FilterKey[]): Asset[] {
  const patched = { ...filters } as FilterState
  for (const k of excludeKeys) (patched as any)[k] = emptyForKey(k)
  return applyFilters(assets, patched)
}

// ─── Flat checkbox filter group ─────────────────────────────────────────

const MAX_VISIBLE = 5

// An option's identity glyph: a square swatch (type identity) or a round dot
// (state severity), coloured by the caller. Purely decorative — the checkbox
// carries the interaction.
export type OptionGlyph = { color: string; shape: "square" | "dot" }
type FilterItem = { key: string; label: string; count?: number; glyph?: OptionGlyph }

function FilterGroup({ label, items, selected, onToggle }: {
  label: string
  items: FilterItem[]
  selected: Set<string>
  onToggle: (key: string) => void
}) {
  const [showAll, setShowAll] = React.useState(false)
  const activeCount = items.reduce((n, i) => n + (selected.has(i.key) ? 1 : 0), 0)
  const visible = showAll ? items : items.slice(0, MAX_VISIBLE)
  const hasMore = items.length > MAX_VISIBLE

  if (items.length === 0) return null

  return (
    <Box sx={{ mb: "14px" }}>
      <Stack direction="row" alignItems="center" sx={{ px: "12px", mb: "4px" }}>
        <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
          {label}
        </Typography>
        {activeCount > 0 ? (
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: "primary.main" }}>
            {activeCount}
          </Typography>
        ) : null}
      </Stack>
      {visible.map(item => {
        const isActive = selected.has(item.key)
        return (
          <Stack key={item.key} direction="row" alignItems="center"
            onClick={() => onToggle(item.key)}
            sx={{ px: "12px", py: "3px", cursor: "pointer", borderRadius: "5px", "&:hover": { bgcolor: "action.hover" } }}>
            <Checkbox checked={isActive} size="small"
              sx={{ p: 0, mr: "8px", "& .MuiSvgIcon-root": { fontSize: 15 } }} />
            {item.glyph ? (
              <Box sx={{
                width: item.glyph.shape === "square" ? 9 : 8,
                height: item.glyph.shape === "square" ? 9 : 8,
                borderRadius: item.glyph.shape === "square" ? "3px" : "50%",
                bgcolor: item.glyph.color, mr: "7px", flexShrink: 0,
              }} />
            ) : null}
            <Typography sx={{ flex: 1, fontSize: 12, color: isActive ? "primary.main" : "text.secondary", fontWeight: isActive ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </Typography>
            {item.count != null ? (
              <Typography sx={{ fontSize: 10.5, color: "text.tertiary", ml: "6px", fontVariantNumeric: "tabular-nums" }}>
                {item.count}
              </Typography>
            ) : null}
          </Stack>
        )
      })}
      {hasMore ? (
        <Typography
          onClick={() => setShowAll(s => !s)}
          sx={{ fontSize: 11, color: "primary.main", cursor: "pointer", px: "12px", pt: "2px" }}>
          {showAll ? "Show less" : `Show ${items.length - MAX_VISIBLE} more…`}
        </Typography>
      ) : null}
    </Box>
  )
}

// ─── Location tree (Site → Room → Cabinet) ─────────────────────────────

type CabinetNode = { id: string; name: string }
type RoomNode = { id: string; name: string; cabinets: CabinetNode[] }
type SiteNode = { id: string; name: string; rooms: RoomNode[] }

function buildLocationTree(assets: Asset[]): SiteNode[] {
  const sites = new Map<string, SiteNode>()
  for (const a of assets) {
    const siteId = a.siteId ?? ""
    const siteName = a.site?.name ?? "Unassigned site"
    if (!siteId) continue
    let site = sites.get(siteId)
    if (!site) { site = { id: siteId, name: siteName, rooms: [] }; sites.set(siteId, site) }

    const roomId = a.cabinet?.roomId ?? ""
    const roomName = a.cabinet?.room?.name ?? (roomId ? "Unknown room" : "Unassigned room")
    let room = site.rooms.find(r => r.id === roomId)
    if (!room) { room = { id: roomId, name: roomName, cabinets: [] }; site.rooms.push(room) }

    const cabinetId = a.cabinetId ?? ""
    if (!cabinetId) continue
    if (!room.cabinets.find(c => c.id === cabinetId)) {
      room.cabinets.push({ id: cabinetId, name: a.cabinet?.name ?? "Unknown cabinet" })
    }
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
  const sorted = Array.from(sites.values()).sort((a, b) => collator.compare(a.name, b.name))
  for (const s of sorted) {
    s.rooms.sort((a, b) => collator.compare(a.name, b.name))
    for (const r of s.rooms) r.cabinets.sort((a, b) => collator.compare(a.name, b.name))
  }
  return sorted
}

function LocationTree({
  tree, visible, filters, onToggleSite, onToggleRoom, onToggleCabinet,
}: {
  tree: SiteNode[]
  visible: { siteIds: Set<string>; roomIds: Set<string>; cabinetIds: Set<string> }
  filters: FilterState
  onToggleSite: (id: string) => void
  onToggleRoom: (id: string) => void
  onToggleCabinet: (id: string) => void
}) {
  const [expandedSites, setExpandedSites] = React.useState<Set<string>>(new Set())
  const [expandedRooms, setExpandedRooms] = React.useState<Set<string>>(new Set())

  const toggleSetLocal = (set: Set<string>, setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setter(next)
  }

  const siteCheckState = (s: SiteNode) => {
    const visibleCabs = s.rooms.flatMap(r => r.cabinets).filter(c => visible.cabinetIds.has(c.id))
    const visibleRooms = s.rooms.filter(r => visible.roomIds.has(r.id))
    const siteSelected = filters.siteIds.has(s.id)
    const anyDescendantSelected =
      visibleRooms.some(r => filters.roomIds.has(r.id)) ||
      visibleCabs.some(c => filters.cabinetIds.has(c.id))
    if (siteSelected) return "checked"
    if (anyDescendantSelected) return "indeterminate"
    return "unchecked"
  }
  const roomCheckState = (r: RoomNode) => {
    const visibleCabs = r.cabinets.filter(c => visible.cabinetIds.has(c.id))
    const roomSelected = filters.roomIds.has(r.id)
    const anyCabinetSelected = visibleCabs.some(c => filters.cabinetIds.has(c.id))
    if (roomSelected) return "checked"
    if (anyCabinetSelected) return "indeterminate"
    return "unchecked"
  }

  const visibleSites = tree.filter(s => visible.siteIds.has(s.id))
  if (visibleSites.length === 0) return null

  const selectedCount =
    (Array.from(filters.siteIds).filter(id => visible.siteIds.has(id)).length) +
    (Array.from(filters.roomIds).filter(id => visible.roomIds.has(id)).length) +
    (Array.from(filters.cabinetIds).filter(id => visible.cabinetIds.has(id)).length)

  return (
    <Box sx={{ mb: "14px" }}>
      <Stack direction="row" alignItems="center" sx={{ px: "12px", mb: "4px" }}>
        <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
          Location
        </Typography>
        {selectedCount > 0 ? (
          <Typography sx={{ fontSize: 10, fontWeight: 600, color: "primary.main" }}>
            {selectedCount}
          </Typography>
        ) : null}
      </Stack>
      {visibleSites.map(site => {
        const siteState = siteCheckState(site)
        const siteOpen = expandedSites.has(site.id)
        const siteVisibleRooms = site.rooms.filter(r => visible.roomIds.has(r.id))
        return (
          <Box key={site.id}>
            <Stack direction="row" alignItems="center"
              sx={{ pl: "8px", pr: "12px", py: "3px", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
              <Box
                onClick={e => { e.stopPropagation(); toggleSetLocal(expandedSites, setExpandedSites, site.id) }}
                sx={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", mr: "2px", color: "text.tertiary" }}
              >
                {siteVisibleRooms.length > 0 ? (
                  siteOpen ? <KeyboardArrowDownIcon sx={{ fontSize: 14 }} /> : <KeyboardArrowRightIcon sx={{ fontSize: 14 }} />
                ) : null}
              </Box>
              <Box onClick={() => onToggleSite(site.id)} sx={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
                <Checkbox
                  checked={siteState === "checked"}
                  indeterminate={siteState === "indeterminate"}
                  size="small"
                  sx={{ p: 0, mr: "8px", "& .MuiSvgIcon-root": { fontSize: 15 } }}
                />
                <Typography sx={{
                  flex: 1, fontSize: 12,
                  color: siteState !== "unchecked" ? "primary.main" : "text.secondary",
                  fontWeight: siteState !== "unchecked" ? 500 : 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>
                  {site.name}
                </Typography>
              </Box>
            </Stack>
            {siteOpen && siteVisibleRooms.map(room => {
              const roomState = roomCheckState(room)
              const roomOpen = expandedRooms.has(room.id)
              const roomVisibleCabs = room.cabinets.filter(c => visible.cabinetIds.has(c.id))
              return (
                <Box key={room.id}>
                  <Stack direction="row" alignItems="center"
                    sx={{ pl: "26px", pr: "12px", py: "3px", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
                    <Box
                      onClick={e => { e.stopPropagation(); toggleSetLocal(expandedRooms, setExpandedRooms, room.id) }}
                      sx={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", mr: "2px", color: "text.tertiary" }}
                    >
                      {roomVisibleCabs.length > 0 ? (
                        roomOpen ? <KeyboardArrowDownIcon sx={{ fontSize: 14 }} /> : <KeyboardArrowRightIcon sx={{ fontSize: 14 }} />
                      ) : null}
                    </Box>
                    <Box onClick={() => onToggleRoom(room.id)} sx={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0 }}>
                      <Checkbox
                        checked={roomState === "checked"}
                        indeterminate={roomState === "indeterminate"}
                        size="small"
                        sx={{ p: 0, mr: "8px", "& .MuiSvgIcon-root": { fontSize: 15 } }}
                      />
                      <Typography sx={{
                        flex: 1, fontSize: 12,
                        color: roomState !== "unchecked" ? "primary.main" : "text.secondary",
                        fontWeight: roomState !== "unchecked" ? 500 : 400,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>
                        {room.name}
                      </Typography>
                    </Box>
                  </Stack>
                  {roomOpen && roomVisibleCabs.map(cab => {
                    const selected = filters.cabinetIds.has(cab.id)
                    return (
                      <Stack key={cab.id} direction="row" alignItems="center"
                        onClick={() => onToggleCabinet(cab.id)}
                        sx={{ pl: "48px", pr: "12px", py: "3px", cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}>
                        <Checkbox
                          checked={selected}
                          size="small"
                          sx={{ p: 0, mr: "8px", "& .MuiSvgIcon-root": { fontSize: 15 } }}
                        />
                        <Typography sx={{
                          flex: 1, fontSize: 12,
                          color: selected ? "primary.main" : "text.secondary",
                          fontWeight: selected ? 500 : 400,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>
                          {cab.name}
                        </Typography>
                      </Stack>
                    )
                  })}
                </Box>
              )
            })}
          </Box>
        )
      })}
    </Box>
  )
}

// ─── Main component ───────────────────────────────────────────────────────

const AssetFilterRail = React.memo(function AssetFilterRail({
  assets, filters, filteredCount, totalCount,
  onToggleSite, onToggleRoom, onToggleCabinet,
  onToggleType, onToggleLifecycle, onToggleManufacturer, onToggleWarranty, onClearAll,
}: AssetFilterRailProps) {
  const { mode } = useThemeMode()

  // Full site→room→cabinet tree (name-stable) derived from all assets.
  const locationTree = React.useMemo(() => buildLocationTree(assets), [assets])

  // Contextual option sets: each group uses every OTHER active filter, and
  // carries a per-option count from that same subset.
  const typeOptions = React.useMemo(() => {
    const sub = applyFiltersExcluding(assets, filters, ["types"])
    const counts = new Map<string, number>()
    for (const a of sub) counts.set(a.assetType, (counts.get(a.assetType) ?? 0) + 1)
    return Array.from(counts.keys()).sort().map(key => ({
      key, label: key, count: counts.get(key),
      glyph: { color: assetTypeAccent(key, mode).fg, shape: "square" as const },
    }))
  }, [assets, filters, mode])

  const lifecycleOptions = React.useMemo(() => {
    const sub = applyFiltersExcluding(assets, filters, ["lifecycles"])
    const counts = new Map<string, number>()
    for (const a of sub) counts.set(a.lifecycleState, (counts.get(a.lifecycleState) ?? 0) + 1)
    return ["ACTIVE", "STAGING", "PLANNED", "PROCUREMENT", "RETIRED"]
      .filter(lc => counts.has(lc))
      .map(lc => ({
        key: lc, label: LIFECYCLE_LABEL[lc] ?? lc, count: counts.get(lc),
        glyph: { color: lifecycleGlyphColor(lc, mode), shape: "dot" as const },
      }))
  }, [assets, filters, mode])

  const manufacturerOptions = React.useMemo(() => {
    const sub = applyFiltersExcluding(assets, filters, ["manufacturers"])
    const counts = new Map<string, number>()
    for (const a of sub) {
      const m = a.manufacturer ?? UNKNOWN_MANUFACTURER
      counts.set(m, (counts.get(m) ?? 0) + 1)
    }
    return Array.from(counts.keys()).sort().map(key => ({ key, label: key, count: counts.get(key) }))
  }, [assets, filters])

  const warrantyOptions = React.useMemo(() => {
    const sub = applyFiltersExcluding(assets, filters, ["warranty"])
    let expired = 0, soon = 0, healthy = 0
    for (const a of sub) {
      const s = warrantyStatus(a.warrantyExpiry)
      if (s === "expired") expired++
      else if (s === "soon") soon++
      else if (s === "ok") healthy++
    }
    // Severity dots share the RAG scale used across the module (barColor ramp).
    const sev = mode === "dark"
      ? { expired: "#ef4444", soon: "#f59e0b", healthy: "#22c55e" }
      : { expired: "#b91c1c", soon: "#b45309", healthy: "#15803d" }
    return [
      { key: "expired", label: "Expired", count: expired, glyph: { color: sev.expired, shape: "dot" as const } },
      { key: "soon", label: "Expiring ≤30d", count: soon, glyph: { color: sev.soon, shape: "dot" as const } },
      { key: "healthy", label: "Healthy", count: healthy, glyph: { color: sev.healthy, shape: "dot" as const } },
    ].filter(w => w.count > 0)
  }, [assets, filters, mode])

  // Visible location ids for the tree — computed by excluding that dimension.
  const locationVisible = React.useMemo(() => {
    const siteSub = applyFiltersExcluding(assets, filters, ["siteIds"])
    const roomSub = applyFiltersExcluding(assets, filters, ["roomIds"])
    const cabinetSub = applyFiltersExcluding(assets, filters, ["cabinetIds"])
    const siteIds = new Set<string>()
    const roomIds = new Set<string>()
    const cabinetIds = new Set<string>()
    for (const a of siteSub) if (a.siteId) siteIds.add(a.siteId)
    for (const a of roomSub) { const r = a.cabinet?.roomId; if (r) roomIds.add(r) }
    for (const a of cabinetSub) if (a.cabinetId) cabinetIds.add(a.cabinetId)
    return { siteIds, roomIds, cabinetIds }
  }, [assets, filters])

  const count = activeFilterCount(filters)
  const warrantySelected = filters.warranty as unknown as Set<string>

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Stack direction="row" alignItems="center" sx={{ px: "12px", pt: "12px", pb: "6px", flexShrink: 0 }}>
        <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "text.tertiary" }}>
          Filters
        </Typography>
        {count > 0 ? (
          <Button size="small" onClick={onClearAll}
            sx={{ fontSize: 10.5, fontWeight: 600, textTransform: "none", minWidth: 0, px: "8px", py: "1px", color: "text.secondary", border: "1px solid", borderColor: "divider", borderRadius: "6px" }}>
            Clear · {count}
          </Button>
        ) : null}
      </Stack>
      <Box sx={{ flex: 1, overflowY: "auto", py: "4px" }}>
        <LocationTree
          tree={locationTree}
          visible={locationVisible}
          filters={filters}
          onToggleSite={onToggleSite}
          onToggleRoom={onToggleRoom}
          onToggleCabinet={onToggleCabinet}
        />
        <FilterGroup label="Type" items={typeOptions} selected={filters.types} onToggle={onToggleType} />
        <FilterGroup label="Lifecycle" items={lifecycleOptions} selected={filters.lifecycles} onToggle={onToggleLifecycle} />
        <FilterGroup label="Manufacturer" items={manufacturerOptions} selected={filters.manufacturers} onToggle={onToggleManufacturer} />
        <FilterGroup label="Warranty" items={warrantyOptions} selected={warrantySelected} onToggle={(k) => onToggleWarranty(k as WarrantyKey)} />
      </Box>

      <Box sx={{
        flexShrink: 0, borderTop: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        px: "12px", py: "8px",
      }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{filteredCount}</Box>
          {" of "}
          <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{totalCount}</Box>
          {" assets"}
        </Typography>
      </Box>
    </Box>
  )
})

export default AssetFilterRail
