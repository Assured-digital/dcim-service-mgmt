import React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Chip, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tooltip, Typography
} from "@mui/material"
import StorageIcon from "@mui/icons-material/Storage"
import AddIcon from "@mui/icons-material/Add"
import { chipSx } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
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

type Room = { id: string; name: string; type: string }
type Site = { id: string; name: string }

// ── Helpers ────────────────────────────────────────────────────────────────
const ASSET_TYPE_COLORS: Record<string, string> = {
  Server: "#dbeafe", Switch: "#fce7f3", Patch: "#f1f5f9",
  PDU: "#fef3c7", UPS: "#d1fae5", KVM: "#ede9fe", Firewall: "#fee2e2"
}
function assetTypeBg(type: string) { return ASSET_TYPE_COLORS[type] ?? "#f1f5f9" }

function lifecycleSx(state: string) {
  if (state === "ACTIVE") return { bgcolor: "#dcfce7", color: "#15803d" }
  if (state === "RETIRED") return { bgcolor: "#f1f5f9", color: "#64748b" }
  if (state === "STAGING") return { bgcolor: "#dbeafe", color: "#1d4ed8" }
  return { bgcolor: "#fef3c7", color: "#b45309" }
}

function barColor(pct: number) {
  return pct > 85 ? "#b91c1c" : pct > 65 ? "#b45309" : "#15803d"
}

