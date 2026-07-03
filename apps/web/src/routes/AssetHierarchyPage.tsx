import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, MenuItem, Stack, TextField, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import StorageIcon from "@mui/icons-material/Storage"
import { EditActionsButton } from "../components/EditActionsButton"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { useBreadcrumb } from "./Shell"
import { useThemeMode } from "../lib/theme"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import SiteHierarchyTree from "./SiteHierarchyTree"
import CabinetDetailView from "./CabinetDetailView"
import AssetDetailPage from "./AssetDetailPage"
import CapacityRing from "../components/shared/CapacityRing"
import { FloorCanvas } from "../components/floorplan/FloorCanvas"
import { FloorLens, getFloorPlan } from "../lib/floorPlan"
import { ListToolbar, SegmentedToggle, ToolbarButton } from "../components/shared/ListToolbar"
import { AttachmentsContent } from "../components/AttachmentsContent"
import { WorkNotesPanel } from "../components/shared/WorkNotesPanel"
import SiteLocationCard from "../components/SiteLocationCard"
import SiteLinkedRecords from "./SiteLinkedRecords"
import {
  AddSiteDialog, EditSiteDialog, AddRoomDialog, EditRoomDialog,
  AddCabinetDialog, EditCabinetDialog, AddAssetDialog,
  DeleteConfirmDialog
} from "./InfraDialogs"
import {
  Asset, Cabinet, Room, Site, InfoRow, HEADER_HEIGHT,
  uFill, barColor, formatKw, getApiErrorMessage
} from "../lib/infrastructure"

type DeleteTarget = { type: "site" | "room" | "cabinet" | "asset"; id: string; label: string }
type DialogKey = "addSite" | "editSite" | "addRoom" | "editRoom" | "addCabinet" | "editCabinet" | "addAsset" | null

// ─── Inlined detail views (small, memoized) ─────────────────────────────

