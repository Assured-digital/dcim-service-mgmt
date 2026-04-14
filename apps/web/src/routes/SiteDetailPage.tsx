import React from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Drawer, IconButton, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import StorageIcon from "@mui/icons-material/Storage"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import MemoryIcon from "@mui/icons-material/Memory"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import { chipSx } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

// ── Types ──────────────────────────────────────────────────────────────────
type Asset = {
  id: string; name: string; assetTag: string; assetType: string
  uPosition: number | null; uHeight: number | null
  status: string; lifecycleState: string
  rackSide: "FRONT" | "REAR" | null
  manufacturer: string | null; modelNumber: string | null
  serialNumber: string | null; ipAddress: string | null; powerDrawW: number | null
}
type Cabinet = {
  id: string; name: string; type: string; roomId: string | null
  totalU: number | null; usedU: number | null; powerKw: number | null; notes: string | null
  _count: { assets: number }
  assets: Asset[]
}
type Room = { id: string; name: string; type: string; floor: string | null }
type Check = { id: string; reference: string; title: string; status: string; scheduledAt: string | null }
type Site = {
  id: string; name: string; address: string | null; city: string | null
  postcode: string | null; country: string; notes: string | null
  checks: Check[]
}
type AuditEvent = { id: string; action: string; createdAt: string; data?: { from?: string; to?: string; fields?: string[] } | null }
type LinkedTask = { id: string; reference: string; title: string; status: string; priority: string }
type LinkedServiceRequest = { id: string; reference: string; subject: string; status: string; priority: string }
type LinkedRisk = { id: string; reference: string; title: string; status: string; likelihood: string; impact: string }
type LinkedIssue = { id: string; reference: string; title: string; status: string; severity: string }

// ── Constants ──────────────────────────────────────────────────────────────
const ROOM_TYPE_LABELS: Record<string, string> = {
  DATA_HALL: "Data Hall", COMMS_ROOM: "Comms Room",
  SUPPORT: "Support Area", STORAGE: "Storage", OTHER: "Other"
}
const ASSET_TYPE_BG: Record<string, string> = {
  Server: "#dbeafe", Switch: "#fce7f3", Patch: "#f1f5f9",
  PDU: "#fef3c7", UPS: "#d1fae5", KVM: "#ede9fe", Firewall: "#fee2e2"
}
const ASSET_LIFECYCLE_OPTIONS = ["ACTIVE", "PLANNED", "PROCUREMENT", "STAGING", "RETIRED"]
function assetBg(type: string) { return ASSET_TYPE_BG[type] ?? "#f1f5f9" }
function lifecycleSx(state: string) {
  if (state === "ACTIVE") return { bgcolor: "#dcfce7", color: "#15803d" }
  if (state === "RETIRED") return { bgcolor: "#f1f5f9", color: "#64748b" }
  if (state === "STAGING") return { bgcolor: "#dbeafe", color: "#1d4ed8" }
  return { bgcolor: "#fef3c7", color: "#b45309" }
}
function barColor(pct: number) { return pct > 85 ? "#b91c1c" : pct > 65 ? "#b45309" : "#15803d" }
function uFill(used: number | null, total: number | null) {
  if (!total) return 0
  return Math.min(100, Math.round(((used ?? 0) / total) * 100))
}
function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return fallback
}
function normalizeRackSide(side: string | null | undefined): "FRONT" | "REAR" {
  return side === "REAR" ? "REAR" : "FRONT"
}
function formatKw(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}
function actionLabel(action: string, data?: { from?: string; to?: string; fields?: string[] } | null): string {
  if (action === "STATUS_UPDATED" && data?.from && data?.to) return `Status changed from ${data.from} to ${data.to}`
  if (action === "UPDATED" && data?.fields?.length) return `Updated ${data.fields.join(", ")}`
  if (action === "CREATED") return "Rack created"
  return action.replaceAll("_", " ").toLowerCase()
}

// ── Lifecycle stripe colours ────────────────────────────────────────────────
function stripeBg(state: string) {
  if (state === "ACTIVE") return "#22c55e"
  if (state === "STAGING") return "#8b5cf6"
  if (state === "PLANNED") return "#3b82f6"
  if (state === "RETIRED") return "#94a3b8"
  return "#f59e0b"
}

