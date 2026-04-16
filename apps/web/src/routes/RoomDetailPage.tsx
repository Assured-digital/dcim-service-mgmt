import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Chip, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import StorageIcon from "@mui/icons-material/Storage"
import SearchIcon from "@mui/icons-material/Search"
import { ErrorState, LoadingState, EmptyState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

type Asset = {
  id: string; name: string; assetTag: string; assetType: string
  uPosition: number | null; uHeight: number | null
  status: string; lifecycleState: string
  manufacturer: string | null; modelNumber: string | null
  serialNumber: string | null; ipAddress: string | null; powerDrawW: number | null
  cabinet: { id: string; name: string } | null
}

type Cabinet = {
  id: string; name: string; type: string
  totalU: number | null; usedU: number | null; powerKw: number | null
  roomId: string | null
  _count: { assets: number }
}

type Room = {
  id: string; name: string; type: string; floor: string | null
}

type Site = {
  id: string; name: string
}

const ASSET_TYPE_COLORS: Record<string, string> = {
  Server: "#dbeafe", Switch: "#fce7f3", Patch: "#f1f5f9",
  PDU: "#fef3c7", UPS: "#d1fae5", KVM: "#ede9fe", Firewall: "#fee2e2"
}

function assetTypeColor(type: string) {
  return ASSET_TYPE_COLORS[type] ?? "#f1f5f9"
}

function lifecycleSx(state: string) {
  if (state === "ACTIVE") return { bgcolor: "#dcfce7", color: "#15803d" }
  if (state === "RETIRED") return { bgcolor: "#f1f5f9", color: "#64748b" }
  if (state === "STAGING") return { bgcolor: "#dbeafe", color: "#1d4ed8" }
  return { bgcolor: "#fef3c7", color: "#b45309" }
}

function uFill(used: number | null, total: number | null) {
  if (!total) return 0
  return Math.min(100, Math.round(((used ?? 0) / total) * 100))
}
function barColor(pct: number) {
  return pct > 85 ? "#b91c1c" : pct > 65 ? "#b45309" : "#15803d"
}

export default function RoomDetailPage() {
  const { siteId, roomId } = useParams<{ siteId: string; roomId: string }>()
  const navigate = useNavigate()
  const { setBreadcrumbs } = useBreadcrumb()

  const [tab, setTab] = React.useState<"racks" | "assets">("racks")
  const [search, setSearch] = React.useState("")
  const [filterLifecycle, setFilterLifecycle] = React.useState("ALL")
  const [filterType, setFilterType] = React.useState("ALL")

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  const { data: site } = useQuery({
    queryKey: ["site-detail", siteId],
    queryFn: async () => (await api.get<Site>(`/sites/${siteId}`)).data,
    enabled: !!siteId
  })

  const { data: rooms = [] } = useQuery({
    queryKey: ["site-rooms", siteId],
    queryFn: async () => (await api.get<Room[]>(`/sites/${siteId}/rooms`)).data,
    enabled: !!siteId
  })

  const { data: cabinets = [], isLoading: cabinetsLoading } = useQuery({
    queryKey: ["site-cabinets", siteId],
    queryFn: async () => (await api.get<Cabinet[]>(`/sites/${siteId}/cabinets`)).data,
    enabled: !!siteId
  })

  // Assets — fetched from the site level, filtered client-side by room
  const { data: allAssets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ["site-assets-room", siteId, roomId],
    queryFn: async () => {
      const res = await api.get<Asset[]>(`/assets?siteId=${siteId}`)
      return res.data
    },
    enabled: !!siteId
  })

  const room = rooms.find(r => r.id === roomId)
  const roomCabinets = cabinets.filter(c => c.roomId === roomId)

  // Assets in this room's cabinets
  const roomCabinetIds = new Set(roomCabinets.map(c => c.id))
  const roomAssets = allAssets.filter(a => a.cabinet && roomCabinetIds.has(a.cabinet.id))

  // Filtered assets
  const filteredAssets = roomAssets.filter(a => {
    if (filterLifecycle !== "ALL" && a.lifecycleState !== filterLifecycle) return false
    if (filterType !== "ALL" && a.assetType !== filterType) return false
    if (search && !a.name.toLowerCase().includes(search.toLowerCase()) &&
        !a.assetTag.toLowerCase().includes(search.toLowerCase()) &&
        !(a.serialNumber ?? "").toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const assetTypes = [...new Set(roomAssets.map(a => a.assetType))].sort()

  // Breadcrumb
  React.useEffect(() => {
    if (site && room) {
      setBreadcrumbs([
        { label: site.name, path: `/asset-management/${siteId}` },
        { label: room.name }
      ])
    }
  }, [site, room]) // eslint-disable-line

  if (!room && !cabinetsLoading) return <ErrorState title="Room not found" />

  const totalU = roomCabinets.reduce((s, c) => s + (c.totalU ?? 0), 0)
  const usedU = roomCabinets.reduce((s, c) => s + (c.usedU ?? 0), 0)

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 56px)", mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" }, overflow: "hidden", bgcolor: "var(--color-background-tertiary)" }}>

      {/* Header */}
      <Box sx={{ bgcolor: "var(--color-background-primary)", borderBottom: "1px solid var(--color-border-primary)", px: "28px", pt: "14px", pb: 0, flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: "14px" }}>
          <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {roomCabinets.length} rack{roomCabinets.length !== 1 ? "s" : ""}
            {totalU > 0 ? ` · ${usedU}/${totalU}U used` : ""}
            {" · "}{roomAssets.length} assets
          </Typography>
          {canManage ? (
            <Button size="small" variant="contained"
              startIcon={<AddIcon sx={{ fontSize: 13 }} />}
              onClick={() => navigate(`/asset-management/${siteId}`)}>
              Add rack
            </Button>
          ) : null}
        </Stack>

        {/* Tabs */}
        <Stack direction="row" spacing={0}>
          {[
            { key: "racks", label: "Racks", count: roomCabinets.length },
            { key: "assets", label: "Assets", count: roomAssets.length },
          ].map(t => (
            <Box key={t.key} onClick={() => setTab(t.key as any)}
              sx={{
                px: "16px", py: "10px", cursor: "pointer", fontSize: 13, fontWeight: 500,
                color: tab === t.key ? "#1d4ed8" : "var(--color-text-secondary)",
                borderBottom: tab === t.key ? "2px solid #1d4ed8" : "2px solid transparent",
                display: "flex", alignItems: "center", gap: "6px",
                transition: "all 0.15s", "&:hover": { color: "#0f172a" }
              }}>
              {t.label}
                <Box sx={{ px: "5px", py: "1px", borderRadius: "4px", bgcolor: tab === t.key ? "#dbeafe" : "var(--color-background-secondary)", fontSize: 11, fontWeight: 600, color: tab === t.key ? "#1d4ed8" : "var(--color-text-secondary)" }}>
                {t.count}
              </Box>
            </Box>
          ))}
        </Stack>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: "auto" }}>

        {/* ── Racks tab ─── */}
        {tab === "racks" ? (
          <Box sx={{ p: "20px 24px" }}>
            {cabinetsLoading ? <LoadingState /> : null}
            {!cabinetsLoading && roomCabinets.length === 0 ? (
              <EmptyState title="No racks in this room" detail="Add racks from the site overview." />
            ) : null}
            {!cabinetsLoading && roomCabinets.length > 0 ? (
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                {roomCabinets.map(c => {
                  const fill = uFill(c.usedU, c.totalU)
                  const powerPct = c.powerKw ? Math.min(100, Math.round((c.powerKw / 20) * 100)) : 0
                  return (
                      <Box key={c.id}
                      onClick={() => navigate(`/asset-management/${siteId}?roomId=${roomId}&cabinetId=${c.id}`)}
                      sx={{
                        bgcolor: "var(--color-background-primary)", border: "1px solid var(--color-border-primary)", borderRadius: "10px",
                        p: "16px 18px", cursor: "pointer", transition: "all 0.15s",
                        "&:hover": { borderColor: "#1d4ed8", boxShadow: "0 2px 12px rgba(29,78,216,0.08)" }
                      }}>
                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "14px" }}>
                        <Box sx={{ width: 34, height: 34, borderRadius: "8px", bgcolor: "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <StorageIcon sx={{ fontSize: 16, color: "#1d4ed8" }} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{c.name}</Typography>
                          <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{c._count.assets} assets · {c.type}</Typography>
                        </Box>
                      </Stack>
                      {c.totalU ? (
                        <Box sx={{ mb: "8px" }}>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: "3px" }}>
                            <Typography sx={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>U Space</Typography>
                            <Typography sx={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)" }}>{c.usedU ?? 0}/{c.totalU}U</Typography>
                          </Stack>
                          <Box sx={{ height: 4, bgcolor: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                            <Box sx={{ height: "100%", width: `${fill}%`, bgcolor: barColor(fill), borderRadius: 2 }} />
                          </Box>
                        </Box>
                      ) : null}
                      {c.powerKw ? (
                        <Box>
                          <Stack direction="row" justifyContent="space-between" sx={{ mb: "3px" }}>
                            <Typography sx={{ fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Power</Typography>
                            <Typography sx={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)" }}>{c.powerKw} kW</Typography>
                          </Stack>
                          <Box sx={{ height: 4, bgcolor: "#f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                            <Box sx={{ height: "100%", width: `${powerPct}%`, bgcolor: barColor(powerPct), borderRadius: 2 }} />
                          </Box>
                        </Box>
                      ) : null}
                      <Typography sx={{ fontSize: 11, color: "#1d4ed8", mt: "12px", fontWeight: 500 }}>View rack →</Typography>
                    </Box>
                  )
                })}
              </Box>
            ) : null}
          </Box>
        ) : null}

        {/* ── Assets tab ─── */}
        {tab === "assets" ? (
          <Box>
            {/* Filter bar */}
            <Box sx={{ px: "24px", py: "12px", bgcolor: "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box sx={{ display: "flex", alignItems: "center", gap: "8px", px: "10px", py: "6px", bgcolor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", flex: "0 0 220px" }}>
                  <SearchIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search assets..."
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, color: "#0f172a", width: "100%" }}
                  />
                </Box>
                {/* Type filter chips */}
                {["ALL", ...assetTypes].map(t => (
                  <Box key={t} onClick={() => setFilterType(t)}
                    sx={{
                      px: "12px", py: "5px", borderRadius: "6px", cursor: "pointer",
                      fontSize: 12, fontWeight: 500,
                      bgcolor: filterType === t ? "#1d4ed8" : "#f8fafc",
                      color: filterType === t ? "#ffffff" : "#475569",
                      border: "1px solid", borderColor: filterType === t ? "#1d4ed8" : "#e2e8f0",
                      transition: "all 0.1s", "&:hover": { borderColor: "#1d4ed8" }
                    }}>
                    {t === "ALL" ? "All types" : t}
                  </Box>
                ))}
                <Box sx={{ flex: 1 }} />
                {/* Lifecycle filter */}
                {["ALL", "ACTIVE", "STAGING", "PLANNED", "RETIRED"].map(l => (
                  <Box key={l} onClick={() => setFilterLifecycle(l)}
                    sx={{
                      px: "12px", py: "5px", borderRadius: "6px", cursor: "pointer",
                      fontSize: 12, fontWeight: 500,
                      bgcolor: filterLifecycle === l ? "#0f172a" : "#f8fafc",
                      color: filterLifecycle === l ? "#ffffff" : "#475569",
                      border: "1px solid", borderColor: filterLifecycle === l ? "#0f172a" : "#e2e8f0",
                      transition: "all 0.1s", "&:hover": { borderColor: "#0f172a" }
                    }}>
                    {l === "ALL" ? "All" : l.charAt(0) + l.slice(1).toLowerCase()}
                  </Box>
                ))}
                <Typography sx={{ fontSize: 12, color: "#94a3b8", flexShrink: 0 }}>
                  {filteredAssets.length} of {roomAssets.length}
                </Typography>
              </Stack>
            </Box>

            {/* Asset table */}
            {assetsLoading ? <Box sx={{ p: 3 }}><LoadingState /></Box> : null}
            {!assetsLoading && filteredAssets.length === 0 ? (
              <Box sx={{ p: 3 }}><EmptyState title="No assets match" detail="Try adjusting your filters." /></Box>
            ) : null}
            {!assetsLoading && filteredAssets.length > 0 ? (
              <Box sx={{ bgcolor: "#ffffff", mx: "24px", my: "16px", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ "& th": { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc", py: "10px", borderBottom: "1px solid #e2e8f0" } }}>
                        <TableCell sx={{ width: 140 }}>Type</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell>Rack · U</TableCell>
                        <TableCell>Manufacturer</TableCell>
                        <TableCell>Serial</TableCell>
                        <TableCell>IP</TableCell>
                        <TableCell>Lifecycle</TableCell>
                        <TableCell align="right">Power</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredAssets.map(a => (
                        <TableRow key={a.id} hover sx={{ cursor: "pointer", "&:hover td": { bgcolor: "#f8fafc" } }}
                          onClick={() => navigate(`/asset-management/${siteId}?roomId=${roomId}&cabinetId=${a.cabinet?.id}&assetId=${a.id}`)}>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Box sx={{ width: 20, height: 20, borderRadius: "4px", bgcolor: assetTypeColor(a.assetType), flexShrink: 0 }} />
                              <Typography sx={{ fontSize: 12, color: "#475569" }}>{a.assetType}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: "#0f172a" }}>{a.name}</Typography>
                            {a.modelNumber ? <Typography sx={{ fontSize: 10.5, color: "#94a3b8" }}>{a.modelNumber}</Typography> : null}
                          </TableCell>
                          <TableCell sx={{ fontSize: 12, color: "#475569" }}>
                            {a.cabinet?.name ?? "—"}{a.uPosition != null ? ` · U${a.uPosition}` : ""}
                          </TableCell>
                          <TableCell sx={{ fontSize: 12, color: "#475569" }}>{a.manufacturer ?? "—"}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{a.serialNumber ?? "—"}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{a.ipAddress ?? "—"}</TableCell>
                          <TableCell>
                            <Chip size="small" label={a.lifecycleState.toLowerCase()} sx={{ ...lifecycleSx(a.lifecycleState), fontSize: 9, height: 18 }} />
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: 12, color: "#475569", fontFamily: "monospace" }}>
                            {a.powerDrawW != null ? `${a.powerDrawW}W` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            ) : null}
          </Box>
        ) : null}

      </Box>
    </Box>
  )
}