const SiteDetailView = React.memo(function SiteDetailView({ site, rooms, cabinets, canManage }: { site: Site; rooms: Room[]; cabinets: Cabinet[]; canManage: boolean }) {
  const stats = React.useMemo(() => {
    const totalAssets = cabinets.reduce((s, c) => s + c._count.assets, 0)
    const totalU = cabinets.reduce((s, c) => s + (c.totalU ?? 0), 0)
    const usedU = cabinets.reduce((s, c) => s + (c.usedU ?? 0), 0)
    return { totalAssets, totalU, usedU }
  }, [cabinets])

  const infoRows = React.useMemo(() => [
    site.address ? { label: "Address", value: site.address } : null,
    site.city ? { label: "City", value: site.city } : null,
    site.postcode ? { label: "Postcode", value: site.postcode } : null,
    { label: "Country", value: site.country },
    site.notes ? { label: "Notes", value: site.notes } : null,
  ].filter((r): r is InfoRow => r !== null), [site])

  const summaryCards = React.useMemo(() => {
    const cards: { label: string; value: string | number }[] = [
      { label: "Rooms", value: rooms.length },
      { label: "Cabinets", value: cabinets.length },
      { label: "Assets", value: stats.totalAssets },
    ]
    if (stats.totalU > 0) cards.push({ label: "U Used", value: `${stats.usedU}/${stats.totalU}` })
    return cards
  }, [rooms.length, cabinets.length, stats])

  return (
    <Box sx={{ p: "24px", maxWidth: 960 }}>
      <Stack spacing="16px">
        <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
          <Box sx={{ px: "20px", py: "16px", borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "text.secondary", mb: "10px" }}>Site Details</Typography>
            {infoRows.map(row => (
              <Box key={row.label} sx={{ display: "flex", alignItems: "baseline", py: "7px", borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography sx={{ fontSize: 12, color: "text.secondary", width: 120 }}>{row.label}</Typography>
                <Typography sx={{ fontSize: 12.5, color: "text.primary", fontWeight: 500 }}>{row.value}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${summaryCards.length}, 1fr)` }}>
            {summaryCards.map((s, i) => (
              <Box key={s.label} sx={{ py: "14px", textAlign: "center", borderRight: i < summaryCards.length - 1 ? "1px solid" : "none", borderColor: "divider" }}>
                <Typography sx={{ fontSize: 22, fontWeight: 600, color: "text.primary", lineHeight: 1 }}>{s.value}</Typography>
                <Typography sx={{ fontSize: 10, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mt: "4px" }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
        <SiteLocationCard site={site} />
        <SiteLinkedRecords siteId={site.id} siteName={site.name} canManage={canManage} />
        {/* Documents + Work notes (Hyperview pattern). */}
        <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
          <Box sx={{ px: "20px", py: "14px", borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.tertiary" }}>Documents</Typography>
          </Box>
          <Box sx={{ p: "12px 20px" }}>
            <SiteDocuments site={site} />
          </Box>
        </Box>
        <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
          <Box sx={{ px: "20px", py: "14px", borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.tertiary" }}>Work notes</Typography>
          </Box>
          <Box sx={{ p: "12px 20px" }}>
            <WorkNotesPanel entityType="site" entityId={site.id} />
          </Box>
        </Box>
      </Stack>
    </Box>
  )
})

// Documents card body — changes refetch the site detail (the resolver re-runs).
function SiteDocuments({ site }: { site: Site }) {
  const qc = useQueryClient()
  return (
    <AttachmentsContent
      attachments={site.attachments ?? []}
      recordType="site"
      recordId={site.id}
      onChanged={() => qc.invalidateQueries({ queryKey: ["site-detail", site.id] })}
    />
  )
}

const RoomCabinetGrid = React.memo(function RoomCabinetGrid({ cabinets, onSelectCabinet }: { cabinets: Cabinet[]; onSelectCabinet: (id: string) => void }) {
  const { mode } = useThemeMode()
  const trackBg = mode === "dark" ? "#1e293b" : "#f1f5f9"
  if (cabinets.length === 0) {
    return (
      <Box sx={{ p: "20px 24px" }}>
        <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed", borderColor: "divider", borderRadius: "10px" }}>
          <StorageIcon sx={{ fontSize: 32, color: "text.tertiary", mb: 1 }} />
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No cabinets in this room</Typography>
        </Box>
      </Box>
    )
  }
  return (
    <Box sx={{ p: "20px 24px" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
        {cabinets.map(c => {
          const fill = uFill(c.usedU, c.totalU)
          const totalPowerKw = c.assets.reduce((sum, a) => sum + (a.powerDrawW ?? 0), 0) / 1000
          const powerPct = c.powerKw && c.powerKw > 0 ? Math.min(100, Math.round((totalPowerKw / c.powerKw) * 100)) : 0
          const totalWeightKg = c.assets.reduce((sum, a) => a.lifecycleState === "RETIRED" ? sum : sum + (a.weightKg ?? 0), 0)
          const weightPct = c.maxWeightKg && c.maxWeightKg > 0 ? Math.min(100, Math.round((totalWeightKg / c.maxWeightKg) * 100)) : 0
          const stranded = (fill >= 85 && powerPct <= 50) || (powerPct >= 85 && fill <= 50)
          return (
            <Box key={c.id} onClick={() => onSelectCabinet(c.id)} sx={{ position: "relative", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "16px 18px", cursor: "pointer", "&:hover": { borderColor: "primary.main", boxShadow: "0 2px 12px rgba(29,78,216,0.08)" } }}>
              {stranded ? (
                <Typography sx={{
                  position: "absolute", top: 10, right: 10, fontSize: 9, fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.05em", px: "6px", py: "2px", borderRadius: "6px",
                  bgcolor: mode === "dark" ? "#3a2c0f" : "#fef3c7", color: mode === "dark" ? "#fbbf24" : "#b45309"
                }}>Stranded</Typography>
              ) : null}
              <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: "12px" }}>
                <Box sx={{ width: 32, height: 32, borderRadius: "8px", bgcolor: mode === "dark" ? "#16294a" : "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <StorageIcon sx={{ fontSize: 15, color: "primary.main" }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                    {c.totalU ? `${c.totalU}U · ` : ""}{c._count.assets} asset{c._count.assets === 1 ? "" : "s"}
                  </Typography>
                </Box>
                {c.totalU ? <CapacityRing pct={fill} /> : null}
              </Stack>
              {c.totalU ? (
                <Box sx={{ mb: "10px" }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: "4px" }}>
                    <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>Space</Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{c.usedU ?? 0}/{c.totalU}U</Typography>
                  </Stack>
                  <Box sx={{ height: 6, bgcolor: trackBg, borderRadius: "4px", overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${fill}%`, bgcolor: barColor(fill, mode), borderRadius: "4px" }} />
                  </Box>
                </Box>
              ) : null}
              <Box sx={{ mb: "10px" }}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: "4px" }}>
                  <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>Power</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                    {formatKw(totalPowerKw)}{c.powerKw && c.powerKw > 0 ? ` / ${formatKw(c.powerKw)}` : ""} kW
                  </Typography>
                </Stack>
                {c.powerKw && c.powerKw > 0 ? (
                  <Box sx={{ height: 6, bgcolor: trackBg, borderRadius: "4px", overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${powerPct}%`, bgcolor: barColor(powerPct, mode), borderRadius: "4px" }} />
                  </Box>
                ) : null}
              </Box>
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: "4px" }}>
                  <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>Weight</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                    {c.maxWeightKg && c.maxWeightKg > 0 ? `${Math.round(totalWeightKg)}/${Math.round(c.maxWeightKg)} kg` : "—"}
                  </Typography>
                </Stack>
                {c.maxWeightKg && c.maxWeightKg > 0 ? (
                  <Box sx={{ height: 6, bgcolor: trackBg, borderRadius: "4px", overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${weightPct}%`, bgcolor: barColor(weightPct, mode), borderRadius: "4px" }} />
                  </Box>
                ) : null}
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
})

