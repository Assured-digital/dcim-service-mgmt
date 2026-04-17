import React from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Chip, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import StorageIcon from "@mui/icons-material/Storage"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import AccountTreeIcon from "@mui/icons-material/AccountTree"
import ViewListIcon from "@mui/icons-material/ViewList"
import SearchIcon from "@mui/icons-material/Search"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import AssetFilterRail, {
  FilterState, INITIAL_FILTERS, WarrantyKey, applyFilters
} from "./AssetFilterRail"
import AssetRegister from "./AssetRegister"
import SiteHierarchyTree from "./SiteHierarchyTree"
import CabinetDetailView from "./CabinetDetailView"
import AssetDetailPage from "./AssetDetailPage"
import {
  AddSiteDialog, EditSiteDialog, AddRoomDialog, EditRoomDialog,
  AddCabinetDialog, EditCabinetDialog, AddAssetDialog,
  DeleteConfirmDialog
} from "./InfraDialogs"
import {
  Asset, Cabinet, Room, Site, ViewMode, InfoRow, HEADER_HEIGHT,
  uFill, barColor, formatKw, getApiErrorMessage
} from "../lib/infrastructure"

type DeleteTarget = { type: "site" | "room" | "cabinet" | "asset"; id: string; label: string }
type DialogKey = "addSite" | "editSite" | "addRoom" | "editRoom" | "addCabinet" | "editCabinet" | "addAsset" | null

