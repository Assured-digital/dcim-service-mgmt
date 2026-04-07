import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, MenuItem,
  Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, TextField, Tooltip, Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import StorageIcon from "@mui/icons-material/Storage"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import FileUploadIcon from "@mui/icons-material/FileUpload"
import FileDownloadIcon from "@mui/icons-material/FileDownload"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import MemoryIcon from "@mui/icons-material/Memory"
import PowerIcon from "@mui/icons-material/Power"
import { chipSx } from "../components/shared"
import { ErrorState, LoadingState, EmptyState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

// ── Types ──────────────────────────────────────────────────────────────────
type Asset = {
  id: string; name: string; assetTag: string; assetType: string
  uPosition: number | null; uHeight: number | null
  status: string; lifecycleState: string
  manufacturer: string | null; modelNumber: string | null
  serialNumber: string | null; ipAddress: string | null; powerDrawW: number | null
}

type Cabinet = {
  id: string; name: string; type: string
  totalU: number | null; usedU: number | null; powerKw: number | null
  notes: string | null; roomId: string | null
  _count: { assets: number }
  assets: Asset[]
}

type Room = {
  id: string; name: string; type: string; floor: string | null; notes: string | null
  _count: { cabinets: number }
  cabinets: Pick<Cabinet, "id"|"name"|"type"|"totalU"|"usedU"|"powerKw"|"_count">[]
}

type Check = {
  id: string; reference: string; title: string; status: string
  scheduledAt: string | null
  assignee: { email: string } | null
  passRate: number | null
}

type Site = {
  id: string; name: string; address: string | null; city: string | null
  postcode: string | null; country: string; notes: string | null
  createdAt: string; updatedAt: string
  cabinets: Cabinet[]; checks: Check[]
}

// ── Constants ──────────────────────────────────────────────────────────────
const ROOM_TYPES = ["DATA_HALL", "COMMS_ROOM", "SUPPORT", "STORAGE", "OTHER"]
const ROOM_TYPE_LABELS: Record<string, string> = {
  DATA_HALL: "Data Hall", COMMS_ROOM: "Comms Room",
  SUPPORT: "Support Area", STORAGE: "Storage", OTHER: "Other"
}

// ── Helpers ────────────────────────────────────────────────────────────────
function uFill(used: number | null, total: number | null): number {
  if (!total || total === 0) return 0
  return Math.min(100, Math.round(((used ?? 0) / total) * 100))
}
function barColor(pct: number) {
  return pct > 85 ? "#b91c1c" : pct > 65 ? "#b45309" : "#15803d"
}
function lifecycleSx(state: string) {
  if (state === "ACTIVE") return { bgcolor: "#dcfce7", color: "#15803d" }
  if (state === "RETIRED") return { bgcolor: "#f1f5f9", color: "#64748b" }
  if (state === "STAGING") return { bgcolor: "#dbeafe", color: "#1d4ed8" }
  return { bgcolor: "#fef3c7", color: "#b45309" }
}

// ── Rack elevation (visual U-slot diagram) ─────────────────────────────────
function RackElevation({ cabinet, compact = false }: { cabinet: Cabinet; compact?: boolean }) {
  const total = cabinet.totalU ?? 42
  const slotH = compact ? 7 : 10

  const slotMap: Record<number, Asset | null> = {}
  for (let u = 1; u <= total; u++) slotMap[u] = null
  cabinet.assets.forEach(a => {
    if (a.uPosition != null) {
      const h = a.uHeight ?? 1
      for (let i = 0; i < h; i++) slotMap[a.uPosition + i] = a
    }
  })

  const rendered = new Set<string>()
  const slots: React.ReactElement[] = []

  for (let u = total; u >= 1; u--) {
    const asset = slotMap[u]
    if (!asset) {
      slots.push(
        <Box key={u} sx={{
          height: slotH, bgcolor: "#f1f5f9", border: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", px: "6px"
        }}>
          <Typography sx={{ fontSize: 7, color: "#cbd5e1", fontFamily: "monospace", minWidth: 14 }}>{u}</Typography>
        </Box>
      )
      continue
    }
    if (rendered.has(asset.id)) continue
    rendered.add(asset.id)
    const h = asset.uHeight ?? 1
    const isActive = asset.lifecycleState === "ACTIVE"
    slots.push(
      <Tooltip key={`${asset.id}-${u}`} title={`U${u} — ${asset.name} (${asset.assetType})`} placement="right">
        <Box sx={{
          height: h * slotH + (h - 1),
          bgcolor: isActive ? "#dbeafe" : "#f1f5f9",
          border: `1px solid ${isActive ? "#93c5fd" : "#e2e8f0"}`,
          borderRadius: "2px", display: "flex", alignItems: "center",
          px: "6px", gap: "6px", overflow: "hidden", cursor: "default"
        }}>
          <Typography sx={{ fontSize: 7, color: "#64748b", fontFamily: "monospace", minWidth: 14, flexShrink: 0 }}>{u}</Typography>
          <Typography sx={{ fontSize: 8, color: "#1d4ed8", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.name}
          </Typography>
          {!compact && h >= 2 ? (
            <Typography sx={{ fontSize: 7.5, color: "#64748b", ml: "auto", flexShrink: 0 }}>{asset.assetType}</Typography>
          ) : null}
        </Box>
      </Tooltip>
    )
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1px", width: "100%" }}>
      {slots}
    </Box>
  )
}

// ── Rack detail view (shown when rack is selected) ─────────────────────────
function RackDetail({ cabinet }: { cabinet: Cabinet }) {
  const fill = uFill(cabinet.usedU, cabinet.totalU)
  const availableU = (cabinet.totalU ?? 0) - (cabinet.usedU ?? 0)
  const powerPct = cabinet.powerKw ? Math.min(100, Math.round((cabinet.powerKw / 20) * 100)) : 0
  const activeAssets = cabinet.assets.filter(a => a.lifecycleState === "ACTIVE").length

  return (
    <Box sx={{ p: "20px 24px", overflowY: "auto", height: "100%" }}>
      {/* Rack header */}
      <Box sx={{ mb: "20px" }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "4px" }}>
          <StorageIcon sx={{ fontSize: 16, color: "#1d4ed8" }} />
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#0f172a" }}>{cabinet.name}</Typography>
          <Chip size="small" label={cabinet.type} sx={{ bgcolor: "#f1f5f9", color: "#475569", fontSize: 10 }} />
        </Stack>
        <Typography sx={{ fontSize: 12, color: "#94a3b8" }}>
          {cabinet._count.assets} assets · {cabinet.totalU ?? "?"} U total
        </Typography>
      </Box>

      {/* KPI row */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", mb: "24px" }}>
        {[
          { label: "U Used", value: `${cabinet.usedU ?? 0}U`, sub: `of ${cabinet.totalU ?? "?"}U`, color: barColor(fill) },
          { label: "U Available", value: `${availableU}U`, sub: `${fill}% utilised`, color: "#15803d" },
          { label: "Active Assets", value: activeAssets, sub: `${cabinet._count.assets} total`, color: "#1d4ed8" },
          { label: "Power Draw", value: cabinet.powerKw ? `${cabinet.powerKw} kW` : "—", sub: cabinet.powerKw ? `${powerPct}% of 20kW` : "Not recorded", color: barColor(powerPct) },
        ].map(k => (
          <Box key={k.label} sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", p: "14px 16px" }}>
            <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", mb: "6px" }}>{k.label}</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 600, color: k.color, lineHeight: 1 }}>{k.value}</Typography>
            <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: "3px" }}>{k.sub}</Typography>
          </Box>
        ))}
      </Box>

      {/* Two-column: elevation + asset table */}
      <Box sx={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "20px", alignItems: "start" }}>

        {/* Rack elevation */}
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "8px" }}>
            Rack Elevation — Front
          </Typography>
          <Box sx={{ bgcolor: "#f8fafc", borderRadius: "6px", p: "8px", border: "1px solid #e2e8f0" }}>
            <RackElevation cabinet={cabinet} />
          </Box>
        </Box>

        {/* Asset table */}
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "8px" }}>
            Assets ({cabinet.assets.length})
          </Typography>
          {cabinet.assets.length === 0 ? (
            <Box sx={{ py: 4, textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: "8px" }}>
              <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No assets in this rack</Typography>
            </Box>
          ) : (
            <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ "& th": { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc", py: "8px" } }}>
                      <TableCell>U</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Manufacturer</TableCell>
                      <TableCell>Serial</TableCell>
                      <TableCell>IP</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cabinet.assets
                      .slice()
                      .sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0))
                      .map(a => (
                      <TableRow key={a.id} hover sx={{ cursor: "default" }}>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                          {a.uPosition != null ? `U${a.uPosition}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: 12, fontWeight: 500, color: "#0f172a" }}>{a.name}</Typography>
                          {a.modelNumber ? <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{a.modelNumber}</Typography> : null}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, color: "#475569" }}>{a.assetType}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: "#475569" }}>{a.manufacturer ?? "—"}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{a.serialNumber ?? "—"}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{a.ipAddress ?? "—"}</TableCell>
                        <TableCell>
                          <Chip size="small" label={a.lifecycleState.toLowerCase()} sx={{ ...lifecycleSx(a.lifecycleState), fontSize: 9, height: 18 }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

// ── Room overview (grid of rack cards) ────────────────────────────────────
function RoomOverview({ cabinets, onSelectCabinet, canManage, onAddCabinet }: {
  cabinets: Cabinet[]
  onSelectCabinet: (id: string) => void
  canManage: boolean
  onAddCabinet: () => void
}) {
  if (cabinets.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: "10px", m: "20px 24px" }}>
        <StorageIcon sx={{ fontSize: 32, color: "#e2e8f0", mb: 1 }} />
        <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No racks in this room yet</Typography>
        {canManage ? (
          <Button size="small" variant="text" onClick={onAddCabinet} sx={{ mt: 1, fontSize: 12, color: "#1d4ed8" }}>Add rack</Button>
        ) : null}
      </Box>
    )
  }

  return (
    <Box sx={{ p: "20px 24px" }}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
        {cabinets.map(c => {
          const fill = uFill(c.usedU, c.totalU)
          const powerPct = c.powerKw ? Math.min(100, Math.round((c.powerKw / 20) * 100)) : 0
          return (
            <Box key={c.id}
              onClick={() => onSelectCabinet(c.id)}
              sx={{
                bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
                p: "14px 16px", cursor: "pointer", transition: "all 0.15s",
                "&:hover": { borderColor: "#1d4ed8", boxShadow: "0 2px 12px rgba(15,23,42,0.07)" }
              }}>
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "12px" }}>
                <Box sx={{ width: 30, height: 30, borderRadius: "6px", bgcolor: "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <StorageIcon sx={{ fontSize: 14, color: "#1d4ed8" }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{c.name}</Typography>
                  <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{c._count.assets} assets</Typography>
                </Box>
              </Stack>
              {c.totalU ? (
                <Box sx={{ mb: "8px" }}>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: "3px" }}>
                    <Typography sx={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>U Space</Typography>
                    <Typography sx={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{c.usedU ?? 0}/{c.totalU}U</Typography>
                  </Stack>
                  <Box sx={{ height: 4, bgcolor: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${fill}%`, bgcolor: barColor(fill), borderRadius: 2, transition: "width 0.3s" }} />
                  </Box>
                </Box>
              ) : null}
              {c.powerKw ? (
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: "3px" }}>
                    <Typography sx={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Power</Typography>
                    <Typography sx={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{c.powerKw} kW</Typography>
                  </Stack>
                  <Box sx={{ height: 4, bgcolor: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                    <Box sx={{ height: "100%", width: `${powerPct}%`, bgcolor: barColor(powerPct), borderRadius: 2, transition: "width 0.3s" }} />
                  </Box>
                </Box>
              ) : null}
              <Typography sx={{ fontSize: 10, color: "#1d4ed8", mt: "10px", fontWeight: 500 }}>View rack →</Typography>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setRecordLabel } = useBreadcrumb()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  // Tree state
  const [expandedRooms, setExpandedRooms] = React.useState<Set<string>>(new Set())
  const [expandedCabinets, setExpandedCabinets] = React.useState<Set<string>>(new Set())
  const [selectedRoomId, setSelectedRoomId] = React.useState<string | "unassigned" | null>(null)
  const [selectedCabinetId, setSelectedCabinetId] = React.useState<string | null>(null)

  const [error, setError] = React.useState("")

  // Room dialog
  const [roomOpen, setRoomOpen] = React.useState(false)
  const [roomName, setRoomName] = React.useState("")
  const [roomType, setRoomType] = React.useState("DATA_HALL")
  const [roomFloor, setRoomFloor] = React.useState("")
  const [savingRoom, setSavingRoom] = React.useState(false)

  // Cabinet dialog
  const [cabinetOpen, setCabinetOpen] = React.useState(false)
  const [cabinetName, setCabinetName] = React.useState("")
  const [cabinetType, setCabinetType] = React.useState("RACK")
  const [cabinetTotalU, setCabinetTotalU] = React.useState("")
  const [cabinetPowerKw, setCabinetPowerKw] = React.useState("")
  const [savingCabinet, setSavingCabinet] = React.useState(false)

  // Import/export
  const [importOpen, setImportOpen] = React.useState(false)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importing, setImporting] = React.useState(false)
  const [importResult, setImportResult] = React.useState<{ created: number; updated: number; skipped: number } | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────
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

  React.useEffect(() => { if (site) setRecordLabel(site.name) }, [site]) // eslint-disable-line

  // Auto-select + expand first room on load
  React.useEffect(() => {
    if (selectedRoomId !== null) return
    if (rooms.length > 0) {
      setSelectedRoomId(rooms[0].id)
      setExpandedRooms(new Set([rooms[0].id]))
    } else if (unassignedCabinets.length > 0) {
      setSelectedRoomId("unassigned")
    }
  }, [rooms, cabinets]) // eslint-disable-line

  // ── Derived ───────────────────────────────────────────────────────────
  const unassignedCabinets = cabinets.filter(c => !c.roomId)
  const totalAssets = cabinets.reduce((s, c) => s + c._count.assets, 0)
  const totalU = cabinets.reduce((s, c) => s + (c.totalU ?? 0), 0)
  const usedU = cabinets.reduce((s, c) => s + (c.usedU ?? 0), 0)

  const selectedCabinet = cabinets.find(c => c.id === selectedCabinetId) ?? null
  const selectedRoom = rooms.find(r => r.id === selectedRoomId) ?? null

  const visibleCabinets = React.useMemo(() => {
    if (!selectedRoomId) return []
    if (selectedRoomId === "unassigned") return unassignedCabinets
    return cabinets.filter(c => c.roomId === selectedRoomId)
  }, [selectedRoomId, cabinets, unassignedCabinets])

  // ── Tree interaction ──────────────────────────────────────────────────
  function toggleRoom(roomId: string) {
    setExpandedRooms(prev => {
      const next = new Set(prev)
      next.has(roomId) ? next.delete(roomId) : next.add(roomId)
      return next
    })
  }

  function selectRoom(roomId: string | "unassigned") {
    setSelectedRoomId(roomId)
    setSelectedCabinetId(null)
    if (roomId !== "unassigned") {
      setExpandedRooms(prev => { const n = new Set(prev); n.add(roomId); return n })
    }
  }

  function selectCabinet(cabinetId: string) {
    const cabinet = cabinets.find(c => c.id === cabinetId)
    if (cabinet?.roomId) {
      setSelectedRoomId(cabinet.roomId)
      setExpandedRooms(prev => { const n = new Set(prev); n.add(cabinet.roomId!); return n })
    }
    setSelectedCabinetId(cabinetId)
  }

  // ── Handlers ──────────────────────────────────────────────────────────
  async function handleCreateRoom() {
    if (!roomName.trim()) return
    setSavingRoom(true); setError("")
    try {
      const res = await api.post<Room>(`/sites/${siteId}/rooms`, { name: roomName.trim(), type: roomType, floor: roomFloor || undefined })
      setRoomOpen(false); setRoomName(""); setRoomType("DATA_HALL"); setRoomFloor("")
      qc.invalidateQueries({ queryKey: ["site-rooms", siteId] })
      selectRoom(res.data.id)
    } catch (e: any) { setError(e?.message ?? "Failed to create room") }
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
        roomId: selectedRoomId && selectedRoomId !== "unassigned" ? selectedRoomId : undefined
      })
      setCabinetOpen(false); setCabinetName(""); setCabinetType("RACK"); setCabinetTotalU(""); setCabinetPowerKw("")
      qc.invalidateQueries({ queryKey: ["site-cabinets", siteId] })
      qc.invalidateQueries({ queryKey: ["site-rooms", siteId] })
      selectCabinet(res.data.id)
    } catch (e: any) { setError(e?.message ?? "Failed to create rack") }
    finally { setSavingCabinet(false) }
  }

  async function handleImport() {
    if (!importFile) return
    setImporting(true); setImportResult(null); setError("")
    try {
      const text = await importFile.text()
      const lines = text.trim().split("\n").filter((l: string) => l.trim())
      const headers = lines[0].split(",").map((h: string) => h.trim().replace(/^"|"$/g, ""))
      const rows = lines.slice(1).map((line: string) => {
        const values = line.match(/(".*?"|[^,]+)(?=,|$)/g) ?? []
        return Object.fromEntries(headers.map((h: string, i: number) => [h, (values[i] ?? "").replace(/^"|"$/g, "").trim()]))
      }).filter((row: any) => Object.values(row).some((v: any) => v !== ""))
      const result = await api.post(`/assets/site/${siteId}/import`, { rows })
      setImportResult(result.data)
      qc.invalidateQueries({ queryKey: ["site-cabinets", siteId] })
    } catch (e: any) { setError(Array.isArray(e?.message) ? e.message.join(", ") : e?.message ?? "Import failed") }
    finally { setImporting(false) }
  }

  async function handleExport() {
    try {
      const response = await api.get(`/assets/site/${siteId}/export`, { responseType: "blob" })
      const url = URL.createObjectURL(new Blob([response.data]))
      const a = document.createElement("a")
      a.href = url; a.download = `assets-${site?.name ?? siteId}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch { setError("Failed to export") }
  }

  if (siteLoading) return <LoadingState />
  if (!site) return <ErrorState title="Site not found" />

  const isLoading = roomsLoading || cabinetsLoading

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Box sx={{
      mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" },
      height: "calc(100vh - 64px)", display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: "#f8fafc"
    }}>

      {/* ── Site header ─────────────────────────────────────────────────── */}
      <Box sx={{ bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0", px: "28px", pt: "14px", pb: "12px", flexShrink: 0 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
          <Box>
            <Typography sx={{ fontSize: 11, color: "#94a3b8", mb: "2px" }}>
              {[site.address, site.city, site.postcode].filter(Boolean).join(", ") || site.country}
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 500, color: "#0f172a" }}>{site.name}</Typography>
          </Box>
          <Stack direction="row" spacing={3} sx={{ flexShrink: 0, pt: "2px" }}>
            {[
              { label: "Rooms", value: rooms.length },
              { label: "Racks", value: cabinets.length },
              { label: "Assets", value: totalAssets },
              ...(totalU > 0 ? [{ label: "U Used", value: `${usedU}\u200a/\u200a${totalU}` }] : [])
            ].map(s => (
              <Box key={s.label} sx={{ textAlign: "center" }}>
                <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#0f172a", lineHeight: 1 }}>{s.value}</Typography>
                <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", mt: "2px" }}>{s.label}</Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
        {error ? <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert> : null}
      </Box>

      {/* ── 3-column body ───────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* ── Left tree rail ──────────────────────────────────────────── */}
        <Box sx={{ width: 220, minWidth: 220, bgcolor: "#ffffff", borderRight: "1px solid #e2e8f0", overflowY: "auto", flexShrink: 0, py: "10px" }}>

          {/* Rail header */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: "12px", pb: "8px" }}>
            <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#475569" }}>
              {site.name}
            </Typography>
            {canManage ? (
              <Tooltip title="Add room">
                <IconButton size="small" onClick={() => setRoomOpen(true)}
                  sx={{ width: 18, height: 18, color: "#475569", "&:hover": { color: "#1d4ed8" } }}>
                  <AddIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>

          {/* Room tree */}
          {isLoading ? <Box sx={{ px: "12px" }}><Typography sx={{ fontSize: 11, color: "#475569" }}>Loading...</Typography></Box> : null}

          {rooms.map(room => {
            const roomCabinets = cabinets.filter(c => c.roomId === room.id)
            const isRoomSelected = selectedRoomId === room.id && !selectedCabinetId
            const isExpanded = expandedRooms.has(room.id)
            const hasActiveChild = roomCabinets.some(c => c.id === selectedCabinetId)

            return (
              <Box key={room.id}>
                {/* Room row */}
                <Stack direction="row" alignItems="center"
                  sx={{
                    px: "8px", py: "6px", cursor: "pointer",
                    bgcolor: isRoomSelected ? "rgba(29,78,216,0.07)" : hasActiveChild ? "rgba(0,0,0,0.018)" : "transparent",
                    "&:hover": { bgcolor: isRoomSelected ? "rgba(29,78,216,0.07)" : "rgba(0,0,0,0.025)" },
                    transition: "background 0.1s"
                  }}
                  onClick={() => { toggleRoom(room.id); selectRoom(room.id) }}>
                  <Box sx={{ color: "#475569", display: "flex", alignItems: "center", mr: "2px", flexShrink: 0 }}>
                    {isExpanded ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
                  </Box>
                  <Box sx={{ width: 14, height: 14, borderRadius: "3px", bgcolor: "rgba(29,78,216,0.10)", display: "flex", alignItems: "center", justifyContent: "center", mr: "8px", flexShrink: 0 }}>
                    <MemoryIcon sx={{ fontSize: 9, color: "#1d4ed8" }} />
                  </Box>
                  <Typography sx={{ fontSize: 12, color: isRoomSelected ? "#1d4ed8" : hasActiveChild ? "#0f172a" : "#64748b", fontWeight: isRoomSelected || hasActiveChild ? 500 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {room.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>{roomCabinets.length}</Typography>
                </Stack>

                {/* Racks within room */}
                {isExpanded && roomCabinets.map(cabinet => {
                  const isRackSelected = selectedCabinetId === cabinet.id
                  const isExpCab = expandedCabinets.has(cabinet.id)

                  return (
                    <Box key={cabinet.id}>
                      {/* Rack row */}
                      <Stack direction="row" alignItems="center"
                        sx={{
                          pl: "24px", pr: "8px", py: "5px", cursor: "pointer",
                          bgcolor: isRackSelected ? "rgba(29,78,216,0.10)" : "transparent",
                          "&:hover": { bgcolor: isRackSelected ? "rgba(29,78,216,0.10)" : "rgba(0,0,0,0.025)" },
                          transition: "background 0.1s"
                        }}
                        onClick={(e) => { e.stopPropagation(); selectCabinet(cabinet.id) }}>
                        {cabinet.assets.length > 0 ? (
                          <Box sx={{ color: "#334155", display: "flex", alignItems: "center", mr: "2px", flexShrink: 0 }}
                            onClick={(e) => { e.stopPropagation(); setExpandedCabinets(prev => { const n = new Set(prev); n.has(cabinet.id) ? n.delete(cabinet.id) : n.add(cabinet.id); return n }) }}>
                            {isExpCab ? <ExpandMoreIcon sx={{ fontSize: 13 }} /> : <ChevronRightIcon sx={{ fontSize: 13 }} />}
                          </Box>
                        ) : (
                          <Box sx={{ width: 14, flexShrink: 0 }} />
                        )}
                        <StorageIcon sx={{ fontSize: 11, color: isRackSelected ? "#1d4ed8" : "#94a3b8", mr: "8px", flexShrink: 0 }} />
                        <Typography sx={{ fontSize: 12, color: isRackSelected ? "#1d4ed8" : "#475569", fontWeight: isRackSelected ? 500 : 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cabinet.name}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>{cabinet._count.assets}</Typography>
                      </Stack>

                      {/* Assets within rack */}
                      {isExpCab && cabinet.assets
                        .slice().sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0))
                        .map(asset => (
                          <Stack key={asset.id} direction="row" alignItems="center"
                            sx={{
                              pl: "38px", pr: "8px", py: "4px", cursor: "default",
                              "&:hover": { bgcolor: "rgba(0,0,0,0.018)" }
                            }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: asset.lifecycleState === "ACTIVE" ? "#15803d" : "#475569", mr: "8px", flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 11, color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {asset.uPosition != null ? `U${asset.uPosition} ` : ""}{asset.name}
                            </Typography>
                          </Stack>
                        ))}
                    </Box>
                  )
                })}
              </Box>
            )
          })}

          {/* Unassigned */}
          {unassignedCabinets.length > 0 ? (
            <Box>
              {rooms.length > 0 ? <Box sx={{ height: 1, bgcolor: "#e2e8f0", mx: "12px", my: "6px" }} /> : null}
              <Stack direction="row" alignItems="center"
                sx={{
                  px: "8px", py: "6px", cursor: "pointer",
                  bgcolor: selectedRoomId === "unassigned" && !selectedCabinetId ? "rgba(29,78,216,0.07)" : "transparent",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.025)" }
                }}
                onClick={() => selectRoom("unassigned")}>
                <ChevronRightIcon sx={{ fontSize: 14, color: "#475569", mr: "2px" }} />
                <StorageIcon sx={{ fontSize: 11, color: "#475569", mr: "8px" }} />
                <Typography sx={{ fontSize: 12, color: "#64748b", flex: 1 }}>Unassigned</Typography>
                <Typography sx={{ fontSize: 10, color: "#334155" }}>{unassignedCabinets.length}</Typography>
              </Stack>
            </Box>
          ) : null}

          {rooms.length === 0 && unassignedCabinets.length === 0 && !isLoading ? (
            <Box sx={{ px: "12px", py: "8px" }}>
              <Typography sx={{ fontSize: 11, color: "#334155", lineHeight: 1.5 }}>No rooms yet. Add a room to get started.</Typography>
            </Box>
          ) : null}
        </Box>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, overflowY: "auto", minWidth: 0 }}>

          {/* Content header */}
          <Box sx={{ px: "24px", pt: "16px", pb: "14px", borderBottom: "1px solid #e2e8f0", bgcolor: "#ffffff", flexShrink: 0 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                {selectedCabinet ? (
                  <>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: "2px" }}>
                      <Typography
                        onClick={() => { setSelectedCabinetId(null) }}
                        sx={{ fontSize: 12, color: "#64748b", cursor: "pointer", "&:hover": { color: "#1d4ed8" } }}>
                        {selectedRoom?.name ?? "Room"}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "#cbd5e1" }}>›</Typography>
                      <Typography sx={{ fontSize: 12, color: "#0f172a", fontWeight: 500 }}>{selectedCabinet.name}</Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
                      {selectedCabinet._count.assets} assets · {selectedCabinet.type}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
                      {selectedRoomId === "unassigned" ? "Unassigned Racks" : selectedRoom?.name ?? ""}
                    </Typography>
                    {selectedRoom?.type ? (
                      <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
                        {ROOM_TYPE_LABELS[selectedRoom.type]}{selectedRoom.floor ? ` · Floor ${selectedRoom.floor}` : ""}
                        {" · "}{visibleCabinets.length} rack{visibleCabinets.length !== 1 ? "s" : ""}
                      </Typography>
                    ) : null}
                  </>
                )}
              </Box>
              {canManage ? (
                <Stack direction="row" spacing={1}>
                  {!selectedCabinet ? (
                    <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                      onClick={() => setCabinetOpen(true)} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                      Add rack
                    </Button>
                  ) : null}
                  <Button size="small" variant="outlined" startIcon={<FileUploadIcon sx={{ fontSize: 13 }} />}
                    onClick={() => setImportOpen(true)} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                    Import CSV
                  </Button>
                  <Button size="small" variant="outlined" startIcon={<FileDownloadIcon sx={{ fontSize: 13 }} />}
                    onClick={handleExport} sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                    Export CSV
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </Box>

          {/* Main content area */}
          {isLoading ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}

          {!isLoading && selectedCabinet ? (
            <RackDetail cabinet={selectedCabinet} />
          ) : null}

          {!isLoading && !selectedCabinet && selectedRoomId ? (
            <RoomOverview
              cabinets={visibleCabinets}
              onSelectCabinet={selectCabinet}
              canManage={canManage}
              onAddCabinet={() => setCabinetOpen(true)}
            />
          ) : null}

          {!isLoading && !selectedRoomId ? (
            <Box sx={{ p: 3 }}>
              <EmptyState title="Select a room or rack" detail="Use the left panel to navigate the site hierarchy." />
            </Box>
          ) : null}
        </Box>

        {/* ── Right column ─────────────────────────────────────────────── */}
        <Box sx={{ width: 220, minWidth: 220, bgcolor: "#ffffff", borderLeft: "1px solid #e2e8f0", overflowY: "auto", flexShrink: 0, p: "16px" }}>
          <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>Site Info</Typography>
          {[
            site.address ? { label: "Address", value: site.address } : null,
            site.city ? { label: "City", value: site.city } : null,
            site.postcode ? { label: "Postcode", value: site.postcode } : null,
            { label: "Country", value: site.country },
          ].filter(Boolean).map((row: any) => (
            <Box key={row.label} sx={{ display: "flex", justifyContent: "space-between", py: "5px", borderBottom: "1px solid #f1f5f9" }}>
              <Typography sx={{ fontSize: 11, color: "#64748b" }}>{row.label}</Typography>
              <Typography sx={{ fontSize: 11, color: "#0f172a", textAlign: "right", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.value}</Typography>
            </Box>
          ))}

          <Divider sx={{ my: "14px" }} />

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: "8px" }}>
            <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>Recent Checks</Typography>
            <Button size="small" variant="text" onClick={() => navigate("/checks")} sx={{ fontSize: 10, color: "#1d4ed8", minWidth: 0, p: 0 }}>All</Button>
          </Stack>
          {(site.checks ?? []).length === 0 ? (
            <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>No checks at this site</Typography>
          ) : null}
          {(site.checks ?? []).slice(0, 4).map(c => (
            <Box key={c.id} sx={{ py: "6px", borderBottom: "1px solid #f8fafc", cursor: "pointer", "&:hover": { opacity: 0.75 } }}
              onClick={() => navigate(`/checks/${c.id}`)}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography sx={{ fontSize: 10, fontFamily: "monospace", color: "#94a3b8" }}>{c.reference}</Typography>
                <Chip size="small" sx={{ ...chipSx(c.status), fontSize: 8, height: 14 }} label={c.status.toLowerCase().replace("_", " ")} />
              </Stack>
              <Typography sx={{ fontSize: 11, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", mt: "1px" }}>{c.title}</Typography>
            </Box>
          ))}

          {canManage ? (
            <>
              <Divider sx={{ my: "14px" }} />
              <Button fullWidth size="small" variant="outlined" startIcon={<FactCheckIcon sx={{ fontSize: 12 }} />}
                onClick={() => navigate("/checks")} sx={{ fontSize: 11, borderColor: "#e2e8f0", color: "#475569" }}>
                Schedule check
              </Button>
              <Button fullWidth size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 12 }} />}
                onClick={() => setRoomOpen(true)} sx={{ fontSize: 11, borderColor: "#e2e8f0", color: "#475569", mt: 1 }}>
                Add room
              </Button>
            </>
          ) : null}
        </Box>
      </Box>

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
      <Dialog open={roomOpen} onClose={() => setRoomOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add room</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Room name" value={roomName} onChange={e => setRoomName(e.target.value)} required fullWidth placeholder="e.g. Server Room A" />
            <TextField select label="Room type" value={roomType} onChange={e => setRoomType(e.target.value)} fullWidth>
              {ROOM_TYPES.map(t => <MenuItem key={t} value={t}>{ROOM_TYPE_LABELS[t]}</MenuItem>)}
            </TextField>
            <TextField label="Floor (optional)" value={roomFloor} onChange={e => setRoomFloor(e.target.value)} fullWidth placeholder="e.g. G, 1, B1" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoomOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateRoom} disabled={savingRoom || !roomName.trim()}>
            {savingRoom ? "Creating..." : "Create room"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cabinetOpen} onClose={() => setCabinetOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add rack{selectedRoom ? ` to ${selectedRoom.name}` : ""}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Rack name" value={cabinetName} onChange={e => setCabinetName(e.target.value)} required fullWidth placeholder="e.g. Rack A1" />
            <TextField select label="Type" value={cabinetType} onChange={e => setCabinetType(e.target.value)} fullWidth>
              <MenuItem value="RACK">Rack</MenuItem>
              <MenuItem value="WALL_MOUNT">Wall mount</MenuItem>
              <MenuItem value="OPEN_FRAME">Open frame</MenuItem>
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

      <Dialog open={importOpen} onClose={() => { setImportOpen(false); setImportResult(null); setImportFile(null) }} maxWidth="sm" fullWidth>
        <DialogTitle>Import assets from Hyperview CSV</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {importResult ? (
              <Alert severity="success">{importResult.created} created · {importResult.updated} updated · {importResult.skipped} skipped</Alert>
            ) : null}
            <Box sx={{ border: "1.5px dashed #e2e8f0", borderRadius: "8px", p: 3, textAlign: "center", cursor: "pointer", bgcolor: "#f8fafc" }}
              onClick={() => document.getElementById("csv-infra")?.click()}>
              <FileUploadIcon sx={{ fontSize: 28, color: "#94a3b8", mb: 1 }} />
              <Typography sx={{ fontSize: 13, color: "#64748b" }}>{importFile ? importFile.name : "Click to select CSV"}</Typography>
              <input id="csv-infra" type="file" accept=".csv" style={{ display: "none" }} onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setImportOpen(false); setImportResult(null); setImportFile(null) }}>Close</Button>
          <Button variant="contained" onClick={handleImport} disabled={!importFile || importing}>{importing ? "Importing..." : "Import"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}