// ── Rack elevation — narrow context view ───────────────────────────────────
function RackElevation({ cabinet }: { cabinet: Cabinet }) {
  const total = cabinet.totalU ?? 42
  const U_HEIGHT = 16

  const slotMap: Record<number, Asset | null> = {}
  for (let u = 1; u <= total; u++) slotMap[u] = null
  cabinet.assets.forEach(a => {
    if (a.uPosition != null) {
      for (let i = 0; i < (a.uHeight ?? 1); i++) slotMap[a.uPosition + i] = a
    }
  })

  const rendered = new Set<string>()
  const rows: React.ReactElement[] = []

  for (let u = total; u >= 1; u--) {
    const asset = slotMap[u]
    const isMajor = u % 5 === 0 || u === 1 || u === total
    const uLabel = (
      <Box sx={{
        width: 22, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "flex-end", pr: "4px", height: U_HEIGHT,
        fontSize: isMajor ? 8 : 7, fontFamily: "monospace",
        color: isMajor ? "#64748b" : "#cbd5e1", fontWeight: isMajor ? 600 : 400
      }}>
        {isMajor ? u : ""}
      </Box>
    )

    if (!asset) {
      rows.push(
        <Stack key={u} direction="row" alignItems="center">
          {uLabel}
          <Box sx={{ flex: 1, height: U_HEIGHT, borderBottom: "1px solid #eef0f3" }} />
        </Stack>
      )
      continue
    }

    if (rendered.has(asset.id)) continue
    rendered.add(asset.id)

    const h = asset.uHeight ?? 1
    rows.push(
      <Tooltip key={`${asset.id}-${u}`}
        title={`U${u} · ${asset.name} · ${asset.assetType}`}
        placement="right" arrow>
        <Stack direction="row" alignItems="flex-start">
          {uLabel}
          <Box sx={{
            flex: 1,
            height: U_HEIGHT * h + (h - 1),
            bgcolor: assetTypeBg(asset.assetType),
            border: "1px solid rgba(0,0,0,0.06)",
            borderRadius: "2px", mb: "1px",
            display: "flex", alignItems: "center", px: "4px",
            overflow: "hidden", cursor: "default"
          }}>
            <Box sx={{ width: 4, height: 4, borderRadius: "50%", bgcolor: asset.lifecycleState === "ACTIVE" ? "#15803d" : "#cbd5e1", flexShrink: 0, mr: "4px" }} />
            <Typography sx={{ fontSize: 7.5, fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {asset.name}
            </Typography>
          </Box>
        </Stack>
      </Tooltip>
    )
  }

  return (
    <Box>
      <Box sx={{ bgcolor: "#1e293b", borderRadius: "5px 5px 0 0", px: "8px", py: "6px" }}>
        <Typography sx={{ fontSize: 9, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Elevation
        </Typography>
      </Box>
      <Box sx={{ border: "2px solid #1e293b", borderTop: "none", borderRadius: "0 0 5px 5px", bgcolor: "#fafbfc", p: "4px 4px 4px 0" }}>
        {rows}
      </Box>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function RackDetailPage() {
  const { siteId, roomId, cabinetId } = useParams<{ siteId: string; roomId: string; cabinetId: string }>()
  const navigate = useNavigate()
  const { setBreadcrumbs } = useBreadcrumb()

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

  const { data: cabinets = [], isLoading } = useQuery({
    queryKey: ["site-cabinets", siteId],
    queryFn: async () => (await api.get<Cabinet[]>(`/sites/${siteId}/cabinets`)).data,
    enabled: !!siteId
  })

  const cabinet = cabinets.find(c => c.id === cabinetId)
  const room = rooms.find(r => r.id === roomId)

  React.useEffect(() => {
    if (site && room && cabinet) {
      setBreadcrumbs([
        { label: site.name, path: `/infrastructure/${siteId}` },
        { label: room.name, path: `/infrastructure/${siteId}/rooms/${roomId}` },
        { label: cabinet.name }
      ])
    }
  }, [site, room, cabinet]) // eslint-disable-line

  if (isLoading) return <LoadingState />
  if (!cabinet) return <ErrorState title="Rack not found" />

  const fill = cabinet.totalU ? Math.min(100, Math.round(((cabinet.usedU ?? 0) / cabinet.totalU) * 100)) : 0
  const powerPct = cabinet.powerKw ? Math.min(100, Math.round((cabinet.powerKw / 20) * 100)) : 0
  const assetsSorted = cabinet.assets.slice().sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0))
  const activeCount = cabinet.assets.filter(a => a.lifecycleState === "ACTIVE").length

  return (
    <Box sx={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 64px)",
      mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" },
      overflow: "hidden", bgcolor: "#f8fafc"
    }}>

      {/* ── Header — rack name + KPIs ─────────────────────────────────── */}
      <Box sx={{ bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0", px: "28px", py: "14px", flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box sx={{ width: 32, height: 32, borderRadius: "7px", bgcolor: "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <StorageIcon sx={{ fontSize: 15, color: "#1d4ed8" }} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#0f172a", lineHeight: 1.2 }}>{cabinet.name}</Typography>
              <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
                {cabinet.type}{cabinet.totalU ? ` · ${cabinet.totalU}U` : ""}
                {cabinet.notes ? ` · ${cabinet.notes}` : ""}
              </Typography>
            </Box>
          </Stack>

          {/* KPI tiles */}
          <Stack direction="row" spacing={2} sx={{ flexShrink: 0 }}>
            {[
              { label: "Total Assets", value: cabinet._count.assets, color: "#0f172a" },
              { label: "Active", value: activeCount, color: "#15803d" },
              ...(cabinet.totalU ? [{ label: "U Used", value: `${cabinet.usedU ?? 0}/${cabinet.totalU}`, color: barColor(fill) }] : []),
              ...(cabinet.powerKw ? [{ label: "Power", value: `${cabinet.powerKw} kW`, color: barColor(powerPct) }] : []),
            ].map((k, i) => (
              <Box key={i} sx={{ bgcolor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", px: "14px", py: "9px", textAlign: "center", minWidth: 80 }}>
                <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", mb: "3px" }}>{k.label}</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 600, color: k.color, lineHeight: 1 }}>{k.value}</Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </Box>

      {/* ── Body: elevation (left context) + asset list (main) ─────────── */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Elevation — narrow context column */}
        <Box sx={{ width: 200, minWidth: 200, bgcolor: "#ffffff", borderRight: "1px solid #e2e8f0", overflowY: "auto", flexShrink: 0, p: "16px" }}>
          {cabinet.totalU ? (
            <RackElevation cabinet={cabinet} />
          ) : (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>No U-space data</Typography>
            </Box>
          )}
        </Box>

        {/* Asset list — main content */}
        <Box sx={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          {/* Asset list header */}
          <Box sx={{ px: "24px", py: "14px", bgcolor: "#ffffff", borderBottom: "1px solid #f1f5f9" }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                Assets
                <Box component="span" sx={{ ml: 1, px: "6px", py: "1px", bgcolor: "#f1f5f9", borderRadius: "4px", fontSize: 11, fontWeight: 600, color: "#64748b" }}>
                  {cabinet.assets.length}
                </Box>
              </Typography>
              {canManage ? (
                <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                  sx={{ fontSize: 12, borderColor: "#e2e8f0", color: "#475569" }}>
                  Add asset
                </Button>
              ) : null}
            </Stack>
          </Box>

          {/* Asset table */}
          {cabinet.assets.length === 0 ? (
            <Box sx={{ py: 8, textAlign: "center" }}>
              <StorageIcon sx={{ fontSize: 36, color: "#e2e8f0", mb: 1.5 }} />
              <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No assets in this rack yet</Typography>
              {canManage ? (
                <Button size="small" variant="text" sx={{ mt: 1, color: "#1d4ed8", fontSize: 12 }}>Add first asset</Button>
              ) : null}
            </Box>
          ) : (
            <Box sx={{ bgcolor: "#ffffff", mx: "20px", my: "16px", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ "& th": { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc", py: "10px", borderBottom: "1px solid #e2e8f0" } }}>
                      <TableCell sx={{ width: 50 }}>U</TableCell>
                      <TableCell sx={{ width: 110 }}>Type</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell>Manufacturer · Model</TableCell>
                      <TableCell>Serial</TableCell>
                      <TableCell>IP</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Power</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {assetsSorted.map(a => (
                      <TableRow key={a.id} hover
                        sx={{ cursor: "pointer", "&:hover td": { bgcolor: "#f8fafc" } }}>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#475569" }}>
                          {a.uPosition != null ? `U${a.uPosition}` : "—"}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" alignItems="center" spacing={0.75}>
                            <Box sx={{ width: 16, height: 16, borderRadius: "4px", bgcolor: assetTypeBg(a.assetType), border: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }} />
                            <Typography sx={{ fontSize: 12, color: "#475569" }}>{a.assetType}</Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{a.name}</Typography>
                          <Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{a.assetTag}</Typography>
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, color: "#475569" }}>
                          {[a.manufacturer, a.modelNumber].filter(Boolean).join(" · ") || "—"}
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{a.serialNumber ?? "—"}</TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{a.ipAddress ?? "—"}</TableCell>
                        <TableCell>
                          <Chip size="small" label={a.lifecycleState.toLowerCase()}
                            sx={{ ...lifecycleSx(a.lifecycleState), fontSize: 10, height: 20 }} />
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>
                          {a.powerDrawW != null ? `${a.powerDrawW}W` : "—"}
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