function buildRegisterDefaultFilters(): FilterState {
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

// ─── Inlined detail views (small, memoized) ─────────────────────────────

const SiteDetailView = React.memo(function SiteDetailView({ site, rooms, cabinets }: { site: Site; rooms: Room[]; cabinets: Cabinet[] }) {
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
    <Box sx={{ p: "24px", maxWidth: 700 }}>
      <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", mb: "20px" }}>
        <Box sx={{ px: "20px", py: "16px", borderBottom: "1px solid #f1f5f9" }}>
          <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>Site Details</Typography>
          {infoRows.map(row => (
            <Box key={row.label} sx={{ display: "flex", alignItems: "baseline", py: "7px", borderBottom: "1px solid #f8fafc" }}>
              <Typography sx={{ fontSize: 12, color: "#64748b", width: 120 }}>{row.label}</Typography>
              <Typography sx={{ fontSize: 12.5, color: "#0f172a", fontWeight: 500 }}>{row.value}</Typography>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${summaryCards.length}, 1fr)` }}>
          {summaryCards.map((s, i) => (
            <Box key={s.label} sx={{ py: "14px", textAlign: "center", borderRight: i < summaryCards.length - 1 ? "1px solid #f1f5f9" : "none" }}>
              <Typography sx={{ fontSize: 22, fontWeight: 600, color: "#0f172a", lineHeight: 1 }}>{s.value}</Typography>
              <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", mt: "4px" }}>{s.label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
})

const RoomCabinetGrid = React.memo(function RoomCabinetGrid({ cabinets, onSelectCabinet }: { cabinets: Cabinet[]; onSelectCabinet: (id: string) => void }) {
  if (cabinets.length === 0) {
    return (
      <Box sx={{ p: "20px 24px" }}>
        <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: "10px" }}>
          <StorageIcon sx={{ fontSize: 32, color: "#e2e8f0", mb: 1 }} />
          <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No cabinets in this room</Typography>
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
          return (
            <Box key={c.id} onClick={() => onSelectCabinet(c.id)} sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", p: "16px 18px", cursor: "pointer", "&:hover": { borderColor: "#1d4ed8", boxShadow: "0 2px 12px rgba(29,78,216,0.08)" } }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "14px" }}>
                <Box sx={{ width: 32, height: 32, borderRadius: "7px", bgcolor: "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <StorageIcon sx={{ fontSize: 15, color: "#1d4ed8" }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{c.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{c._count.assets} assets</Typography>
                </Box>
              </Stack>
              {c.totalU ? (
                <Box sx={{ mb: "6px" }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: "3px" }}>
                    <Typography sx={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>U Space</Typography>
                    <Typography sx={{ fontSize: 9, fontWeight: 600, color: "#64748b" }}>{c.usedU ?? 0}/{c.totalU}U</Typography>
                  </Stack>
                  <Box sx={{ height: 3, bgcolor: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${fill}%`, bgcolor: barColor(fill), borderRadius: 2 }} />
                  </Box>
                </Box>
              ) : null}
              <Box>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: "3px" }}>
                  <Typography sx={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Power</Typography>
                  <Typography sx={{ fontSize: 9, fontWeight: 600, color: "#64748b" }}>{formatKw(totalPowerKw)} kW</Typography>
                </Stack>
                {c.powerKw && c.powerKw > 0 ? (
                  <Box sx={{ height: 3, bgcolor: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${powerPct}%`, bgcolor: barColor(powerPct), borderRadius: 2 }} />
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

// ─── Main page ──────────────────────────────────────────────────────────

export default function AssetManagementPage() {
  const params = useParams<{ siteId?: string; roomId?: string; cabinetId?: string; assetId?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setBreadcrumbs, setHideModuleLabel } = useBreadcrumb()

  // Asset module identifies itself via breadcrumbs (Asset Hierarchy / Asset Register),
  // so the redundant "Assets" module label in the top bar is suppressed on this page.
  React.useEffect(() => {
    setHideModuleLabel(true)
    return () => setHideModuleLabel(false)
  }, [setHideModuleLabel])

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  // ── View mode (derived from URL — no separate state, no sync effect) ──
  const view: ViewMode = searchParams.get("view") === "register" ? "register" : "hierarchy"

  // ── Selection state ────────────────────────────────────────────────────
  const [selectedSiteId, setSelectedSiteId] = React.useState<string | null>(params.siteId ?? null)
  const [openSiteIds, setOpenSiteIds] = React.useState<Set<string>>(new Set(params.siteId ? [params.siteId] : []))
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | "unassigned" | null>(params.roomId ?? null)
  const [selectedCabinetId, setSelectedCabinetId] = React.useState<string | null>(params.cabinetId ?? null)
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(params.assetId ?? null)
  const [openRoomId, setOpenRoomId] = React.useState<string | null>(params.roomId ?? null)
  const [openCabinetId, setOpenCabinetId] = React.useState<string | null>(params.cabinetId ?? null)

  // ── Filter state (register view) ──────────────────────────────────────
  // Single source of truth — checkboxes apply instantly.
  const [filters, setFilters] = React.useState<FilterState>(() => buildRegisterDefaultFilters())
  // Search is two-state: local input for typing, committed value in filters.search
  const [searchInput, setSearchInput] = React.useState("")

  // ── Dialog state ──────────────────────────────────────────────────────
  const [activeDialog, setActiveDialog] = React.useState<DialogKey>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget | null>(null)

  const { notify } = useNotification()

  // ── Fix parent overflow (Shell content area) ─────────────────────────
  // Negative margins push this page beyond Shell's padded content area.
  // Without this, the Shell generates page-level scrollbars.
  const containerRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const parent = containerRef.current?.parentElement
    if (!parent) return
    const prev = parent.style.overflow
    parent.style.overflow = "hidden"
    return () => { parent.style.overflow = prev }
  }, [])

  // ── Data queries ──────────────────────────────────────────────────────
  const { data: sites = [], isLoading: sitesLoading } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/sites")).data
  })
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
  const isLoading = sitesLoading || (view === "hierarchy" && (roomsLoading || cabinetsLoading))
  const selectedSite = React.useMemo(() => sites.find(s => s.id === selectedSiteId) ?? null, [sites, selectedSiteId])
  const selectedCabinet = React.useMemo(() => cabinets.find(c => c.id === selectedCabinetId) ?? null, [cabinets, selectedCabinetId])
  const selectedRoom = React.useMemo(() => rooms.find(r => r.id === selectedRoomId) ?? null, [rooms, selectedRoomId])

  const visibleCabinets = React.useMemo(() => {
    if (!selectedRoomId) return []
    if (selectedRoomId === "unassigned") return cabinets.filter(c => !c.roomId)
    return cabinets.filter(c => c.roomId === selectedRoomId)
  }, [selectedRoomId, cabinets])

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

  // ── Auto-select first site ────────────────────────────────────────────
  React.useEffect(() => {
    if (!selectedSiteId && sites.length > 0) {
      const first = sites[0].id
      setSelectedSiteId(first)
      setOpenSiteIds(prev => { const next = new Set(prev); next.add(first); return next })
    }
  }, [sites, selectedSiteId])

  // ── Breadcrumbs ───────────────────────────────────────────────────────
  React.useEffect(() => {
    if (view === "register") {
      setBreadcrumbs([{ label: "Asset Register" }])
      return
    }

    // Hierarchy view — "Asset Hierarchy" is always the root crumb
    const resetToRoot = () => {
      setSelectedSiteId(null); setOpenSiteIds(new Set())
      setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null)
      setOpenRoomId(null); setOpenCabinetId(null)
    }

    if (!selectedSite) {
      setBreadcrumbs([{ label: "Asset Hierarchy" }])
      return
    }

    const root = { label: "Asset Hierarchy", onClick: resetToRoot }
    const room = rooms.find(r => r.id === selectedRoomId)
    const cabinet = cabinets.find(c => c.id === selectedCabinetId)
    const asset = cabinet?.assets.find(a => a.id === selectedAssetId)

    if (asset && cabinet && room) {
      setBreadcrumbs([
        root,
        { label: selectedSite.name, onClick: () => { setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: room.name, onClick: () => { setSelectedRoomId(room.id); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: cabinet.name, onClick: () => { setSelectedCabinetId(cabinet.id); setSelectedAssetId(null) } },
        { label: asset.name }
      ])
    } else if (cabinet && room) {
      setBreadcrumbs([
        root,
        { label: selectedSite.name, onClick: () => { setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: room.name, onClick: () => { setSelectedRoomId(room.id); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: cabinet.name }
      ])
    } else if (room) {
      setBreadcrumbs([
        root,
        { label: selectedSite.name, onClick: () => { setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: room.name }
      ])
    } else {
      setBreadcrumbs([root, { label: selectedSite.name }])
    }
  }, [view, selectedSite, selectedRoomId, selectedCabinetId, selectedAssetId, rooms, cabinets, setBreadcrumbs])

  React.useEffect(() => {
    if (view !== "register") return
    setFilters(prev => {
      if (prev.lifecycles.size > 0) return prev
      return { ...prev, lifecycles: new Set(["ACTIVE"]) }
    })
  }, [view])

  // ── URL params sync ───────────────────────────────────────────────────
  React.useEffect(() => {
    if (!params.siteId && !params.roomId && !params.cabinetId && !params.assetId) return
    if (params.siteId) { setSelectedSiteId(params.siteId); setOpenSiteIds(prev => new Set([...prev, params.siteId!])) }
    if (params.roomId) { setSelectedRoomId(params.roomId); setOpenRoomId(params.roomId) }
    if (params.cabinetId) { setSelectedCabinetId(params.cabinetId); setOpenCabinetId(params.cabinetId) }
    if (params.assetId) setSelectedAssetId(params.assetId)
  }, [params.siteId, params.roomId, params.cabinetId, params.assetId])

  // ── Stable tree callbacks ─────────────────────────────────────────────

  const handleSelectSite = React.useCallback((siteId: string) => {
    setSelectedSiteId(siteId)
    setOpenSiteIds(prev => new Set([...prev, siteId]))
    setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null)
    setOpenRoomId(null); setOpenCabinetId(null)
  }, [])

  const handleToggleSite = React.useCallback((siteId: string) => {
    setOpenSiteIds(prev => { const next = new Set(prev); if (next.has(siteId)) next.delete(siteId); else next.add(siteId); return next })
  }, [])

  const handleSelectRoom = React.useCallback((roomId: string | "unassigned") => {
    setSelectedRoomId(roomId); setSelectedCabinetId(null); setSelectedAssetId(null); setOpenCabinetId(null)
    if (typeof roomId === "string" && roomId !== "unassigned") setOpenRoomId(roomId); else setOpenRoomId(null)
  }, [])

  const handleToggleRoom = React.useCallback((roomId: string) => {
    setOpenRoomId(prev => prev === roomId ? null : roomId)
  }, [])

  const handleSelectCabinet = React.useCallback((cabinetId: string, roomId: string | null) => {
    setSelectedCabinetId(cabinetId); setSelectedAssetId(null)
    if (roomId) { setSelectedRoomId(roomId); setOpenRoomId(roomId) }
    setOpenCabinetId(cabinetId)
  }, [])

  const handleToggleCabinet = React.useCallback((cabinetId: string) => {
    setOpenCabinetId(prev => prev === cabinetId ? null : cabinetId)
  }, [])

  const handleSelectAsset = React.useCallback((assetId: string, cabinetId: string, roomId: string | null) => {
    setSelectedAssetId(assetId); setSelectedCabinetId(cabinetId)
    if (roomId) { setSelectedRoomId(roomId); setOpenRoomId(roomId) }
    setOpenCabinetId(cabinetId)
    if (selectedSiteId) {
      const viewParam = searchParams.get("view")
      const suffix = viewParam ? `?view=${viewParam}` : ""
      navigate(`/asset-management/${selectedSiteId}/assets/${assetId}${suffix}`)
    }
  }, [navigate, selectedSiteId, searchParams])

  const handleSelectCabinetFromGrid = React.useCallback((cabinetId: string) => {
    const cab = cabinets.find(c => c.id === cabinetId)
    setSelectedCabinetId(cabinetId); setSelectedAssetId(null)
    if (cab?.roomId) { setSelectedRoomId(cab.roomId); setOpenRoomId(cab.roomId) }
    setOpenCabinetId(cabinetId)
  }, [cabinets])

  const handleCabinetSelectAsset = React.useCallback((id: string | null) => {
    setSelectedAssetId(id)
  }, [])

  const handleRegisterAssetClick = React.useCallback((asset: Asset) => {
    if (!asset.siteId) return
    navigate(`/asset-management/${asset.siteId}/assets/${asset.id}?view=register`)
  }, [navigate])

  const handleBackToRegister = React.useCallback(() => {
    navigate("/asset-management?view=register")
  }, [navigate])

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

  // ── View toggling ─────────────────────────────────────────────────────

  const onSetView = React.useCallback((next: ViewMode) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set("view", next)
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

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

  // ── Edge states ───────────────────────────────────────────────────────

  if (sitesLoading && !selectedSiteId && view === "hierarchy") return <LoadingState />
  if (view === "hierarchy" && !selectedSiteId && sites.length === 0) {
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
    : "Assets"

  // When an asset is addressed in the URL, AssetDetailPage (embedded) takes
  // over the right pane — it brings its own header and action buttons.
  const assetEmbedded = !!params.assetId
  const hideLeftPanel = view === "register" && assetEmbedded

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <Box ref={containerRef} sx={{
      mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" },
      height: "calc(100vh - 56px)", display: "flex", overflow: "hidden", bgcolor: "var(--color-background-tertiary)"
    }}>

      {/* ── Left panel (hidden on register + asset) ──────────────────── */}
      {!hideLeftPanel ? (
        <Box sx={{ width: 260, minWidth: 260, bgcolor: "var(--color-background-primary)", borderRight: "1px solid var(--color-border-primary)", overflow: "hidden", flexShrink: 0, display: "flex", flexDirection: "column" }}>

          <Box sx={{ borderBottom: "1px solid var(--color-border-primary)", flexShrink: 0, height: HEADER_HEIGHT, display: "flex", alignItems: "center" }}>
            <Tabs value={view} onChange={(_e, v) => onSetView(v)} variant="fullWidth"
              sx={{
                minHeight: "100%", width: "100%",
                "& .MuiTab-root": { minHeight: HEADER_HEIGHT, fontSize: 12, fontWeight: 500, textTransform: "none", color: "#64748b", "&.Mui-selected": { color: "#1d4ed8" } },
                "& .MuiTabs-indicator": { bgcolor: "#1d4ed8" },
              }}>
              <Tab value="hierarchy" icon={<AccountTreeIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="Hierarchy" />
              <Tab value="register" icon={<ViewListIcon sx={{ fontSize: 14 }} />} iconPosition="start" label="Register" />
            </Tabs>
          </Box>

          {view === "register" ? (
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
          ) : (
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
          )}
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
            {view === "register" ? (
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
                  startAdornment: <SearchIcon sx={{ fontSize: 16, color: "#94a3b8", mr: 1 }} />,
                  endAdornment: (
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: 1 }}>
                      {filters.search && searchInput === filters.search ? (
                        <Button
                          size="small"
                          variant="text"
                          onClick={clearCommittedSearch}
                          sx={{ fontSize: 11, textTransform: "none", minWidth: 0, px: 0.75, py: "2px", height: 24, color: "#64748b" }}
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
                  sx: { fontSize: 12.5, bgcolor: "#f8fafc", height: 34 },
                }}
              />
            ) : (
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {headerEntityName}
              </Typography>
            )}

            {view === "hierarchy" && canManage ? (
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                {selectedCabinet ? (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />} onClick={() => setActiveDialog("editCabinet")} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>Edit</Button>
                    <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={() => setActiveDialog("addAsset")} sx={{ fontSize: 12 }}>Add asset</Button>
                  </>
                ) : selectedRoom ? (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />} onClick={() => setActiveDialog("editRoom")} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>Edit</Button>
                    <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={() => setActiveDialog("addCabinet")} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>Add cabinet</Button>
                  </>
                ) : selectedSite ? (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />} onClick={() => setActiveDialog("editSite")} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>Edit</Button>
                    <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 13 }} />} onClick={() => setActiveDialog("addRoom")} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>Add room</Button>
                  </>
                ) : null}
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
              manageBreadcrumb={view === "hierarchy"}
              onBackToRegister={view === "register" ? handleBackToRegister : undefined}
            />
          </Box>
        ) : view === "register" ? (
          <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AssetRegister filteredRows={filteredRegisterRows} onAssetClick={handleRegisterAssetClick} />
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {isLoading ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}

            {!isLoading && selectedCabinet ? (
              <CabinetDetailView
                cabinet={selectedCabinet} room={selectedRoom}
                selectedAssetId={selectedAssetId}
                onSelectAsset={handleCabinetSelectAsset}
                canManage={canManage}
              />
            ) : null}

            {!isLoading && !selectedCabinet && selectedRoomId ? (
              <RoomCabinetGrid cabinets={visibleCabinets} onSelectCabinet={handleSelectCabinetFromGrid} />
            ) : null}

            {!isLoading && !selectedRoomId && selectedSite ? (
              <SiteDetailView site={selectedSite} rooms={rooms} cabinets={cabinets} />
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
        <AddAssetDialog cabinets={cabinets} defaultCabinetId={selectedCabinetId ?? undefined} contextLabel={selectedCabinet?.name} onClose={() => setActiveDialog(null)} onSave={handleSaveAsset} />
      )}
      {deleteTarget && (
        <DeleteConfirmDialog type={deleteTarget.type} label={deleteTarget.label} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteConfirmed} />
      )}
    </Box>
  )
}