// Room-level view of the spatial spine (redesign mock, screen 3): the room's
// floor plan LEADS — lens-coloured cabinets, find-space, click-through to the
// cabinet's detail/elevation — with the card grid as a toggle and the automatic
// fallback for rooms with nothing placed. Editing stays on the full floor-plan
// editor ("Edit layout" deep-links there); this embed is read-only.
type RoomView = "plan" | "grid" | "details"

const RoomPlanView = React.memo(function RoomPlanView({ siteId, roomId, cabinets, onSelectCabinet, canManage, roomOptions, onRoomChange, view, onViewChange, detailsContent, trailing }: {
  siteId: string; roomId: string; cabinets: Cabinet[]; onSelectCabinet: (id: string) => void; canManage: boolean
  // Site-level embed: a room switcher at the front of the toolbar (the
  // floor-plan-forward site view) + extra trailing controls.
  roomOptions?: { id: string; name: string }[]
  onRoomChange?: (roomId: string) => void
  // Controlled view (site level): the parent owns the tab so the choice
  // survives a round-trip. `detailsContent` (when given) adds a Details tab
  // that renders BELOW the SAME toolbar — the room switcher stays visible.
  view?: RoomView
  onViewChange?: (v: RoomView) => void
  detailsContent?: React.ReactNode
  trailing?: React.ReactNode
}) {
  const navigate = useNavigate()
  const [internalView, setInternalView] = React.useState<RoomView | null>(null) // null = auto
  const [lens, setLens] = React.useState<FloorLens>("space")
  const [findSpaceU, setFindSpaceU] = React.useState<number | null>(null)

  const { data: plan, isLoading } = useQuery({
    queryKey: ["floor-plan", roomId],
    queryFn: () => getFloorPlan(roomId),
  })

  const placedCount = plan?.cabinets.length ?? 0
  const effectiveView = view ?? internalView ?? (placedCount > 0 ? "plan" : "grid")
  const changeView = (v: RoomView) => (onViewChange ? onViewChange(v) : setInternalView(v))

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <ListToolbar sx={{ bgcolor: "transparent" }}>
        {roomOptions && onRoomChange ? (
          <TextField select size="small" label="Room" value={roomId} onChange={e => onRoomChange(e.target.value)} sx={{ minWidth: 150, mr: 0.5 }}>
            {roomOptions.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          </TextField>
        ) : null}
        <SegmentedToggle
          options={[
            { value: "plan", label: "Plan" },
            { value: "grid", label: "Grid" },
            ...(detailsContent ? [{ value: "details" as const, label: "Details" }] : []),
          ]}
          value={effectiveView}
          onChange={v => changeView(v as RoomView)}
        />
        {effectiveView === "plan" ? (
          <>
            <SegmentedToggle
              options={[{ value: "space", label: "Space" }, { value: "power", label: "Power" }, { value: "status", label: "Status" }]}
              value={lens} onChange={v => setLens(v)} sx={{ ml: 1 }}
            />
            <ToolbarButton variant={findSpaceU != null ? "primary" : "default"} sx={{ ml: 1 }}
              onClick={() => setFindSpaceU(v => (v == null ? 10 : null))}>
              Find ≥10U free
            </ToolbarButton>
          </>
        ) : null}
        <Box sx={{ ml: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          {trailing}
          {canManage && effectiveView !== "details" ? (
            <ToolbarButton onClick={() => navigate(`/dcim/floor-plan?siteId=${siteId}&roomId=${roomId}`)}>
              Edit layout
            </ToolbarButton>
          ) : null}
        </Box>
      </ListToolbar>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {effectiveView === "details" ? (
          detailsContent
        ) : effectiveView === "grid" ? (
          <RoomCabinetGrid cabinets={cabinets} onSelectCabinet={onSelectCabinet} />
        ) : isLoading ? (
          <Box sx={{ p: 3 }}><LoadingState /></Box>
        ) : plan && placedCount > 0 ? (
          <FloorCanvas
            plan={plan} lens={lens} mode="view"
            selectedCabinetId={null} findSpaceMinU={findSpaceU} placing={false}
            onCabinetClick={onSelectCabinet}
            onObjectClick={() => {}} onCellClick={() => {}}
          />
        ) : (
          <Box sx={{ p: "20px 24px" }}>
            <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed", borderColor: "divider", borderRadius: "10px" }}>
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                No cabinets placed on this room's floor plan yet{canManage ? " — use Edit layout to position them." : "."}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
})

// ─── Main page ──────────────────────────────────────────────────────────

export default function AssetHierarchyPage() {
  const params = useParams<{ siteId?: string; roomId?: string; cabinetId?: string; assetId?: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setBreadcrumbs, setPageFullBleed } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  // ── Selection state ────────────────────────────────────────────────────
  const [selectedSiteId, setSelectedSiteId] = React.useState<string | null>(params.siteId ?? null)
  const [openSiteIds, setOpenSiteIds] = React.useState<Set<string>>(new Set(params.siteId ? [params.siteId] : []))
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | "unassigned" | null>(params.roomId ?? null)
  const [selectedCabinetId, setSelectedCabinetId] = React.useState<string | null>(params.cabinetId ?? null)
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(params.assetId ?? null)
  // Site level is floor-plan-forward: the featured room's plan leads, Details
  // is the toggle-away. The Plan/Grid choice lives HERE (not in RoomPlanView)
  // so it survives a round-trip through Details. Local preview state only —
  // the tree/URL stay on the site.
  const [siteView, setSiteView] = React.useState<"plan" | "grid" | "details">("plan")
  const [siteRoomId, setSiteRoomId] = React.useState<string | null>(null)
  React.useEffect(() => { setSiteView("plan"); setSiteRoomId(null) }, [selectedSiteId])
  const [openRoomId, setOpenRoomId] = React.useState<string | null>(params.roomId ?? null)
  const [openCabinetId, setOpenCabinetId] = React.useState<string | null>(params.cabinetId ?? null)

  // ── Dialog state ──────────────────────────────────────────────────────
  const [activeDialog, setActiveDialog] = React.useState<DialogKey>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)
  // A3: elevation click-empty-U-to-add prefill (spec §2.1) — cleared on close.
  const [addAssetPrefill, setAddAssetPrefill] = React.useState<{ u: number; side: "FRONT" | "REAR" } | null>(null)

  const { notify } = useNotification()

  // ── Full-bleed: the Shell drops content padding + hides overflow, so this
  //    navigator owns its own edge-to-edge layout and internal scrolling. ──
  React.useEffect(() => {
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [setPageFullBleed])

  // ── Data queries ──────────────────────────────────────────────────────
  const { data: sites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/sites")).data
  })

  // No estate-level overview here any more (the DCIM Overview page owns that
  // job) — a bare /asset-hierarchy lands straight on the first site.
  React.useEffect(() => {
    if (!params.siteId && sites.length) navigate(`/asset-hierarchy/${sites[0].id}`, { replace: true })
  }, [params.siteId, sites, navigate])
  const { data: site } = useQuery({
    queryKey: ["site-detail", selectedSiteId],
    queryFn: async () => (await api.get<Site>(`/sites/${selectedSiteId}`)).data,
    enabled: !!selectedSiteId
  })
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ["site-rooms", selectedSiteId],
    queryFn: async () => (await api.get<Room[]>(`/sites/${selectedSiteId}/rooms`)).data,
    enabled: !!selectedSiteId
  })
  const { data: cabinets = [], isLoading: cabinetsLoading } = useQuery({
    queryKey: ["site-cabinets", selectedSiteId],
    queryFn: async () => (await api.get<Cabinet[]>(`/sites/${selectedSiteId}/cabinets`)).data,
    enabled: !!selectedSiteId
  })
  const { data: allAssets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<Asset[]>("/assets")).data,
    staleTime: 5 * 60 * 1000
  })

  // ── Memoized derived values ───────────────────────────────────────────
  const isLoading = sitesLoading || roomsLoading || cabinetsLoading
  const selectedSite = React.useMemo(() => sites.find(s => s.id === selectedSiteId) ?? null, [sites, selectedSiteId])
  const selectedCabinet = React.useMemo(() => cabinets.find(c => c.id === selectedCabinetId) ?? null, [cabinets, selectedCabinetId])
  const selectedRoom = React.useMemo(() => {
    if (selectedRoomId && selectedRoomId !== "unassigned") {
      return rooms.find(r => r.id === selectedRoomId) ?? null
    }
    // Cabinet URLs don't include roomId — derive from cabinet data
    if (selectedCabinet?.roomId) {
      return rooms.find(r => r.id === selectedCabinet.roomId) ?? null
    }
    return null
  }, [rooms, selectedRoomId, selectedCabinet])

  const visibleCabinets = React.useMemo(() => {
    if (!selectedRoomId) return []
    if (selectedRoomId === "unassigned") return cabinets.filter(c => !c.roomId)
    return cabinets.filter(c => c.roomId === selectedRoomId)
  }, [selectedRoomId, cabinets])

  // ── Breadcrumbs ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!selectedSite) {
      setBreadcrumbs([])
      return
    }

    const siteId = selectedSite.id
    const site = { label: selectedSite.name, onClick: () => navigate(`/asset-hierarchy/${siteId}`) }
    const cabinet = cabinets.find(c => c.id === selectedCabinetId)
    const room = rooms.find(r => r.id === selectedRoomId) ?? (cabinet?.roomId ? rooms.find(r => r.id === cabinet.roomId) : null)
    const asset = cabinet?.assets.find(a => a.id === selectedAssetId)

    if (asset && cabinet && room) {
      setBreadcrumbs([
        site,
        { label: room.name, onClick: () => navigate(`/asset-hierarchy/${siteId}/rooms/${room.id}`) },
        { label: cabinet.name, onClick: () => navigate(`/asset-hierarchy/${siteId}/cabinets/${cabinet.id}`) },
        { label: asset.name }
      ])
    } else if (cabinet && room) {
      setBreadcrumbs([
        site,
        { label: room.name, onClick: () => navigate(`/asset-hierarchy/${siteId}/rooms/${room.id}`) },
        { label: cabinet.name }
      ])
    } else if (room) {
      setBreadcrumbs([site, { label: room.name }])
    } else {
      setBreadcrumbs([{ label: selectedSite.name }])
    }
  }, [selectedSite, selectedRoomId, selectedCabinetId, selectedAssetId, rooms, cabinets, setBreadcrumbs, navigate])

  // ── URL params sync ───────────────────────────────────────────────────
  // URL is source of truth: clear state fields when URL doesn't include them,
  // otherwise navigating from an asset to a room leaves the asset view stuck.
  // Exception: asset URLs (/assets/:id) don't carry cabinet/room context, so
  // derive them from the asset's owning cabinet — otherwise the breadcrumb
  // and hierarchy tree collapse to "Site + Asset" with the middle missing.
  React.useEffect(() => {
    setSelectedSiteId(params.siteId ?? null)
    if (params.siteId) setOpenSiteIds(new Set([params.siteId]))
    if (params.assetId && !params.cabinetId) {
      const owning = cabinets.find(c => c.assets.some(a => a.id === params.assetId))
      setSelectedCabinetId(owning?.id ?? null)
      if (owning?.id) setOpenCabinetId(owning.id)
      setSelectedRoomId(owning?.roomId ?? null)
      if (owning?.roomId) setOpenRoomId(owning.roomId)
    } else {
      setSelectedRoomId(params.roomId ?? null)
      if (params.roomId) setOpenRoomId(params.roomId)
      setSelectedCabinetId(params.cabinetId ?? null)
      if (params.cabinetId) setOpenCabinetId(params.cabinetId)
    }
    setSelectedAssetId(params.assetId ?? null)
  }, [params.siteId, params.roomId, params.cabinetId, params.assetId, cabinets])

  // ── Tree callbacks ────────────────────────────────────────────────────

  const handleSelectSite = React.useCallback((siteId: string) => {
    setSelectedSiteId(siteId)
    setOpenSiteIds(new Set([siteId]))
    setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null)
    setOpenRoomId(null); setOpenCabinetId(null)
    navigate(`/asset-hierarchy/${siteId}`)
  }, [navigate])

  const handleToggleSite = React.useCallback((siteId: string) => {
    setOpenSiteIds(prev => { const next = new Set(prev); if (next.has(siteId)) next.delete(siteId); else next.add(siteId); return next })
  }, [])

  const handleSelectRoom = React.useCallback((roomId: string | "unassigned") => {
    setSelectedRoomId(roomId); setSelectedCabinetId(null); setSelectedAssetId(null); setOpenCabinetId(null)
    if (typeof roomId === "string" && roomId !== "unassigned") setOpenRoomId(roomId); else setOpenRoomId(null)
    if (selectedSiteId) {
      if (typeof roomId === "string" && roomId !== "unassigned") navigate(`/asset-hierarchy/${selectedSiteId}/rooms/${roomId}`)
      else navigate(`/asset-hierarchy/${selectedSiteId}`)
    }
  }, [navigate, selectedSiteId])

  const handleToggleRoom = React.useCallback((roomId: string) => {
    setOpenRoomId(prev => prev === roomId ? null : roomId)
  }, [])

  const handleSelectCabinet = React.useCallback((cabinetId: string, roomId: string | null) => {
    setSelectedCabinetId(cabinetId); setSelectedAssetId(null)
    if (roomId) { setSelectedRoomId(roomId); setOpenRoomId(roomId) }
    setOpenCabinetId(cabinetId)
    if (selectedSiteId) navigate(`/asset-hierarchy/${selectedSiteId}/cabinets/${cabinetId}`)
  }, [navigate, selectedSiteId])

  const handleToggleCabinet = React.useCallback((cabinetId: string) => {
    setOpenCabinetId(prev => prev === cabinetId ? null : cabinetId)
  }, [])

  const handleSelectAsset = React.useCallback((assetId: string, cabinetId: string, roomId: string | null) => {
    setSelectedAssetId(assetId); setSelectedCabinetId(cabinetId)
    if (roomId) { setSelectedRoomId(roomId); setOpenRoomId(roomId) }
    setOpenCabinetId(cabinetId)
    if (selectedSiteId) {
      navigate(`/asset-hierarchy/${selectedSiteId}/assets/${assetId}`)
    }
  }, [navigate, selectedSiteId])

  const handleSelectCabinetFromGrid = React.useCallback((cabinetId: string) => {
    const cab = cabinets.find(c => c.id === cabinetId)
    setSelectedCabinetId(cabinetId); setSelectedAssetId(null)
    if (cab?.roomId) { setSelectedRoomId(cab.roomId); setOpenRoomId(cab.roomId) }
    setOpenCabinetId(cabinetId)
    if (selectedSiteId) navigate(`/asset-hierarchy/${selectedSiteId}/cabinets/${cabinetId}`)
  }, [cabinets, navigate, selectedSiteId])

  const handleCabinetSelectAsset = React.useCallback((id: string | null) => {
    setSelectedAssetId(id)
  }, [])

  // ── Dialog save handlers ──────────────────────────────────────────────

  const handleSaveSite = React.useCallback(async (data: any) => {
    try {
      const created = await api.post<Site>("/sites", data)
      await qc.refetchQueries({ queryKey: ["sites"] })
      handleSelectSite(created.data.id)
      notify.success("Site created")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to create site")); throw e }
  }, [qc, handleSelectSite, notify])

  const handleUpdateSite = React.useCallback(async (data: any) => {
    if (!selectedSiteId) return
    try {
      await api.put(`/sites/${selectedSiteId}`, data)
      await Promise.all([qc.refetchQueries({ queryKey: ["site-detail", selectedSiteId] }), qc.refetchQueries({ queryKey: ["sites"] })])
      notify.success("Site updated")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to update site")); throw e }
  }, [selectedSiteId, qc, notify])

  const handleSaveRoom = React.useCallback(async (data: { name: string; type: string }) => {
    if (!selectedSiteId) return
    try {
      const res = await api.post<Room>(`/sites/${selectedSiteId}/rooms`, data)
      qc.invalidateQueries({ queryKey: ["site-rooms", selectedSiteId] })
      handleSelectRoom(res.data.id)
      notify.success("Room created")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to create room")); throw e }
  }, [selectedSiteId, qc, handleSelectRoom, notify])

  const handleUpdateRoom = React.useCallback(async (data: { name: string; type: string }) => {
    if (!selectedSiteId || !selectedRoom) return
    try {
      await api.put(`/sites/${selectedSiteId}/rooms/${selectedRoom.id}`, data)
      await qc.refetchQueries({ queryKey: ["site-rooms", selectedSiteId] })
      notify.success("Room updated")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to update room")); throw e }
  }, [selectedSiteId, selectedRoom, qc, notify])

  const handleSaveCabinet = React.useCallback(async (data: any) => {
    if (!selectedSiteId) return
    try {
      const res = await api.post<Cabinet>(`/sites/${selectedSiteId}/cabinets`, data)
      qc.invalidateQueries({ queryKey: ["site-cabinets", selectedSiteId] })
      handleSelectCabinet(res.data.id, data.roomId ?? null)
      notify.success("Cabinet created")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to create cabinet")); throw e }
  }, [selectedSiteId, qc, handleSelectCabinet, notify])

  const handleUpdateCabinet = React.useCallback(async (data: any) => {
    if (!selectedSiteId || !selectedCabinet) return
    try {
      await api.put(`/sites/${selectedSiteId}/cabinets/${selectedCabinet.id}`, data)
      await qc.refetchQueries({ queryKey: ["site-cabinets", selectedSiteId] })
      notify.success("Cabinet updated")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to update cabinet")); throw e }
  }, [selectedSiteId, selectedCabinet, qc, notify])

  const handleSaveAsset = React.useCallback(async (data: any) => {
    if (!selectedSiteId) return
    try {
      await api.post("/assets", { ...data, ownerType: "CLIENT", siteId: selectedSiteId, lifecycleState: "ACTIVE" })
      await Promise.all([qc.refetchQueries({ queryKey: ["site-cabinets", selectedSiteId] }), qc.refetchQueries({ queryKey: ["assets"] })])
      notify.success("Asset created")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to create asset")); throw e }
  }, [selectedSiteId, qc, notify])

  const handleDeleteConfirmed = React.useCallback(async () => {
    if (!deleteTarget || !selectedSiteId) return
    try {
      if (deleteTarget.type === "site") {
        await api.delete(`/sites/${deleteTarget.id}`)
        setSelectedSiteId(null)
        await qc.refetchQueries({ queryKey: ["sites"] })
        notify.success("Site deleted")
      } else if (deleteTarget.type === "room") {
        await api.delete(`/sites/${selectedSiteId}/rooms/${deleteTarget.id}`)
        setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null); setOpenRoomId(null); setOpenCabinetId(null)
        await Promise.all([qc.refetchQueries({ queryKey: ["site-rooms", selectedSiteId] }), qc.refetchQueries({ queryKey: ["site-cabinets", selectedSiteId] })])
        notify.success("Room deleted")
      } else if (deleteTarget.type === "cabinet") {
        await api.delete(`/sites/${selectedSiteId}/cabinets/${deleteTarget.id}`)
        setSelectedCabinetId(null); setSelectedAssetId(null); setOpenCabinetId(null)
        await qc.refetchQueries({ queryKey: ["site-cabinets", selectedSiteId] })
        notify.success("Cabinet deleted")
      } else if (deleteTarget.type === "asset") {
        await api.delete(`/assets/${deleteTarget.id}`)
        setSelectedAssetId(null)
        await Promise.all([qc.refetchQueries({ queryKey: ["site-cabinets", selectedSiteId] }), qc.refetchQueries({ queryKey: ["assets"] })])
        notify.success("Asset deleted")
      }
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Failed to delete record")); throw e }
  }, [deleteTarget, selectedSiteId, qc, notify])

  // ── Edge states ───────────────────────────────────────────────────────

  if (sitesLoading && !selectedSiteId) return <LoadingState />
  if (!selectedSiteId && sites.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <ErrorState title="No sites found" />
        {canManage ? <Button onClick={() => setActiveDialog("addSite")} variant="contained" size="small">Add site</Button> : null}
        {activeDialog === "addSite" && <AddSiteDialog onClose={() => setActiveDialog(null)} onSave={handleSaveSite} />}
      </Box>
    )
  }

  const headerEntityName = selectedCabinet ? selectedCabinet.name
    : selectedRoom ? selectedRoom.name
    : selectedSite ? selectedSite.name
    : "Estate"

  const assetEmbedded = !!params.assetId

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Box sx={{
      height: "100%", width: "100%", display: "flex", overflow: "hidden", bgcolor: "var(--color-background-tertiary)"
    }}>

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <Box sx={{ width: 260, minWidth: 260, bgcolor: "var(--color-background-primary)", borderRight: "1px solid var(--color-border-primary)", overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <SiteHierarchyTree
          sites={sites} rooms={rooms} cabinets={cabinets}
          selectedSiteId={selectedSiteId} selectedRoomId={selectedRoomId}
          selectedCabinetId={selectedCabinetId} selectedAssetId={selectedAssetId}
          openSiteIds={openSiteIds} openRoomId={openRoomId} openCabinetId={openCabinetId}
          isLoading={isLoading}
          onSelectSite={handleSelectSite} onToggleSite={handleToggleSite}
          onSelectRoom={handleSelectRoom} onToggleRoom={handleToggleRoom}
          onSelectCabinet={handleSelectCabinet} onToggleCabinet={handleToggleCabinet}
          onSelectAsset={handleSelectAsset}
        />
      </Box>

      {/* ── Right panel ──────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, minHeight: 0 }}>

        {/* ── Header bar ────────────────────────────────────────────── */}
        {!assetEmbedded ? (
          <Box sx={{
            height: HEADER_HEIGHT, bgcolor: "var(--color-background-primary)",
            borderBottom: "1px solid var(--color-border-primary)",
            px: "24px", display: "flex", alignItems: "center", flexShrink: 0, gap: 2
          }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {headerEntityName}
            </Typography>

            {canManage ? (
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <ToolbarButton onClick={() => navigate(`/dcim/place${selectedSiteId ? `?siteId=${selectedSiteId}` : ""}`)}>
                  Place equipment
                </ToolbarButton>
                {selectedCabinet ? (
                  <EditActionsButton
                    onEdit={() => setActiveDialog("editCabinet")}
                    actions={[
                      { label: "Add asset", onClick: () => setActiveDialog("addAsset") },
                    ]}
                  />
                ) : selectedRoom ? (
                  <EditActionsButton
                    onEdit={() => setActiveDialog("editRoom")}
                    actions={[
                      { label: "Add cabinet", onClick: () => setActiveDialog("addCabinet") },
                    ]}
                  />
                ) : selectedSite ? (
                  <EditActionsButton
                    onEdit={() => setActiveDialog("editSite")}
                    actions={[
                      { label: "Add room", onClick: () => setActiveDialog("addRoom") },
                    ]}
                  />
                ) : (
                  <EditActionsButton
                    editLabel="Add site"
                    editIcon={<AddIcon sx={{ fontSize: 13 }} />}
                    onEdit={() => setActiveDialog("addSite")}
                  />
                )}
              </Stack>
            ) : null}
          </Box>
        ) : null}

        {/* ── Content body ───────────────────────────────────────────── */}
        {assetEmbedded ? (
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AssetDetailPage
              mode="embedded"
              assetIdProp={params.assetId}
              manageBreadcrumb
            />
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {isLoading || !selectedSiteId ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}

            {selectedSiteId && !isLoading && selectedCabinet ? (
              <CabinetDetailView
                cabinet={selectedCabinet} room={selectedRoom}
                selectedAssetId={selectedAssetId}
                onSelectAsset={handleCabinetSelectAsset}
                onAddAssetAt={(u, side) => { setAddAssetPrefill({ u, side }); setActiveDialog("addAsset") }}
                canManage={canManage}
              />
            ) : null}

            {selectedSiteId && !isLoading && !selectedCabinet && selectedRoomId ? (
              <RoomPlanView
                siteId={selectedSiteId} roomId={selectedRoomId}
                cabinets={visibleCabinets} onSelectCabinet={handleSelectCabinetFromGrid}
                canManage={canManage}
              />
            ) : null}

            {selectedSiteId && !isLoading && !selectedRoomId && selectedSite ? (
              // Floor-plan-forward site view (brief §4.1): the featured room's
              // plan leads; Plan/Grid/Details is one toggle sharing ONE toolbar
              // (the room switcher stays visible in Details too).
              (() => {
                const featuredRoomId = siteRoomId ?? rooms[0]?.id ?? null
                // Roomless site: no plan/grid to show — just the details record.
                if (!featuredRoomId) {
                  return <SiteDetailView site={site ?? selectedSite} rooms={rooms} cabinets={cabinets} canManage={canManage} />
                }
                return (
                  <RoomPlanView
                    siteId={selectedSiteId} roomId={featuredRoomId}
                    cabinets={cabinets.filter(c => c.roomId === featuredRoomId)}
                    onSelectCabinet={handleSelectCabinetFromGrid}
                    canManage={canManage}
                    roomOptions={rooms.map(r => ({ id: r.id, name: r.name }))}
                    onRoomChange={setSiteRoomId}
                    view={siteView}
                    onViewChange={v => setSiteView(v)}
                    detailsContent={<SiteDetailView site={site ?? selectedSite} rooms={rooms} cabinets={cabinets} canManage={canManage} />}
                  />
                )
              })()
            ) : null}
          </Box>
        )}
      </Box>

      {/* ── Lazy-mounted dialogs ─────────────────────────────────────── */}
      {activeDialog === "addSite" && (
        <AddSiteDialog onClose={() => setActiveDialog(null)} onSave={handleSaveSite} />
      )}
      {activeDialog === "editSite" && site && (
        <EditSiteDialog site={site} onClose={() => setActiveDialog(null)} onSave={handleUpdateSite} />
      )}
      {activeDialog === "addRoom" && (
        <AddRoomDialog onClose={() => setActiveDialog(null)} onSave={handleSaveRoom} />
      )}
      {activeDialog === "editRoom" && selectedRoom && (
        <EditRoomDialog room={selectedRoom} onClose={() => setActiveDialog(null)} onSave={handleUpdateRoom} />
      )}
      {activeDialog === "addCabinet" && (
        <AddCabinetDialog rooms={rooms} defaultRoomId={selectedRoom?.id} contextLabel={selectedRoom?.name} onClose={() => setActiveDialog(null)} onSave={handleSaveCabinet} />
      )}
      {activeDialog === "editCabinet" && selectedCabinet && (
        <EditCabinetDialog cabinet={selectedCabinet} rooms={rooms} onClose={() => setActiveDialog(null)} onSave={handleUpdateCabinet} />
      )}
      {activeDialog === "addAsset" && (
        <AddAssetDialog cabinets={cabinets} defaultCabinetId={selectedCabinetId ?? undefined} contextLabel={selectedCabinet?.name}
          defaultUPosition={addAssetPrefill?.u} defaultRackSide={addAssetPrefill?.side}
          onClose={() => { setActiveDialog(null); setAddAssetPrefill(null) }} onSave={handleSaveAsset} />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog type={deleteTarget.type} label={deleteTarget.label} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirmed} />
      )}
    </Box>
  )
}