// ── Rack elevation — Opus style ─────────────────────────────────────────────
function RackElevation({
  assets,
  totalU,
  selectedAssetId,
  onSelectAsset
}: {
  assets: Asset[]
  totalU: number
  selectedAssetId: string | null
  // eslint-disable-next-line no-unused-vars
  onSelectAsset(id: string): void
}) {
  const total = totalU
  const H = 15 // px per U

  const slotMap: Record<number, Asset | null> = {}
  for (let u = 1; u <= total; u++) slotMap[u] = null
  assets.forEach(a => {
    if (a.uPosition != null) {
      for (let i = 0; i < (a.uHeight ?? 1); i++) slotMap[a.uPosition + i] = a
    }
  })

  const rendered = new Set<string>()
  const uNumbers: React.ReactElement[] = []
  const slots: React.ReactElement[] = []

  for (let u = total; u >= 1; u--) {
    uNumbers.push(
      <Box key={u} sx={{
        height: H, display: "flex", alignItems: "center", justifyContent: "flex-end",
        pr: "5px", fontSize: 9, fontFamily: "monospace",
        color: "#64748b", fontWeight: 600,
        userSelect: "none"
      }}>
        {u}
      </Box>
    )

    const asset = slotMap[u]
    if (!asset) {
      slots.push(
        <Box key={u} sx={{ height: H, borderBottom: "1px solid rgba(203,213,225,0.4)" }} />
      )
      continue
    }
    if (rendered.has(asset.id)) continue
    rendered.add(asset.id)

    const h = asset.uHeight ?? 1
    const isSelected = selectedAssetId === asset.id
    slots.push(
      <Tooltip key={`${asset.id}-${u}`}
        title={`${asset.name} · ${asset.assetType}${asset.manufacturer ? ` · ${asset.manufacturer}` : ""}`}
        placement="right" arrow>
        <Box onClick={() => onSelectAsset(asset.id)}
          sx={{
            height: H * h + Math.max(0, h - 1),
            display: "flex", alignItems: "stretch",
            bgcolor: assetBg(asset.assetType),
            border: isSelected ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.08)",
            boxShadow: isSelected ? "0 0 0 1px #2563eb" : "none",
            borderRadius: "2px", mb: "1px",
            cursor: "pointer", overflow: "hidden",
            transition: "all 0.1s",
            "&:hover": { boxShadow: isSelected ? "0 0 0 2px #2563eb" : "0 0 0 2px rgba(37,99,235,0.4)", zIndex: 1 }
          }}>
          {/* Equipment body */}
          <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", px: "7px", overflow: "hidden" }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
              {asset.name}
            </Typography>
            {h > 1 && asset.modelNumber ? (
              <Typography sx={{ fontSize: 9, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                {asset.modelNumber}
              </Typography>
            ) : null}
          </Box>
          {/* Lifecycle stripe on right */}
          <Box sx={{ width: 5, flexShrink: 0, bgcolor: stripeBg(asset.lifecycleState) }} />
        </Box>
      </Tooltip>
    )
  }

  return (
    <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      {/* U numbers column */}
      <Box sx={{ width: 26, flexShrink: 0, pt: "8px" }}>
        {uNumbers}
      </Box>
      {/* Rack frame */}
      <Box sx={{
        flex: 1,
        border: "2.5px solid #1e293b", borderRadius: "5px",
        bgcolor: "#f8fafc", p: "6px",
        boxShadow: "0 4px 12px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.6)"
      }}>
        {slots}
      </Box>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
type RackTab = "dashboard" | "elevation" | "assets" | "history" | "linked"
type ElevationSide = "FRONT" | "REAR"
type InfoRow = { label: string; value: string; mono?: boolean }

export default function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { setRecordLabel, setBreadcrumbs } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  // ── View state ──────────────────────────────────────────────────────
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | "unassigned" | null>(null)
  const [selectedCabinetId, setSelectedCabinetId] = React.useState<string | null>(null)
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(null)
  const [openRoomId, setOpenRoomId] = React.useState<string | null>(null)
  const [openCabinetId, setOpenCabinetId] = React.useState<string | null>(null)
  const [rackTab, setRackTab] = React.useState<RackTab>("dashboard")
  const [elevationSide, setElevationSide] = React.useState<ElevationSide>("FRONT")
  const [assetDrawerMode, setAssetDrawerMode] = React.useState<"lite" | "full">("lite")

  // ── Error ───────────────────────────────────────────────────────────
  const [error, setError] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)
  const [deleteTarget, setDeleteTarget] = React.useState<{
    type: "site" | "room" | "cabinet" | "asset"
    id: string
    label: string
  } | null>(null)

  // ── Room dialog ─────────────────────────────────────────────────────
  const [roomOpen, setRoomOpen] = React.useState(false)
  const [roomName, setRoomName] = React.useState("")
  const [roomType, setRoomType] = React.useState("DATA_HALL")
  const [savingRoom, setSavingRoom] = React.useState(false)
  const [roomEditOpen, setRoomEditOpen] = React.useState(false)
  const [savingRoomEdit, setSavingRoomEdit] = React.useState(false)

  // ── Cabinet dialog ──────────────────────────────────────────────────
  const [cabinetOpen, setCabinetOpen] = React.useState(false)
  const [cabinetName, setCabinetName] = React.useState("")
  const [cabinetType, setCabinetType] = React.useState("RACK")
  const [cabinetTotalU, setCabinetTotalU] = React.useState("")
  const [cabinetPowerKw, setCabinetPowerKw] = React.useState("")
  const [cabinetRoomId, setCabinetRoomId] = React.useState("")
  const [savingCabinet, setSavingCabinet] = React.useState(false)
  const [cabinetEditOpen, setCabinetEditOpen] = React.useState(false)
  const [savingCabinetEdit, setSavingCabinetEdit] = React.useState(false)

  // ── Asset dialog ────────────────────────────────────────────────────
  const [assetOpen, setAssetOpen] = React.useState(false)
  const [assetTag, setAssetTag] = React.useState("")
  const [assetName, setAssetName] = React.useState("")
  const [assetType, setAssetType] = React.useState("")
  const [assetManufacturer, setAssetManufacturer] = React.useState("")
  const [assetModel, setAssetModel] = React.useState("")
  const [assetSerial, setAssetSerial] = React.useState("")
  const [assetIp, setAssetIp] = React.useState("")
  const [assetUPos, setAssetUPos] = React.useState("")
  const [assetUHeight, setAssetUHeight] = React.useState("")
  const [assetPower, setAssetPower] = React.useState("")
  const [assetRackSide, setAssetRackSide] = React.useState<ElevationSide>("FRONT")
  const [assetCabinetId, setAssetCabinetId] = React.useState("")
  const [savingAsset, setSavingAsset] = React.useState(false)
  const [assetStatus, setAssetStatus] = React.useState("ACTIVE")
  const [assetLifecycle, setAssetLifecycle] = React.useState("ACTIVE")
  const [assetEditOpen, setAssetEditOpen] = React.useState(false)
  const [savingAssetEdit, setSavingAssetEdit] = React.useState(false)

  // ── Site edit dialog ────────────────────────────────────────────────
  const [siteEditOpen, setSiteEditOpen] = React.useState(false)
  const [siteName, setSiteName] = React.useState("")
  const [siteAddress, setSiteAddress] = React.useState("")
  const [siteCity, setSiteCity] = React.useState("")
  const [sitePostcode, setSitePostcode] = React.useState("")
  const [siteCountry, setSiteCountry] = React.useState("UK")
  const [siteNotes, setSiteNotes] = React.useState("")
  const [savingSiteEdit, setSavingSiteEdit] = React.useState(false)

  // ── Queries ─────────────────────────────────────────────────────────
  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ["site-detail", siteId],
    queryFn: async () => (await api.get<Site>(`/sites/${siteId}`)).data,
    enabled: !!siteId
  })
  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ["site-rooms", siteId],
    queryFn: async () => (await api.get<Room[]>(`/sites/${siteId}/rooms`)).data,
    enabled: !!siteId
  })
  const { data: cabinets = [], isLoading: cabinetsLoading } = useQuery({
    queryKey: ["site-cabinets", siteId],
    queryFn: async () => (await api.get<Cabinet[]>(`/sites/${siteId}/cabinets`)).data,
    enabled: !!siteId
  })
  const { data: cabinetHistory = [] } = useQuery({
    queryKey: ["audit-cabinet", selectedCabinetId],
    queryFn: async () => (await api.get<AuditEvent[]>(`/audit-events/entity/Cabinet/${selectedCabinetId}`)).data,
    enabled: !!selectedCabinetId && rackTab === "history"
  })
  const { data: linkedTasks = [] } = useQuery({
    queryKey: ["linked-tasks-cabinet", selectedCabinetId],
    queryFn: async () => (await api.get<LinkedTask[]>("/tasks", { params: { linkedEntityType: "Cabinet", linkedEntityId: selectedCabinetId } })).data,
    enabled: !!selectedCabinetId && rackTab === "linked"
  })
  const { data: linkedServiceRequests = [] } = useQuery({
    queryKey: ["linked-service-requests-cabinet", selectedCabinetId],
    queryFn: async () => (await api.get<LinkedServiceRequest[]>("/service-requests", { params: { linkedEntityType: "Cabinet", linkedEntityId: selectedCabinetId } })).data,
    enabled: !!selectedCabinetId && rackTab === "linked"
  })
  const { data: linkedRisks = [] } = useQuery({
    queryKey: ["linked-risks-cabinet", selectedCabinetId],
    queryFn: async () => (await api.get<LinkedRisk[]>("/risks", { params: { linkedEntityType: "Cabinet", linkedEntityId: selectedCabinetId } })).data,
    enabled: !!selectedCabinetId && rackTab === "linked"
  })
  const { data: linkedIssues = [] } = useQuery({
    queryKey: ["linked-issues-cabinet", selectedCabinetId],
    queryFn: async () => (await api.get<LinkedIssue[]>("/issues", { params: { linkedEntityType: "Cabinet", linkedEntityId: selectedCabinetId } })).data,
    enabled: !!selectedCabinetId && rackTab === "linked"
  })

  const isLoading = siteLoading || roomsLoading || cabinetsLoading

  // ── Breadcrumb & init ───────────────────────────────────────────────
  React.useEffect(() => { if (site) setRecordLabel(site.name) }, [site]) // eslint-disable-line

  // Don't auto-select a room — land on site overview

  // Update breadcrumb when selection changes — all intermediate crumbs are clickable
  React.useEffect(() => {
    if (!site) return
    const room = rooms.find(r => r.id === selectedRoomId)
    const cabinet = cabinets.find(c => c.id === selectedCabinetId)
    const asset = cabinet?.assets.find(a => a.id === selectedAssetId)

    if (asset && cabinet && room) {
      setBreadcrumbs([
        { label: site.name, onClick: () => { setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: room.name, onClick: () => { setSelectedRoomId(room.id); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: cabinet.name, onClick: () => { setSelectedCabinetId(cabinet.id); setSelectedAssetId(null); setRackTab("dashboard") } },
        { label: asset.name }
      ])
    } else if (cabinet && room) {
      setBreadcrumbs([
        { label: site.name, onClick: () => { setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: room.name, onClick: () => { setSelectedRoomId(room.id); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: cabinet.name }
      ])
    } else if (room) {
      setBreadcrumbs([
        { label: site.name, onClick: () => { setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null) } },
        { label: room.name }
      ])
    } else {
      setRecordLabel(site.name)
    }
  }, [site, selectedRoomId, selectedCabinetId, selectedAssetId, rooms, cabinets]) // eslint-disable-line

  React.useEffect(() => {
    const roomId = searchParams.get("roomId")
    const cabinetId = searchParams.get("cabinetId")
    const assetId = searchParams.get("assetId")
    if (!roomId && !cabinetId && !assetId) return
    if (roomId) {
      setSelectedRoomId(roomId)
      setOpenRoomId(roomId)
    }
    if (cabinetId) {
      setSelectedCabinetId(cabinetId)
      setOpenCabinetId(cabinetId)
      setRackTab("dashboard")
    }
    if (assetId) setSelectedAssetId(assetId)
  }, [searchParams])

  // ── Derived ─────────────────────────────────────────────────────────
  const unassignedCabinets = cabinets.filter(c => !c.roomId)
  const totalAssets = cabinets.reduce((s, c) => s + c._count.assets, 0)
  const totalU = cabinets.reduce((s, c) => s + (c.totalU ?? 0), 0)
  const usedU = cabinets.reduce((s, c) => s + (c.usedU ?? 0), 0)
  const selectedCabinet = cabinets.find(c => c.id === selectedCabinetId) ?? null
  const selectedRoom = rooms.find(r => r.id === selectedRoomId) ?? null
  const selectedAsset = rackTab === "elevation"
    ? null
    : selectedCabinet?.assets.find(a => a.id === selectedAssetId) ?? null
  const selectedRackAsset = selectedCabinet?.assets.find(a => a.id === selectedAssetId) ?? null
  const visibleCabinets = React.useMemo(() => {
    if (!selectedRoomId) return []
    if (selectedRoomId === "unassigned") return unassignedCabinets
    return cabinets.filter(c => c.roomId === selectedRoomId)
  }, [selectedRoomId, cabinets, unassignedCabinets])

  // ── Tree interactions ───────────────────────────────────────────────
  function toggleRoom(roomId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setOpenRoomId(prev => prev === roomId ? null : roomId)
  }
  function selectRoom(roomId: string | "unassigned") {
    setSelectedRoomId(roomId)
    setSelectedCabinetId(null)
    setSelectedAssetId(null)
    setOpenCabinetId(null)
    if (typeof roomId === "string" && roomId !== "unassigned") {
      setOpenRoomId(roomId)
    } else {
      setOpenRoomId(null)
    }
  }
  function selectCabinet(cabinetId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    const cab = cabinets.find(c => c.id === cabinetId)
    setSelectedCabinetId(cabinetId)
    setSelectedAssetId(null)
    setRackTab("dashboard")
    if (cab?.roomId) {
      setSelectedRoomId(cab.roomId)
      setOpenRoomId(cab.roomId)
    }
    setOpenCabinetId(cabinetId)
  }
  function selectAsset(assetId: string, cabinetId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    const cab = cabinets.find(c => c.id === cabinetId)
    setSelectedAssetId(assetId)
    // Also ensure the cabinet is selected and expanded
    setSelectedCabinetId(cabinetId)
    setRackTab("dashboard")
    if (cab?.roomId) {
      setSelectedRoomId(cab.roomId)
      setOpenRoomId(cab.roomId)
    }
    setOpenCabinetId(cabinetId)
  }
  function toggleCabinet(cabinetId: string, e: React.MouseEvent) {
    e.stopPropagation()
    setOpenCabinetId(prev => prev === cabinetId ? null : cabinetId)
  }

  // ── Handlers ────────────────────────────────────────────────────────
  async function handleCreateRoom() {
    if (!roomName.trim()) return
    setSavingRoom(true); setError("")
    try {
      const res = await api.post<Room>(`/sites/${siteId}/rooms`, { name: roomName.trim(), type: roomType })
      setRoomOpen(false); setRoomName(""); setRoomType("DATA_HALL")
      qc.invalidateQueries({ queryKey: ["site-rooms", siteId] })
      selectRoom(res.data.id)
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to create room")) }
    finally { setSavingRoom(false) }
  }

  async function handleCreateCabinet() {
    if (!cabinetName.trim()) return
    setSavingCabinet(true); setError("")
    try {
      const res = await api.post<Cabinet>(`/sites/${siteId}/cabinets`, {
        name: cabinetName.trim(), type: cabinetType,
        totalU: cabinetTotalU ? parseInt(cabinetTotalU) : undefined,
        powerKw: cabinetPowerKw ? parseFloat(cabinetPowerKw) : undefined,
        roomId: cabinetRoomId || undefined
      })
      setCabinetOpen(false); setCabinetName(""); setCabinetType("RACK"); setCabinetTotalU(""); setCabinetPowerKw(""); setCabinetRoomId("")
      qc.invalidateQueries({ queryKey: ["site-cabinets", siteId] })
      selectCabinet(res.data.id)
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to create rack")) }
    finally { setSavingCabinet(false) }
  }

  async function handleCreateAsset() {
    if (!assetTag.trim() || !assetName.trim() || !assetType.trim()) return
    setSavingAsset(true); setError("")
    try {
      await api.post("/assets", {
        assetTag: assetTag.trim(), name: assetName.trim(), assetType: assetType.trim(),
        ownerType: "CLIENT", siteId,
        cabinetId: assetCabinetId || selectedCabinetId || undefined,
        manufacturer: assetManufacturer || undefined, modelNumber: assetModel || undefined,
        serialNumber: assetSerial || undefined, ipAddress: assetIp || undefined,
        uPosition: assetUPos ? parseInt(assetUPos) : undefined,
        uHeight: assetUHeight ? parseInt(assetUHeight) : undefined,
        powerDrawW: assetPower ? parseFloat(assetPower) : undefined,
        lifecycleState: "ACTIVE",
        rackSide: assetRackSide
      })
      setAssetOpen(false)
      setAssetTag(""); setAssetName(""); setAssetType(""); setAssetManufacturer("")
      setAssetModel(""); setAssetSerial(""); setAssetIp(""); setAssetUPos(""); setAssetUHeight(""); setAssetPower("")
      setAssetCabinetId("")
      setAssetRackSide("FRONT")
      await qc.refetchQueries({ queryKey: ["site-cabinets", siteId] })
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to create asset")) }
    finally { setSavingAsset(false) }
  }

  function openSiteEdit() {
    if (!site) return
    setSiteName(site.name ?? "")
    setSiteAddress(site.address ?? "")
    setSiteCity(site.city ?? "")
    setSitePostcode(site.postcode ?? "")
    setSiteCountry(site.country ?? "UK")
    setSiteNotes(site.notes ?? "")
    setSiteEditOpen(true)
  }

  function openRoomEdit() {
    if (!selectedRoom) return
    setRoomName(selectedRoom.name ?? "")
    setRoomType(selectedRoom.type ?? "DATA_HALL")
    setRoomEditOpen(true)
  }

  function openCabinetEdit() {
    if (!selectedCabinet) return
    setCabinetName(selectedCabinet.name ?? "")
    setCabinetType(selectedCabinet.type ?? "RACK")
    setCabinetTotalU(selectedCabinet.totalU != null ? String(selectedCabinet.totalU) : "")
    setCabinetPowerKw(selectedCabinet.powerKw != null ? String(selectedCabinet.powerKw) : "")
    setCabinetRoomId(selectedCabinet.roomId ?? "")
    setCabinetEditOpen(true)
  }

  function openAssetEdit() {
    if (!selectedAsset) return
    setAssetTag(selectedAsset.assetTag ?? "")
    setAssetName(selectedAsset.name ?? "")
    setAssetType(selectedAsset.assetType ?? "")
    setAssetManufacturer(selectedAsset.manufacturer ?? "")
    setAssetModel(selectedAsset.modelNumber ?? "")
    setAssetSerial(selectedAsset.serialNumber ?? "")
    setAssetIp(selectedAsset.ipAddress ?? "")
    setAssetUPos(selectedAsset.uPosition != null ? String(selectedAsset.uPosition) : "")
    setAssetUHeight(selectedAsset.uHeight != null ? String(selectedAsset.uHeight) : "")
    setAssetPower(selectedAsset.powerDrawW != null ? String(selectedAsset.powerDrawW) : "")
    setAssetRackSide(normalizeRackSide(selectedAsset.rackSide))
    setAssetCabinetId(selectedCabinetId ?? "")
    setAssetStatus(selectedAsset.status ?? "ACTIVE")
    setAssetLifecycle(selectedAsset.lifecycleState ?? "ACTIVE")
    setAssetEditOpen(true)
  }

  async function handleUpdateSite() {
    if (!siteId || !siteName.trim()) return
    setSavingSiteEdit(true)
    setError("")
    try {
      await api.put(`/sites/${siteId}`, {
        name: siteName.trim(),
        address: siteAddress || undefined,
        city: siteCity || undefined,
        postcode: sitePostcode || undefined,
        country: siteCountry || undefined,
        notes: siteNotes || undefined
      })
      setSiteEditOpen(false)
      await Promise.all([
        qc.refetchQueries({ queryKey: ["site-detail", siteId] }),
        qc.refetchQueries({ queryKey: ["sites"] })
      ])
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to update site"))
    } finally {
      setSavingSiteEdit(false)
    }
  }

  async function handleUpdateRoom() {
    if (!siteId || !selectedRoom || !roomName.trim()) return
    setSavingRoomEdit(true)
    setError("")
    try {
      await api.put(`/sites/${siteId}/rooms/${selectedRoom.id}`, {
        name: roomName.trim(),
        type: roomType
      })
      setRoomEditOpen(false)
      await qc.refetchQueries({ queryKey: ["site-rooms", siteId] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to update room"))
    } finally {
      setSavingRoomEdit(false)
    }
  }

  async function handleUpdateCabinet() {
    if (!siteId || !selectedCabinet || !cabinetName.trim()) return
    setSavingCabinetEdit(true)
    setError("")
    try {
      await api.put(`/sites/${siteId}/cabinets/${selectedCabinet.id}`, {
        name: cabinetName.trim(),
        type: cabinetType,
        totalU: cabinetTotalU ? parseInt(cabinetTotalU) : undefined,
        powerKw: cabinetPowerKw ? parseFloat(cabinetPowerKw) : undefined,
        roomId: cabinetRoomId || null
      })
      setCabinetEditOpen(false)
      await qc.refetchQueries({ queryKey: ["site-cabinets", siteId] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to update rack"))
    } finally {
      setSavingCabinetEdit(false)
    }
  }

  async function handleUpdateAsset() {
    if (!siteId || !selectedAsset || !assetTag.trim() || !assetName.trim() || !assetType.trim()) return
    setSavingAssetEdit(true)
    setError("")
    try {
      await api.put(`/assets/${selectedAsset.id}`, {
        assetTag: assetTag.trim(),
        name: assetName.trim(),
        assetType: assetType.trim(),
        manufacturer: assetManufacturer || undefined,
        modelNumber: assetModel || undefined,
        serialNumber: assetSerial || undefined,
        ipAddress: assetIp || undefined,
        uPosition: assetUPos ? parseInt(assetUPos) : null,
        uHeight: assetUHeight ? parseInt(assetUHeight) : null,
        powerDrawW: assetPower ? parseFloat(assetPower) : null,
        rackSide: assetRackSide,
        lifecycleState: assetLifecycle,
        status: assetStatus || undefined,
        siteId,
        cabinetId: assetCabinetId || null
      })
      setAssetEditOpen(false)
      await qc.refetchQueries({ queryKey: ["site-cabinets", siteId] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to update asset"))
    } finally {
      setSavingAssetEdit(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteTarget || !siteId) return
    setDeleting(true)
    setError("")
    try {
      if (deleteTarget.type === "site") {
        await api.delete(`/sites/${deleteTarget.id}`)
        setDeleteTarget(null)
        navigate("/asset-management")
        return
      }
      if (deleteTarget.type === "room") {
        await api.delete(`/sites/${siteId}/rooms/${deleteTarget.id}`)
        setSelectedRoomId(null)
        setSelectedCabinetId(null)
        setSelectedAssetId(null)
        setOpenRoomId(null)
        setOpenCabinetId(null)
        await Promise.all([
          qc.refetchQueries({ queryKey: ["site-rooms", siteId] }),
          qc.refetchQueries({ queryKey: ["site-cabinets", siteId] })
        ])
      } else if (deleteTarget.type === "cabinet") {
        await api.delete(`/sites/${siteId}/cabinets/${deleteTarget.id}`)
        setSelectedCabinetId(null)
        setSelectedAssetId(null)
        setOpenCabinetId(null)
        await qc.refetchQueries({ queryKey: ["site-cabinets", siteId] })
      } else if (deleteTarget.type === "asset") {
        await api.delete(`/assets/${deleteTarget.id}`)
        setSelectedAssetId(null)
        await qc.refetchQueries({ queryKey: ["site-cabinets", siteId] })
      }
      setDeleteTarget(null)
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to delete record"))
    } finally {
      setDeleting(false)
    }
  }

  if (siteLoading) return <LoadingState />
  if (!site) return <ErrorState title="Site not found" />

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <Box sx={{
      mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" },
      height: "calc(100vh - 56px)", display: "flex", overflow: "hidden", bgcolor: "var(--color-background-tertiary)"
    }}>

      {/* ── Tree rail ─────────────────────────────────────────────────── */}
      <Box sx={{ width: 230, minWidth: 230, bgcolor: "var(--color-background-primary)", borderRight: "1px solid var(--color-border-primary)", overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        {/* ── Site root node ── */}
        <Box
          onClick={() => { setSelectedRoomId(null); setSelectedCabinetId(null); setSelectedAssetId(null) }}
          sx={{
            px: "12px", py: "10px", cursor: "pointer", mx: "6px", borderRadius: "7px",
            bgcolor: !selectedRoomId && !selectedCabinetId ? "rgba(29,78,216,0.08)" : "transparent",
            border: !selectedRoomId && !selectedCabinetId ? "1px solid rgba(29,78,216,0.15)" : "1px solid transparent",
            display: "flex", alignItems: "center", gap: "9px", mb: "6px",
            "&:hover": { bgcolor: !selectedRoomId ? "rgba(29,78,216,0.08)" : "rgba(0,0,0,0.03)" },
            transition: "all 0.12s"
          }}>
          <Box sx={{ width: 22, height: 22, borderRadius: "5px", bgcolor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <LocationOnIcon sx={{ fontSize: 13, color: "#2563eb" }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: !selectedRoomId && !selectedCabinetId ? "#1d4ed8" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {site?.name ?? "Site"}
            </Typography>
                    <Typography sx={{ fontSize: 10, color: "var(--color-text-muted)", mt: "1px" }}>
              {rooms.length} room{rooms.length !== 1 ? "s" : ""} · {cabinets.length} rack{cabinets.length !== 1 ? "s" : ""}
            </Typography>
          </Box>
        </Box>

        {/* Divider + Rooms section */}
        <Box sx={{ display: "flex", alignItems: "center", px: "12px", mb: "4px" }}>
          <Typography sx={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-text-muted)", flex: 1 }}>
            Rooms
          </Typography>
          {canManage ? (
            <Tooltip title="Add room">
              <IconButton size="small" onClick={() => setRoomOpen(true)}
                sx={{ width: 18, height: 18, color: "#94a3b8", "&:hover": { color: "#1d4ed8" } }}>
                <AddIcon sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>

        {/* Tree */}
        <Box sx={{ flex: 1, overflowY: "auto", py: "4px" }}>
          {isLoading ? <Box sx={{ px: "16px", py: "8px" }}><Typography sx={{ fontSize: 11, color: "#94a3b8" }}>Loading...</Typography></Box> : null}

          {rooms.map(room => {
            const roomCabinets = cabinets.filter(c => c.roomId === room.id)
            const isExpanded = openRoomId === room.id
            const isRoomActive = selectedRoomId === room.id && !selectedCabinetId
            const hasActiveCabinet = roomCabinets.some(c => c.id === selectedCabinetId)

            return (
              <Box key={room.id}>
                {/* Room row */}
                <Stack direction="row" alignItems="center"
                  onClick={() => selectRoom(room.id)}
                  sx={{
                    px: "8px", py: "7px", cursor: "pointer",
                    bgcolor: isRoomActive ? "rgba(29,78,216,0.07)" : hasActiveCabinet ? "rgba(0,0,0,0.02)" : "transparent",
                    borderLeft: isRoomActive ? "2px solid #1d4ed8" : "2px solid transparent",
                    "&:hover": { bgcolor: isRoomActive ? "rgba(29,78,216,0.07)" : "rgba(0,0,0,0.03)" },
                    transition: "all 0.12s"
                  }}>
                  {/* Expand chevron */}
                  <Box onClick={e => toggleRoom(room.id, e)} sx={{ display: "flex", alignItems: "center", color: "#94a3b8", mr: "2px", flexShrink: 0 }}>
                    {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
                  </Box>
                  <MemoryIcon sx={{ fontSize: 12, color: isRoomActive ? "#1d4ed8" : "#94a3b8", mr: "7px", flexShrink: 0 }} />
                  <Typography sx={{ flex: 1, fontSize: 12.5, fontWeight: isRoomActive || hasActiveCabinet ? 600 : 400, color: isRoomActive ? "#1d4ed8" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {room.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94a3b8", flexShrink: 0, ml: "4px" }}>{roomCabinets.length}</Typography>
                </Stack>

                {/* Racks within room */}
                {isExpanded ? roomCabinets.map(cab => {
                  const isActive = selectedCabinetId === cab.id
                  const isExpCab = openCabinetId === cab.id
                  return (
                    <Box key={cab.id}>
                      {/* Rack row */}
                      <Stack direction="row" alignItems="center"
                        onClick={e => selectCabinet(cab.id, e)}
                        sx={{
                          pl: "22px", pr: "8px", py: "6px", cursor: "pointer",
                          bgcolor: isActive ? "rgba(29,78,216,0.1)" : "transparent",
                          borderLeft: isActive ? "2px solid #1d4ed8" : "2px solid transparent",
                          "&:hover": { bgcolor: isActive ? "rgba(29,78,216,0.1)" : "rgba(0,0,0,0.03)" },
                          transition: "all 0.12s"
                        }}>
                        {/* Asset expand - only if has assets */}
                        {cab._count.assets > 0 ? (
                          <Box onClick={e => toggleCabinet(cab.id, e)} sx={{ display: "flex", alignItems: "center", color: "#94a3b8", mr: "2px", flexShrink: 0 }}>
                            {isExpCab ? <ExpandMoreIcon sx={{ fontSize: 13 }} /> : <ChevronRightIcon sx={{ fontSize: 13 }} />}
                          </Box>
                        ) : <Box sx={{ width: 14, flexShrink: 0 }} />}
                        <StorageIcon sx={{ fontSize: 11, color: isActive ? "#1d4ed8" : "#64748b", mr: "7px", flexShrink: 0 }} />
                        <Typography sx={{ flex: 1, fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? "#1d4ed8" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cab.name}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: "#94a3b8", flexShrink: 0, ml: "4px" }}>{cab._count.assets}</Typography>
                      </Stack>

                      {/* Assets within rack */}
                      {isExpCab ? cab.assets.slice().sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0)).map(asset => {
                        const isAssetActive = selectedAssetId === asset.id
                        return (
                          <Stack key={asset.id} direction="row" alignItems="center"
                            onClick={e => selectAsset(asset.id, cab.id, e)}
                            sx={{
                              pl: "48px", pr: "8px", py: "5px", cursor: "pointer",
                              bgcolor: isAssetActive ? "rgba(29,78,216,0.07)" : "transparent",
                              borderLeft: isAssetActive ? "2px solid #1d4ed8" : "2px solid transparent",
                              "&:hover": { bgcolor: isAssetActive ? "rgba(29,78,216,0.07)" : "rgba(0,0,0,0.03)" },
                              transition: "all 0.1s"
                            }}>
                            <Box sx={{
                              width: 6, height: 6, borderRadius: "50%", mr: "7px", flexShrink: 0,
                              bgcolor: isAssetActive ? "#1d4ed8" : assetBg(asset.assetType) === "#dbeafe" ? "#93c5fd" : "#cbd5e1"
                            }} />
                            <Typography sx={{ fontSize: 11, color: isAssetActive ? "#1d4ed8" : "#64748b", fontWeight: isAssetActive ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                              {asset.uPosition != null ? `U${asset.uPosition} ` : ""}{asset.name}
                            </Typography>
                          </Stack>
                        )
                      }) : null}
                    </Box>
                  )
                }) : null}
              </Box>
            )
          })}

          {/* Unassigned section */}
          {unassignedCabinets.length > 0 ? (
            <Box>
              {rooms.length > 0 ? <Box sx={{ height: 1, bgcolor: "#f1f5f9", mx: "12px", my: "6px" }} /> : null}
              <Stack direction="row" alignItems="center"
                onClick={() => selectRoom("unassigned")}
                sx={{
                  px: "8px", py: "7px", cursor: "pointer",
                  bgcolor: selectedRoomId === "unassigned" && !selectedCabinetId ? "rgba(29,78,216,0.07)" : "transparent",
                  borderLeft: selectedRoomId === "unassigned" && !selectedCabinetId ? "2px solid #1d4ed8" : "2px solid transparent",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.03)" }
                }}>
                <ChevronRightIcon sx={{ fontSize: 14, color: "#94a3b8", mr: "2px" }} />
                <StorageIcon sx={{ fontSize: 12, color: "#94a3b8", mr: "7px" }} />
                <Typography sx={{ flex: 1, fontSize: 12.5, color: "#475569" }}>Unassigned</Typography>
                <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{unassignedCabinets.length}</Typography>
              </Stack>
            </Box>
          ) : null}

          {rooms.length === 0 && unassignedCabinets.length === 0 && !isLoading ? (
            <Box sx={{ px: "16px", py: "12px" }}>
              <Typography sx={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>No rooms yet.</Typography>
              {canManage ? <Button size="small" variant="text" onClick={() => setRoomOpen(true)} sx={{ fontSize: 11, color: "#1d4ed8", p: 0, mt: "4px" }}>Add first room</Button> : null}
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* ── Central content ────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Content header */}
        <Box sx={{ bgcolor: "var(--color-background-primary)", borderBottom: "1px solid var(--color-border-primary)", px: "24px", py: "12px", flexShrink: 0 }}>
          {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Box>
              {selectedAsset ? (
                <>
                  <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{selectedAsset.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {selectedAsset.assetType}
                    {selectedAsset.uPosition != null ? ` · U${selectedAsset.uPosition}` : ""}
                    {" · "}{selectedAsset.lifecycleState.toLowerCase()}
                  </Typography>
                </>
              ) : selectedCabinet ? (
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{selectedCabinet.name}</Typography>
              ) : selectedRoom ? (
                <>
                  <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{selectedRoom.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                    {ROOM_TYPE_LABELS[selectedRoom.type] ?? selectedRoom.type}
                    {" · "}{visibleCabinets.length} rack{visibleCabinets.length !== 1 ? "s" : ""}
                  </Typography>
                </>
              ) : selectedRoomId === "unassigned" ? (
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>Unassigned Racks</Typography>
              ) : (
                <>
                  <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{site.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>Site overview</Typography>
                </>
              )}
            </Box>
            {canManage ? (
              <Stack direction="row" spacing={1}>
                {selectedAsset ? (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />}
                      onClick={openAssetEdit} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                      Edit asset
                    </Button>
                    <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon sx={{ fontSize: 13 }} />}
                      onClick={() => setDeleteTarget({ type: "asset", id: selectedAsset.id, label: selectedAsset.name })} sx={{ fontSize: 12 }}>
                      Delete asset
                    </Button>
                  </>
                ) : selectedCabinet ? (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />}
                      onClick={openCabinetEdit} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                      Edit rack
                    </Button>
                    <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon sx={{ fontSize: 13 }} />}
                      onClick={() => setDeleteTarget({ type: "cabinet", id: selectedCabinet.id, label: selectedCabinet.name })} sx={{ fontSize: 12 }}>
                      Delete rack
                    </Button>
                  <Button size="small" variant="contained" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                    onClick={() => { setAssetCabinetId(selectedCabinetId ?? ""); setAssetOpen(true) }} sx={{ fontSize: 12 }}>
                    Add asset
                  </Button>
                  </>
                ) : selectedRoom ? (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />}
                      onClick={openRoomEdit} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                      Edit room
                    </Button>
                    <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon sx={{ fontSize: 13 }} />}
                      onClick={() => setDeleteTarget({ type: "room", id: selectedRoom.id, label: selectedRoom.name })} sx={{ fontSize: 12 }}>
                      Delete room
                    </Button>
                    <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                      onClick={() => { setCabinetRoomId(selectedRoom?.id ?? ""); setCabinetOpen(true) }} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                      Add rack
                    </Button>
                  </>
                ) : !selectedRoomId ? (
                  <>
                    <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />}
                      onClick={openSiteEdit} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                      Edit site
                    </Button>
                    <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutlineIcon sx={{ fontSize: 13 }} />}
                      onClick={() => setDeleteTarget({ type: "site", id: site.id, label: site.name })} sx={{ fontSize: 12 }}>
                      Delete site
                    </Button>
                  </>
                ) : selectedRoomId ? (
                  <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                    onClick={() => { setCabinetRoomId(""); setCabinetOpen(true) }} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                    Add rack
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        </Box>

        {/* Content body */}
        <Box sx={{ flex: 1, overflowY: "auto" }}>
          {isLoading ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}

          {/* ── ASSET DETAIL VIEW ─────────────────────── */}
          {!isLoading && selectedAsset ? (
            <Box sx={{ p: "24px", maxWidth: 720 }}>
              {/* Asset type chip */}
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "24px" }}>
                <Box sx={{ width: 40, height: 40, borderRadius: "10px", bgcolor: assetBg(selectedAsset.assetType), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Box sx={{ width: 16, height: 16, borderRadius: "3px", bgcolor: "rgba(0,0,0,0.12)" }} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{selectedAsset.assetType}</Typography>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: selectedAsset.lifecycleState === "ACTIVE" ? "#15803d" : "#94a3b8" }} />
                    <Typography sx={{ fontSize: 11, color: "#64748b" }}>{selectedAsset.lifecycleState.toLowerCase()}</Typography>
                  </Stack>
                </Box>
                <Chip size="small" label={selectedAsset.lifecycleState.toLowerCase()} sx={{ ...lifecycleSx(selectedAsset.lifecycleState), ml: "auto" }} />
              </Stack>

              {/* Properties grid */}
              <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                {[
                  { label: "Asset Tag", value: selectedAsset.assetTag, mono: true },
                  { label: "Name", value: selectedAsset.name },
                  { label: "Type", value: selectedAsset.assetType },
                  { label: "Manufacturer", value: selectedAsset.manufacturer },
                  { label: "Model", value: selectedAsset.modelNumber },
                  { label: "Serial Number", value: selectedAsset.serialNumber, mono: true },
                  { label: "IP Address", value: selectedAsset.ipAddress, mono: true },
                  { label: "U Position", value: selectedAsset.uPosition != null ? `U${selectedAsset.uPosition}` : null },
                  { label: "U Height", value: selectedAsset.uHeight != null ? `${selectedAsset.uHeight}U` : null },
                  { label: "Power Draw", value: selectedAsset.powerDrawW != null ? `${selectedAsset.powerDrawW} W` : null },
                  { label: "Rack", value: selectedCabinet?.name },
                  { label: "Room", value: selectedRoom?.name },
                ].filter(r => r.value != null).map((row, idx, arr) => (
                  <Box key={row.label} sx={{ display: "flex", alignItems: "center", py: "11px", px: "16px", borderBottom: idx < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <Typography sx={{ fontSize: 12, color: "#64748b", width: 140, flexShrink: 0 }}>{row.label}</Typography>
                    <Typography sx={{ fontSize: 12.5, color: "#0f172a", fontFamily: row.mono ? "monospace" : "inherit", fontWeight: 500 }}>
                      {row.value}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          ) : null}

          {/* ── RACK VIEW ─────────────────────────────── */}
          {!isLoading && !selectedAsset && selectedCabinet ? (
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              {(() => {
                const frontAssets = selectedCabinet.assets.filter(a => normalizeRackSide(a.rackSide) === "FRONT")
                const rearAssets = selectedCabinet.assets.filter(a => normalizeRackSide(a.rackSide) === "REAR")
                const unrackedAssets = selectedCabinet.assets.filter(a => a.uPosition == null)
                const totalPowerW = selectedCabinet.assets.reduce((sum, asset) => sum + (asset.powerDrawW ?? 0), 0)
                const totalPowerKw = totalPowerW / 1000
                const capacityKw = selectedCabinet.powerKw ?? null
                const lifecycleCounts = selectedCabinet.assets.reduce((acc, asset) => {
                  if (asset.lifecycleState === "ACTIVE") acc.ACTIVE += 1
                  else if (asset.lifecycleState === "RETIRED") acc.RETIRED += 1
                  else if (asset.lifecycleState === "STAGING") acc.STAGING += 1
                  else if (asset.lifecycleState === "PLANNED") acc.PLANNED += 1
                  else if (asset.lifecycleState === "PROCUREMENT") acc.PROCUREMENT += 1
                  return acc
                }, { ACTIVE: 0, RETIRED: 0, STAGING: 0, PLANNED: 0, PROCUREMENT: 0 })
                const utilizationPct = capacityKw && capacityKw > 0
                  ? Math.min(100, Math.round((totalPowerKw / capacityKw) * 100))
                  : null
                return (
                  <>
              {/* Rack tabs */}
              <Box sx={{ bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0", px: "24px", flexShrink: 0 }}>
                <Stack direction="row" spacing={0}>
                  {[
                    { key: "dashboard", label: "Dashboard" },
                    { key: "elevation", label: "Elevation" },
                    { key: "assets", label: "Assets", count: selectedCabinet.assets.length },
                    { key: "history", label: "History" },
                    { key: "linked", label: "Linked records" },
                  ].map(t => (
                    <Box key={t.key} onClick={() => setRackTab(t.key as RackTab)}
                      sx={{
                        px: "14px", py: "10px", cursor: "pointer", fontSize: 12.5, fontWeight: 500,
                        color: rackTab === t.key ? "#1d4ed8" : "#64748b",
                        borderBottom: rackTab === t.key ? "2px solid #1d4ed8" : "2px solid transparent",
                        display: "flex", alignItems: "center", gap: "6px",
                        mb: "-1px", transition: "all 0.15s", "&:hover": { color: "#0f172a" }
                      }}>
                      {t.label}
                      {t.count != null ? (
                        <Box sx={{ px: "6px", py: "1px", borderRadius: "4px", fontSize: 10, fontWeight: 600,
                          bgcolor: rackTab === t.key ? "#dbeafe" : "#f1f5f9",
                          color: rackTab === t.key ? "#1d4ed8" : "#64748b" }}>
                          {t.count}
                        </Box>
                      ) : null}
                    </Box>
                  ))}
                </Stack>
              </Box>

              {/* ── Dashboard tab ── */}
              {rackTab === "dashboard" ? (
                <Box sx={{ flex: 1, overflowY: "auto", p: "20px 24px" }}>
                  <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0,1fr))", xl: "repeat(5, minmax(0,1fr))" }, mb: "14px" }}>
                    {[
                      { label: "Total asset draw", value: `${formatKw(totalPowerKw)} kW` },
                      { label: "Rack capacity", value: capacityKw != null ? `${formatKw(capacityKw)} kW` : "—" },
                      { label: "Utilization", value: utilizationPct != null ? `${utilizationPct}%` : "—" },
                      { label: "Active assets", value: `${lifecycleCounts.ACTIVE}` },
                      { label: "Retired (decom)", value: `${lifecycleCounts.RETIRED}` },
                    ].map(card => (
                      <Box key={card.label} sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", p: "14px 16px" }}>
                        <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", mb: "6px" }}>
                          {card.label}
                        </Typography>
                        <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{card.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                    {[
                      { label: "Rack type", value: selectedCabinet.type || "—" },
                      { label: "Total U", value: selectedCabinet.totalU != null ? `${selectedCabinet.totalU}U` : "—" },
                      { label: "Used U", value: selectedCabinet.totalU != null ? `${selectedCabinet.usedU ?? 0}U` : "—" },
                      { label: "Front assets", value: `${frontAssets.length}` },
                      { label: "Rear assets", value: `${rearAssets.length}` },
                      { label: "Unracked assets", value: `${unrackedAssets.length}` },
                      { label: "Staging assets", value: `${lifecycleCounts.STAGING}` },
                      { label: "Planned assets", value: `${lifecycleCounts.PLANNED}` },
                      { label: "Procurement assets", value: `${lifecycleCounts.PROCUREMENT}` },
                    ].map((row, idx, arr) => (
                      <Box key={row.label} sx={{ px: "16px", py: "10px", display: "flex", alignItems: "center", borderBottom: idx < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <Typography sx={{ fontSize: 12, color: "#64748b", width: 150, flexShrink: 0 }}>{row.label}</Typography>
                        <Typography sx={{ fontSize: 12.5, color: "#0f172a", fontWeight: 600 }}>{row.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : null}

              {/* ── Elevation tab ── */}
              {rackTab === "elevation" ? (
                <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
                  <Box sx={{ width: 720, maxWidth: "56vw", flexShrink: 0, overflowY: "auto", p: "24px 16px 24px 24px", bgcolor: "#f8fafc" }}>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                      <Button size="small" onClick={() => setElevationSide("FRONT")}
                        sx={{ fontSize: 12, textTransform: "none", bgcolor: elevationSide === "FRONT" ? "rgba(29,78,216,0.1)" : "transparent" }}>
                        Front view ({frontAssets.length})
                      </Button>
                      <Button size="small" onClick={() => setElevationSide("REAR")}
                        sx={{ fontSize: 12, textTransform: "none", bgcolor: elevationSide === "REAR" ? "rgba(29,78,216,0.1)" : "transparent" }}>
                        Rear view ({rearAssets.length})
                      </Button>
                    </Stack>
                    {selectedCabinet.totalU ? (
                      <Box sx={{ maxWidth: 560 }}>
                        <RackElevation
                          assets={elevationSide === "FRONT" ? frontAssets : rearAssets}
                          totalU={selectedCabinet.totalU ?? 42}
                          selectedAssetId={selectedAssetId}
                          onSelectAsset={id => {
                            setSelectedAssetId(id)
                            setAssetDrawerMode("lite")
                          }}
                        />
                      </Box>
                    ) : (
                      <Box sx={{ py: 6, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>No U-space data for this rack</Typography>
                      </Box>
                    )}
                  </Box>
                  <Drawer
                    anchor="right"
                    open={!!selectedRackAsset}
                    onClose={() => setSelectedAssetId(null)}
                    PaperProps={{ sx: { width: 420, borderLeft: "1px solid #e2e8f0", p: 2, bgcolor: "#f8fafc" } }}
                  >
                    {selectedRackAsset ? (
                      <Stack spacing={2}>
                        <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                          <Box sx={{ p: "16px 20px 14px", borderBottom: "1px solid #f1f5f9" }}>
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: "8px" }}>
                              <Box sx={{ px: "8px", py: "3px", borderRadius: "4px", bgcolor: assetBg(selectedRackAsset.assetType) }}>
                                <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: "#334155" }}>{selectedRackAsset.assetType}</Typography>
                              </Box>
                              <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8" }}>{selectedRackAsset.assetTag}</Typography>
                              <Chip size="small" label={selectedRackAsset.lifecycleState.toLowerCase()} sx={{ ...lifecycleSx(selectedRackAsset.lifecycleState), ml: "auto", fontSize: 10 }} />
                            </Stack>
                            <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{selectedRackAsset.name}</Typography>
                          </Box>
                          <Box sx={{ px: "20px", py: "10px", bgcolor: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                            <Typography sx={{ fontSize: 11, color: "#475569" }}>
                              {selectedRoom ? `${selectedRoom.name} ▸ ` : ""}{selectedCabinet.name} ▸ {selectedRackAsset.uPosition != null ? `U${selectedRackAsset.uPosition}` : "Unpositioned"} {normalizeRackSide(selectedRackAsset.rackSide).toLowerCase()}
                            </Typography>
                          </Box>
                          <Box sx={{ p: "14px 20px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                            {[
                              ["Manufacturer", selectedRackAsset.manufacturer ?? "—"],
                              ["Model", selectedRackAsset.modelNumber ?? "—"],
                              ["Serial", selectedRackAsset.serialNumber ?? "—"],
                              ["IP", selectedRackAsset.ipAddress ?? "—"],
                              ["U Height", selectedRackAsset.uHeight != null ? `${selectedRackAsset.uHeight}U` : "—"],
                              ["Power", selectedRackAsset.powerDrawW != null ? `${selectedRackAsset.powerDrawW}W` : "—"],
                            ].map(([label, value]) => (
                              <Box key={label}>
                                <Typography sx={{ fontSize: 10.5, color: "#94a3b8" }}>{label}</Typography>
                                <Typography sx={{ fontSize: 12, color: "#0f172a", fontWeight: 500 }}>{value}</Typography>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                        {assetDrawerMode === "lite" ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              setRackTab("dashboard")
                              setAssetDrawerMode("lite")
                            }}
                            sx={{ alignSelf: "flex-start", textTransform: "none" }}
                          >
                            Open full details
                          </Button>
                        ) : (
                          <Box sx={{ border: "1px solid #e2e8f0", borderRadius: "10px", p: 2, bgcolor: "#fff" }}>
                            <Typography sx={{ fontSize: 10.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", mb: 1 }}>
                              Extended details
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: "#334155", mb: 0.5 }}>Rack side: {normalizeRackSide(selectedRackAsset.rackSide)}</Typography>
                            <Typography sx={{ fontSize: 12, color: "#334155", mb: 0.5 }}>Lifecycle status: {selectedRackAsset.lifecycleState}</Typography>
                            <Typography sx={{ fontSize: 12, color: "#334155" }}>Operational status: {selectedRackAsset.status || "—"}</Typography>
                            <Button size="small" variant="text" onClick={() => setAssetDrawerMode("lite")} sx={{ mt: 1, textTransform: "none", px: 0 }}>
                              Back to lite view
                            </Button>
                          </Box>
                        )}
                      </Stack>
                    ) : null}
                  </Drawer>
                </Box>
              ) : null}

              {/* ── Assets tab ── */}
              {rackTab === "assets" ? (
                <Box sx={{ flex: 1, overflowY: "auto", p: "16px 20px" }}>
                  {selectedCabinet.assets.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: "10px" }}>
                      <StorageIcon sx={{ fontSize: 32, color: "#e2e8f0", mb: 1 }} />
                      <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No assets in this rack</Typography>
                      {canManage ? <Button size="small" variant="text" onClick={() => { setAssetCabinetId(selectedCabinetId ?? ""); setAssetOpen(true) }} sx={{ mt: 1, fontSize: 12, color: "#1d4ed8" }}>Add first asset</Button> : null}
                    </Box>
                  ) : (
                    <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", xl: "repeat(3, minmax(0, 1fr))" } }}>
                      {[
                        { key: "front", title: "Front assets", items: frontAssets.filter(a => a.uPosition != null) },
                        { key: "rear", title: "Rear assets", items: rearAssets.filter(a => a.uPosition != null) },
                        { key: "unracked", title: "Unracked / non-positioned", items: unrackedAssets },
                      ].map(section => (
                        <Box key={section.key} sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", minWidth: 0 }}>
                          <Box sx={{ px: "12px", py: "10px", borderBottom: "1px solid #f1f5f9", bgcolor: "#f8fafc" }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              {section.title} ({section.items.length})
                            </Typography>
                          </Box>
                          {section.items.length === 0 ? (
                            <Box sx={{ p: "18px 14px", textAlign: "center" }}>
                              <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>No assets in this section</Typography>
                            </Box>
                          ) : (
                            <TableContainer>
                              <Table size="small">
                                <TableHead>
                                  <TableRow sx={{ "& th": { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc", py: "8px", borderBottom: "1px solid #e2e8f0" } }}>
                                    <TableCell sx={{ width: 56 }}>U</TableCell>
                                    <TableCell>Asset</TableCell>
                                    <TableCell align="right">Power</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {section.items.slice().sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0)).map(a => (
                                    <TableRow key={a.id} hover onClick={e => selectAsset(a.id, selectedCabinet.id, e)} sx={{ cursor: "pointer", "&:hover td": { bgcolor: "#f8fafc" } }}>
                                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#64748b" }}>
                                        {a.uPosition != null ? `U${a.uPosition}` : "—"}
                                      </TableCell>
                                      <TableCell>
                                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{a.name}</Typography>
                                        <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{a.assetType} · {a.assetTag}</Typography>
                                      </TableCell>
                                      <TableCell align="right" sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>
                                        {a.powerDrawW != null ? `${a.powerDrawW}W` : "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          )}
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              ) : null}

              {rackTab === "history" ? (
                <Box sx={{ flex: 1, overflowY: "auto", p: "16px 20px" }}>
                  <Box sx={{ maxWidth: 880, bgcolor: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                    {cabinetHistory.length === 0 ? (
                      <Box sx={{ py: 5, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>No rack history available yet</Typography>
                      </Box>
                    ) : (
                      cabinetHistory.map((event, idx) => (
                        <Box key={event.id} sx={{ px: 2, py: 1.5, borderBottom: idx < cabinetHistory.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                          <Typography sx={{ fontSize: 12, color: "#0f172a", fontWeight: 500 }}>{actionLabel(event.action, event.data)}</Typography>
                          <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{new Date(event.createdAt).toLocaleString()}</Typography>
                        </Box>
                      ))
                    )}
                  </Box>
                </Box>
              ) : null}

              {rackTab === "linked" ? (
                <Box sx={{ flex: 1, overflowY: "auto", p: "16px 20px" }}>
                  <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" } }}>
                    {[
                      { title: "Service requests", items: linkedServiceRequests, onClick: (id: string) => navigate(`/service-requests/${id}`), subtitle: (item: LinkedServiceRequest) => item.subject },
                      { title: "Risks", items: linkedRisks, onClick: (id: string) => navigate(`/risks/${id}`), subtitle: (item: LinkedRisk) => `${item.likelihood} / ${item.impact}` },
                      { title: "Issues", items: linkedIssues, onClick: (id: string) => navigate(`/issues/${id}`), subtitle: (item: LinkedIssue) => item.severity },
                      { title: "Tasks", items: linkedTasks, onClick: (id: string) => navigate(`/tasks/${id}`), subtitle: (item: LinkedTask) => item.title },
                    ].map(section => (
                      <Box key={section.title} sx={{ bgcolor: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                        <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid #f1f5f9", bgcolor: "#f8fafc" }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {section.title} ({section.items.length})
                          </Typography>
                        </Box>
                        {section.items.length === 0 ? (
                          <Box sx={{ p: 2 }}>
                            <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>No linked {section.title.toLowerCase()}</Typography>
                          </Box>
                        ) : (
                          section.items.map((item: any, idx: number) => (
                            <Stack key={item.id} direction="row" alignItems="center"
                              onClick={() => section.onClick(item.id)}
                              sx={{ p: 1.5, cursor: "pointer", borderBottom: idx < section.items.length - 1 ? "1px solid #f1f5f9" : "none", "&:hover": { bgcolor: "#f8fafc" } }}>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{item.reference}</Typography>
                                <Typography sx={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {section.subtitle(item)}
                                </Typography>
                              </Box>
                              <Chip size="small" label={String(item.status).toLowerCase().replaceAll("_", " ")} sx={{ ...chipSx(item.status), fontSize: 10, height: 20 }} />
                            </Stack>
                          ))
                        )}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : null}
                  </>
                )
              })()}
            </Box>
          ) : null}

          {/* ── ROOM VIEW ─────────────────────────────── */}
          {!isLoading && !selectedAsset && !selectedCabinet && selectedRoomId ? (
            <Box sx={{ p: "20px 24px" }}>
              {visibleCabinets.length === 0 ? (
                <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: "10px" }}>
                  <StorageIcon sx={{ fontSize: 32, color: "#e2e8f0", mb: 1 }} />
                  <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No racks in this room</Typography>
                  {canManage ? <Button size="small" variant="text" onClick={() => { setCabinetRoomId(selectedRoom?.id ?? ""); setCabinetOpen(true) }} sx={{ mt: 1, fontSize: 12, color: "#1d4ed8" }}>Add rack</Button> : null}
                </Box>
              ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                  {visibleCabinets.map(c => {
                    const fill = uFill(c.usedU, c.totalU)
                    const totalAssetPowerW = c.assets.reduce((sum, asset) => sum + (asset.powerDrawW ?? 0), 0)
                    const totalAssetPowerKw = totalAssetPowerW / 1000
                    const powerPct = c.powerKw && c.powerKw > 0
                      ? Math.min(100, Math.round((totalAssetPowerKw / c.powerKw) * 100))
                      : 0
                    return (
                      <Box key={c.id} onClick={e => selectCabinet(c.id, e)}
                        sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", p: "16px 18px", cursor: "pointer", transition: "all 0.15s", "&:hover": { borderColor: "#1d4ed8", boxShadow: "0 2px 12px rgba(29,78,216,0.08)" } }}>
                        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "14px" }}>
                          <Box sx={{ width: 32, height: 32, borderRadius: "7px", bgcolor: "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                            <Typography sx={{ fontSize: 9, fontWeight: 600, color: "#64748b" }}>{formatKw(totalAssetPowerKw)} kW</Typography>
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
              )}
            </Box>
          ) : null}

          {!isLoading && !selectedAsset && !selectedRoomId ? (
            <Box sx={{ p: "24px", maxWidth: 700 }}>
              {/* Site info card */}
              <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", mb: "20px" }}>
                <Box sx={{ px: "20px", py: "16px", borderBottom: "1px solid #f1f5f9" }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>Site Details</Typography>
                  {[
                    site.address ? { label: "Address", value: site.address } : null,
                    site.city ? { label: "City", value: site.city } : null,
                    site.postcode ? { label: "Postcode", value: site.postcode } : null,
                    { label: "Country", value: site.country },
                    site.notes ? { label: "Notes", value: site.notes } : null,
                  ].filter((row): row is InfoRow => row !== null).map((row) => (
                    <Box key={row.label} sx={{ display: "flex", alignItems: "baseline", py: "7px", borderBottom: "1px solid #f8fafc" }}>
                      <Typography sx={{ fontSize: 12, color: "#64748b", width: 120, flexShrink: 0 }}>{row.label}</Typography>
                      <Typography sx={{ fontSize: 12.5, color: "#0f172a", fontWeight: 500 }}>{row.value}</Typography>
                    </Box>
                  ))}
                </Box>
                {/* Stats row */}
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", divide: "column" }}>
                  {[
                    { label: "Rooms", value: rooms.length },
                    { label: "Racks", value: cabinets.length },
                    { label: "Assets", value: totalAssets },
                    ...(totalU > 0 ? [{ label: "U Used", value: `${usedU}/${totalU}` }] : []),
                  ].map((s, i) => (
                    <Box key={s.label} sx={{ py: "14px", textAlign: "center", borderRight: i < 3 ? "1px solid #f1f5f9" : "none" }}>
                      <Typography sx={{ fontSize: 22, fontWeight: 600, color: "#0f172a", lineHeight: 1 }}>{s.value}</Typography>
                      <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", mt: "4px" }}>{s.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Rooms quick list */}
              {rooms.length > 0 ? (
                <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                  <Box sx={{ px: "20px", py: "12px", borderBottom: "1px solid #f1f5f9" }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>Rooms</Typography>
                  </Box>
                  {rooms.map((room, idx) => {
                    const roomCabinets = cabinets.filter(c => c.roomId === room.id)
                    const roomAssets = roomCabinets.reduce((s, c) => s + c._count.assets, 0)
                    return (
                      <Box key={room.id}
                        onClick={() => selectRoom(room.id)}
                        sx={{ px: "20px", py: "12px", display: "flex", alignItems: "center", cursor: "pointer", borderBottom: idx < rooms.length - 1 ? "1px solid #f8fafc" : "none", "&:hover": { bgcolor: "#f8fafc" } }}>
                        <Box sx={{ width: 32, height: 32, borderRadius: "7px", bgcolor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", mr: "12px", flexShrink: 0 }}>
                          <MemoryIcon sx={{ fontSize: 15, color: "#2563eb" }} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{room.name}</Typography>
                          <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
                            {ROOM_TYPE_LABELS[room.type] ?? room.type} · {roomCabinets.length} rack{roomCabinets.length !== 1 ? "s" : ""} · {roomAssets} assets
                          </Typography>
                        </Box>
                        <ChevronRightIcon sx={{ fontSize: 16, color: "#cbd5e1" }} />
                      </Box>
                    )
                  })}
                </Box>
              ) : (
                <Box sx={{ py: 5, textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: "10px" }}>
                  <MemoryIcon sx={{ fontSize: 28, color: "#e2e8f0", mb: 1 }} />
                  <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No rooms yet</Typography>
                  {canManage ? <Button size="small" variant="text" onClick={() => setRoomOpen(true)} sx={{ mt: 1, fontSize: 12, color: "#1d4ed8" }}>Add first room</Button> : null}
                </Box>
              )}
            </Box>
          ) : null}
        </Box>
      </Box>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Edit site */}
      <Dialog open={siteEditOpen} onClose={() => setSiteEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit site</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Site name" value={siteName} onChange={e => setSiteName(e.target.value)} required fullWidth />
            <TextField label="Address" value={siteAddress} onChange={e => setSiteAddress(e.target.value)} fullWidth />
            <Stack direction="row" spacing={2}>
              <TextField label="City" value={siteCity} onChange={e => setSiteCity(e.target.value)} fullWidth />
              <TextField label="Postcode" value={sitePostcode} onChange={e => setSitePostcode(e.target.value)} fullWidth />
            </Stack>
            <TextField label="Country" value={siteCountry} onChange={e => setSiteCountry(e.target.value)} fullWidth />
            <TextField label="Notes" value={siteNotes} onChange={e => setSiteNotes(e.target.value)} multiline rows={2} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSiteEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateSite} disabled={savingSiteEdit || !siteName.trim()}>
            {savingSiteEdit ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add room */}
      <Dialog open={roomOpen} onClose={() => setRoomOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add room</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Room name" value={roomName} onChange={e => setRoomName(e.target.value)} required fullWidth autoFocus placeholder="e.g. Server Room A" />
            <TextField select label="Type" value={roomType} onChange={e => setRoomType(e.target.value)} fullWidth>
              {Object.entries(ROOM_TYPE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateRoom} disabled={savingRoom || !roomName.trim()}>
            {savingRoom ? "Creating..." : "Create room"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit room */}
      <Dialog open={roomEditOpen} onClose={() => setRoomEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit room</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Room name" value={roomName} onChange={e => setRoomName(e.target.value)} required fullWidth />
            <TextField select label="Type" value={roomType} onChange={e => setRoomType(e.target.value)} fullWidth>
              {Object.entries(ROOM_TYPE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateRoom} disabled={savingRoomEdit || !roomName.trim()}>
            {savingRoomEdit ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add rack */}
      <Dialog open={cabinetOpen} onClose={() => setCabinetOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add rack{selectedRoom ? ` to ${selectedRoom.name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Rack name" value={cabinetName} onChange={e => setCabinetName(e.target.value)} required fullWidth autoFocus placeholder="e.g. Rack A1" />
            <TextField select label="Type" value={cabinetType} onChange={e => setCabinetType(e.target.value)} fullWidth>
              <MenuItem value="RACK">Rack</MenuItem>
              <MenuItem value="WALL_MOUNT">Wall mount</MenuItem>
              <MenuItem value="OPEN_FRAME">Open frame</MenuItem>
            </TextField>
            <TextField
              select
              label="Room"
              value={cabinetRoomId}
              onChange={e => setCabinetRoomId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">Unassigned</MenuItem>
              {rooms.map(room => <MenuItem key={room.id} value={room.id}>{room.name}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField label="Total U" type="number" value={cabinetTotalU} onChange={e => setCabinetTotalU(e.target.value)} fullWidth placeholder="42" />
              <TextField label="Power (kW)" type="number" value={cabinetPowerKw} onChange={e => setCabinetPowerKw(e.target.value)} fullWidth placeholder="10" />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCabinetOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateCabinet} disabled={savingCabinet || !cabinetName.trim()}>
            {savingCabinet ? "Creating..." : "Create rack"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit rack */}
      <Dialog open={cabinetEditOpen} onClose={() => setCabinetEditOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit rack</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Rack name" value={cabinetName} onChange={e => setCabinetName(e.target.value)} required fullWidth />
            <TextField select label="Type" value={cabinetType} onChange={e => setCabinetType(e.target.value)} fullWidth>
              <MenuItem value="RACK">Rack</MenuItem>
              <MenuItem value="WALL_MOUNT">Wall mount</MenuItem>
              <MenuItem value="OPEN_FRAME">Open frame</MenuItem>
            </TextField>
            <TextField
              select
              label="Room"
              value={cabinetRoomId}
              onChange={e => setCabinetRoomId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">Unassigned</MenuItem>
              {rooms.map(room => <MenuItem key={room.id} value={room.id}>{room.name}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField label="Total U" type="number" value={cabinetTotalU} onChange={e => setCabinetTotalU(e.target.value)} fullWidth />
              <TextField label="Power (kW)" type="number" value={cabinetPowerKw} onChange={e => setCabinetPowerKw(e.target.value)} fullWidth />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCabinetEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateCabinet} disabled={savingCabinetEdit || !cabinetName.trim()}>
            {savingCabinetEdit ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add asset */}
      <Dialog open={assetOpen} onClose={() => setAssetOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add asset{selectedCabinet ? ` to ${selectedCabinet.name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={2}>
              <TextField label="Asset tag" value={assetTag} onChange={e => setAssetTag(e.target.value)} required fullWidth autoFocus placeholder="e.g. SRV-001" />
              <TextField label="Name" value={assetName} onChange={e => setAssetName(e.target.value)} required fullWidth placeholder="e.g. HPE DL380 Gen10" />
            </Stack>
            <TextField label="Type" value={assetType} onChange={e => setAssetType(e.target.value)} required fullWidth placeholder="Server, Switch, PDU, Patch..." />
            <TextField select label="Rack" value={assetCabinetId} onChange={e => setAssetCabinetId(e.target.value)} fullWidth>
              <MenuItem value="">Unassigned</MenuItem>
              {cabinets.map(cab => <MenuItem key={cab.id} value={cab.id}>{cab.name}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField label="Manufacturer" value={assetManufacturer} onChange={e => setAssetManufacturer(e.target.value)} fullWidth />
              <TextField label="Model" value={assetModel} onChange={e => setAssetModel(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="Serial number" value={assetSerial} onChange={e => setAssetSerial(e.target.value)} fullWidth />
              <TextField label="IP address" value={assetIp} onChange={e => setAssetIp(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="U position" type="number" value={assetUPos} onChange={e => setAssetUPos(e.target.value)} fullWidth placeholder="e.g. 20" />
              <TextField label="U height" type="number" value={assetUHeight} onChange={e => setAssetUHeight(e.target.value)} fullWidth placeholder="e.g. 2" />
              <TextField label="Power draw (W)" type="number" value={assetPower} onChange={e => setAssetPower(e.target.value)} fullWidth placeholder="e.g. 400" />
            </Stack>
            <TextField select label="Rack side" value={assetRackSide} onChange={e => setAssetRackSide(e.target.value as ElevationSide)} fullWidth>
              <MenuItem value="FRONT">Front</MenuItem>
              <MenuItem value="REAR">Rear</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssetOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateAsset} disabled={savingAsset || !assetTag.trim() || !assetName.trim() || !assetType.trim()}>
            {savingAsset ? "Creating..." : "Add asset"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit asset */}
      <Dialog open={assetEditOpen} onClose={() => setAssetEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit asset</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={2}>
              <TextField label="Asset tag" value={assetTag} onChange={e => setAssetTag(e.target.value)} required fullWidth />
              <TextField label="Name" value={assetName} onChange={e => setAssetName(e.target.value)} required fullWidth />
            </Stack>
            <TextField label="Type" value={assetType} onChange={e => setAssetType(e.target.value)} required fullWidth />
            <TextField select label="Rack" value={assetCabinetId} onChange={e => setAssetCabinetId(e.target.value)} fullWidth>
              <MenuItem value="">Unassigned</MenuItem>
              {cabinets.map(cab => <MenuItem key={cab.id} value={cab.id}>{cab.name}</MenuItem>)}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField label="Manufacturer" value={assetManufacturer} onChange={e => setAssetManufacturer(e.target.value)} fullWidth />
              <TextField label="Model" value={assetModel} onChange={e => setAssetModel(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="Serial number" value={assetSerial} onChange={e => setAssetSerial(e.target.value)} fullWidth />
              <TextField label="IP address" value={assetIp} onChange={e => setAssetIp(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="U position" type="number" value={assetUPos} onChange={e => setAssetUPos(e.target.value)} fullWidth />
              <TextField label="U height" type="number" value={assetUHeight} onChange={e => setAssetUHeight(e.target.value)} fullWidth />
              <TextField label="Power draw (W)" type="number" value={assetPower} onChange={e => setAssetPower(e.target.value)} fullWidth />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField select label="Rack side" value={assetRackSide} onChange={e => setAssetRackSide(e.target.value as ElevationSide)} fullWidth>
                <MenuItem value="FRONT">Front</MenuItem>
                <MenuItem value="REAR">Rear</MenuItem>
              </TextField>
              <TextField select label="Lifecycle" value={assetLifecycle} onChange={e => setAssetLifecycle(e.target.value)} fullWidth>
                {ASSET_LIFECYCLE_OPTIONS.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
              </TextField>
              <TextField label="Status" value={assetStatus} onChange={e => setAssetStatus(e.target.value)} fullWidth />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssetEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateAsset} disabled={savingAssetEdit || !assetTag.trim() || !assetName.trim() || !assetType.trim()}>
            {savingAssetEdit ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm delete */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm delete</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Delete {deleteTarget?.type ?? "record"} <strong>{deleteTarget?.label ?? ""}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirmed} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  )
}