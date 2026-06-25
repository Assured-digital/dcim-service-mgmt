import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Drawer, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tooltip, Typography
} from "@mui/material"
import StorageIcon from "@mui/icons-material/Storage"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { TaskQuickDetailModal } from "./modals/TaskQuickDetailModal"
import {
  Asset, Cabinet, Room, RackTab, ElevationSide,
  AuditEvent, LinkedTask, LinkedServiceRequest, LinkedRisk, LinkedIssue,
  assetBg, normalizeRackSide, formatKw, actionLabel, stripeBg
} from "../lib/infrastructure"
import { useAssignableUsers } from "../lib/useAssignableUsers"

// ─── Rack elevation (inlined, memoized) ──────────────────────────────────

const RACK_U_HEIGHT = 15

const AssetSlot = React.memo(function AssetSlot({
  asset, h, isSelected, onSelect
}: {
  asset: Asset; h: number; isSelected: boolean; onSelect: (id: string) => void
}) {
  return (
    <Tooltip title={`${asset.name} · ${asset.assetType}${asset.manufacturer ? ` · ${asset.manufacturer}` : ""}`} placement="right" arrow>
      <Box
        onClick={() => onSelect(asset.id)}
        sx={{
          height: RACK_U_HEIGHT * h + Math.max(0, h - 1), display: "flex", alignItems: "stretch",
          bgcolor: assetBg(asset.assetType),
          border: isSelected ? "2px solid #2563eb" : "1px solid rgba(0,0,0,0.08)",
          boxShadow: isSelected ? "0 0 0 1px #2563eb" : "none",
          borderRadius: "2px", mb: "1px", cursor: "pointer", overflow: "hidden"
        }}
      >
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", px: "7px", overflow: "hidden" }}>
          <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.name}
          </Typography>
          {h > 1 && asset.modelNumber ? (
            <Typography sx={{ fontSize: 9, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {asset.modelNumber}
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ width: 5, flexShrink: 0, bgcolor: stripeBg(asset.lifecycleState) }} />
      </Box>
    </Tooltip>
  )
})

const RackElevation = React.memo(function RackElevation({
  assets, totalU, selectedAssetId, onSelectAsset
}: {
  assets: Asset[]; totalU: number; selectedAssetId: string | null; onSelectAsset: (id: string) => void
}) {
  const { uNumbers, slots } = React.useMemo(() => {
    const slotMap: Record<number, Asset | null> = {}
    for (let u = 1; u <= totalU; u++) slotMap[u] = null
    assets.forEach(a => {
      if (a.uPosition != null) {
        for (let i = 0; i < (a.uHeight ?? 1); i++) slotMap[a.uPosition + i] = a
      }
    })
    const rendered = new Set<string>()
    const uNums: React.ReactElement[] = []
    const slotEls: React.ReactElement[] = []
    for (let u = totalU; u >= 1; u--) {
      uNums.push(
        <Box key={u} sx={{ height: RACK_U_HEIGHT, display: "flex", alignItems: "center", justifyContent: "flex-end", pr: "5px", fontSize: 9, fontFamily: "monospace", color: "#64748b", fontWeight: 600 }}>{u}</Box>
      )
      const asset = slotMap[u]
      if (!asset) { slotEls.push(<Box key={u} sx={{ height: RACK_U_HEIGHT, borderBottom: "1px solid rgba(203,213,225,0.4)" }} />); continue }
      if (rendered.has(asset.id)) continue
      rendered.add(asset.id)
      slotEls.push(<AssetSlot key={`${asset.id}-${u}`} asset={asset} h={asset.uHeight ?? 1} isSelected={selectedAssetId === asset.id} onSelect={onSelectAsset} />)
    }
    return { uNumbers: uNums, slots: slotEls }
  }, [assets, totalU, selectedAssetId, onSelectAsset])

  return (
    <Box sx={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <Box sx={{ width: 26, flexShrink: 0, pt: "8px" }}>{uNumbers}</Box>
      <Box sx={{ flex: 1, border: "2.5px solid #1e293b", borderRadius: "5px", bgcolor: "#f8fafc", p: "6px" }}>{slots}</Box>
    </Box>
  )
})

// ─── Cabinet detail view ─────────────────────────────────────────────────

interface CabinetDetailViewProps {
  cabinet: Cabinet
  room: Room | null
  selectedAssetId: string | null
  onSelectAsset: (id: string | null) => void
  canManage: boolean
}

const CabinetDetailView = React.memo(function CabinetDetailView({
  cabinet, room, selectedAssetId, onSelectAsset, canManage
}: CabinetDetailViewProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const [rackTab, setRackTab] = React.useState<RackTab>("dashboard")
  const [elevationSide, setElevationSide] = React.useState<ElevationSide>("FRONT")
  const [assetDrawerMode, setAssetDrawerMode] = React.useState<"lite" | "full">("lite")
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)

  // Reset tab when cabinet changes
  React.useEffect(() => { setRackTab("dashboard") }, [cabinet.id])

  // ── Derived values (memoized) ──────────────────────────────────────────

  const frontAssets = React.useMemo(() => cabinet.assets.filter(a => normalizeRackSide(a.rackSide) === "FRONT"), [cabinet.assets])
  const rearAssets = React.useMemo(() => cabinet.assets.filter(a => normalizeRackSide(a.rackSide) === "REAR"), [cabinet.assets])
  const unrackedAssets = React.useMemo(() => cabinet.assets.filter(a => a.uPosition == null), [cabinet.assets])

  const sortedAssets = React.useMemo(
    () => cabinet.assets.slice().sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0)),
    [cabinet.assets]
  )

  const selectedRackAsset = React.useMemo(
    () => cabinet.assets.find(a => a.id === selectedAssetId) ?? null,
    [cabinet.assets, selectedAssetId]
  )

  const powerStats = React.useMemo(() => {
    const totalPowerW = cabinet.assets.reduce((sum, a) => sum + (a.powerDrawW ?? 0), 0)
    const totalPowerKw = totalPowerW / 1000
    const capacityKw = cabinet.powerKw ?? null
    const utilizationPct = capacityKw && capacityKw > 0 ? Math.min(100, Math.round((totalPowerKw / capacityKw) * 100)) : null
    return { totalPowerKw, capacityKw, utilizationPct }
  }, [cabinet.assets, cabinet.powerKw])

  const lifecycleCounts = React.useMemo(() => {
    return cabinet.assets.reduce((acc, a) => {
      const key = a.lifecycleState as keyof typeof acc
      if (key in acc) acc[key] += 1
      return acc
    }, { ACTIVE: 0, RETIRED: 0, STAGING: 0, PLANNED: 0, PROCUREMENT: 0 })
  }, [cabinet.assets])

  // ── Queries (only fire when relevant tab is active) ────────────────────

  const { data: cabinetHistory = [] } = useQuery({
    queryKey: ["audit-cabinet", cabinet.id],
    queryFn: async () => (await api.get<AuditEvent[]>(`/audit-events/entity/Cabinet/${cabinet.id}`)).data,
    enabled: rackTab === "history"
  })

  const { data: linkedTasks = [] } = useQuery({
    queryKey: ["linked-tasks-cabinet", cabinet.id],
    queryFn: async () => (await api.get<LinkedTask[]>("/tasks", { params: { linkedEntityType: "Cabinet", linkedEntityId: cabinet.id } })).data,
    enabled: rackTab === "linked"
  })
  const { data: linkedServiceRequests = [] } = useQuery({
    queryKey: ["linked-service-requests-cabinet", cabinet.id],
    queryFn: async () => (await api.get<LinkedServiceRequest[]>("/service-requests", { params: { linkedEntityType: "Cabinet", linkedEntityId: cabinet.id } })).data,
    enabled: rackTab === "linked"
  })
  const { data: linkedRisks = [] } = useQuery({
    queryKey: ["linked-risks-cabinet", cabinet.id],
    queryFn: async () => (await api.get<LinkedRisk[]>("/risks", { params: { linkedEntityType: "Cabinet", linkedEntityId: cabinet.id } })).data,
    enabled: rackTab === "linked"
  })
  const { data: linkedIssues = [] } = useQuery({
    queryKey: ["linked-issues-cabinet", cabinet.id],
    queryFn: async () => (await api.get<LinkedIssue[]>("/issues", { params: { linkedEntityType: "Cabinet", linkedEntityId: cabinet.id } })).data,
    enabled: rackTab === "linked"
  })
  // Assignee picker source (feeds the linked-task quick-detail modal) —
  // operational-callable & client-scoped, replacing admin-only GET /users.
  const { data: users = [] } = useAssignableUsers()

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSelectElevationAsset = React.useCallback((id: string) => {
    onSelectAsset(id); setAssetDrawerMode("lite")
  }, [onSelectAsset])

  const handleOpenFullDetails = React.useCallback(() => {
    if (selectedRackAsset?.siteId) {
      const viewParam = searchParams.get("view")
      const suffix = viewParam ? `?view=${viewParam}` : ""
      navigate(`/asset-hierarchy/${selectedRackAsset.siteId}/assets/${selectedRackAsset.id}${suffix}`)
    }
  }, [navigate, searchParams, selectedRackAsset])

  async function patchLinkedTask(taskId: string, patch: Record<string, any>) {
    await api.put(`/tasks/${taskId}`, patch)
    qc.invalidateQueries({ queryKey: ["linked-tasks-cabinet", cabinet.id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }
  async function updateLinkedTaskStatus(taskId: string, status: string) {
    await api.post(`/tasks/${taskId}/status`, { status })
    qc.invalidateQueries({ queryKey: ["linked-tasks-cabinet", cabinet.id] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* Tab bar */}
      <Box sx={{ bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0", px: "24px", flexShrink: 0 }}>
        <Stack direction="row" spacing={0}>
          {[
            { key: "dashboard", label: "Dashboard" },
            { key: "elevation", label: "Elevation" },
            { key: "assets", label: "Assets", count: cabinet.assets.length },
            { key: "history", label: "History" },
            { key: "linked", label: "Linked records" },
          ].map(t => (
            <Box key={t.key} onClick={() => setRackTab(t.key as RackTab)}
              sx={{ px: "14px", py: "10px", cursor: "pointer", fontSize: 12.5, fontWeight: 500, color: rackTab === t.key ? "primary.main" : "#64748b", borderBottom: "2px solid", borderBottomColor: rackTab === t.key ? "primary.main" : "transparent", display: "flex", alignItems: "center", gap: "6px", mb: "-1px" }}>
              {t.label}
              {t.count != null ? <Box sx={{ px: "6px", py: "1px", borderRadius: "4px", fontSize: 10, fontWeight: 600, bgcolor: rackTab === t.key ? "#dbeafe" : "#f1f5f9", color: rackTab === t.key ? "primary.main" : "#64748b" }}>{t.count}</Box> : null}
            </Box>
          ))}
        </Stack>
      </Box>

      {/* ── Dashboard ─────────────────────────────────────────────────── */}
      {rackTab === "dashboard" ? (
        <Box sx={{ flex: 1, overflowY: "auto", p: "20px 24px" }}>
          <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0,1fr))", xl: "repeat(5, minmax(0,1fr))" }, mb: "14px" }}>
            {[
              { label: "Total asset draw", value: `${formatKw(powerStats.totalPowerKw)} kW` },
              { label: "Cabinet capacity", value: powerStats.capacityKw != null ? `${formatKw(powerStats.capacityKw)} kW` : "—" },
              { label: "Utilization", value: powerStats.utilizationPct != null ? `${powerStats.utilizationPct}%` : "—" },
              { label: "Active assets", value: `${lifecycleCounts.ACTIVE}` },
              { label: "Retired (decom)", value: `${lifecycleCounts.RETIRED}` },
            ].map(card => (
              <Box key={card.label} sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", p: "14px 16px" }}>
                <Typography sx={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", mb: "6px" }}>{card.label}</Typography>
                <Typography sx={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{card.value}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            {[
              { label: "Cabinet type", value: cabinet.type || "—" },
              { label: "Total U", value: cabinet.totalU != null ? `${cabinet.totalU}U` : "—" },
              { label: "Used U", value: cabinet.totalU != null ? `${cabinet.usedU ?? 0}U` : "—" },
              { label: "Front assets", value: `${frontAssets.length}` },
              { label: "Rear assets", value: `${rearAssets.length}` },
              { label: "Unpositioned assets", value: `${unrackedAssets.length}` },
            ].map((row, idx, arr) => (
              <Box key={row.label} sx={{ px: "16px", py: "10px", display: "flex", alignItems: "center", borderBottom: idx < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <Typography sx={{ fontSize: 12, color: "#64748b", width: 150 }}>{row.label}</Typography>
                <Typography sx={{ fontSize: 12.5, color: "#0f172a", fontWeight: 600 }}>{row.value}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}

      {/* ── Elevation ─────────────────────────────────────────────────── */}
      {rackTab === "elevation" ? (
        <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <Box sx={{ width: 720, maxWidth: "56vw", flexShrink: 0, overflowY: "auto", p: "24px 16px 24px 24px", bgcolor: "#f8fafc" }}>
            <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
              <Button size="small" onClick={() => setElevationSide("FRONT")} sx={{ fontSize: 12, textTransform: "none", bgcolor: elevationSide === "FRONT" ? "rgba(29,78,216,0.1)" : "transparent" }}>Front view ({frontAssets.length})</Button>
              <Button size="small" onClick={() => setElevationSide("REAR")} sx={{ fontSize: 12, textTransform: "none", bgcolor: elevationSide === "REAR" ? "rgba(29,78,216,0.1)" : "transparent" }}>Rear view ({rearAssets.length})</Button>
            </Stack>
            {cabinet.totalU ? (
              <Box sx={{ maxWidth: 560 }}>
                <RackElevation
                  assets={elevationSide === "FRONT" ? frontAssets : rearAssets}
                  totalU={cabinet.totalU ?? 42}
                  selectedAssetId={selectedAssetId}
                  onSelectAsset={handleSelectElevationAsset}
                />
              </Box>
            ) : (
              <Box sx={{ py: 6, textAlign: "center" }}><Typography sx={{ fontSize: 12, color: "#94a3b8" }}>No U-space data for this cabinet</Typography></Box>
            )}
          </Box>
          <Drawer anchor="right" open={!!selectedRackAsset} onClose={() => onSelectAsset(null)} PaperProps={{ sx: { width: 420, borderLeft: "1px solid #e2e8f0", p: 2, bgcolor: "#f8fafc" } }}>
            {selectedRackAsset ? (
              <Stack spacing={2}>
                <Box sx={{ bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                  <Box sx={{ p: "16px 20px 14px", borderBottom: "1px solid #f1f5f9" }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: "8px" }}>
                      <Box sx={{ px: "8px", py: "3px", borderRadius: "4px", bgcolor: assetBg(selectedRackAsset.assetType) }}><Typography sx={{ fontSize: 10.5, fontWeight: 600, color: "#334155" }}>{selectedRackAsset.assetType}</Typography></Box>
                      <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8" }}>{selectedRackAsset.assetTag}</Typography>
                      <Box sx={{ ml: "auto", display: "inline-flex" }}>
                        <StatusPill intent={entityStatusIntent(selectedRackAsset.lifecycleState)} label={selectedRackAsset.lifecycleState.toLowerCase()} size="sm" />
                      </Box>
                    </Stack>
                    <Typography sx={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>{selectedRackAsset.name}</Typography>
                  </Box>
                  <Box sx={{ px: "20px", py: "10px", bgcolor: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                    <Typography sx={{ fontSize: 11, color: "#475569" }}>{room ? `${room.name} ▸ ` : ""}{cabinet.name} ▸ {selectedRackAsset.uPosition != null ? `U${selectedRackAsset.uPosition}` : "Unpositioned"} {normalizeRackSide(selectedRackAsset.rackSide).toLowerCase()}</Typography>
                  </Box>
                  <Box sx={{ p: "14px 20px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                    {[["Manufacturer", selectedRackAsset.manufacturer ?? "—"], ["Model", selectedRackAsset.modelNumber ?? "—"], ["Serial", selectedRackAsset.serialNumber ?? "—"], ["IP", selectedRackAsset.ipAddress ?? "—"], ["U Height", selectedRackAsset.uHeight != null ? `${selectedRackAsset.uHeight}U` : "—"], ["Power", selectedRackAsset.powerDrawW != null ? `${selectedRackAsset.powerDrawW}W` : "—"]].map(([label, value]) => (
                      <Box key={label}><Typography sx={{ fontSize: 10.5, color: "#94a3b8" }}>{label}</Typography><Typography sx={{ fontSize: 12, color: "#0f172a", fontWeight: 500 }}>{value}</Typography></Box>
                    ))}
                  </Box>
                </Box>
                {assetDrawerMode === "lite" ? <Button size="small" variant="outlined" onClick={handleOpenFullDetails} sx={{ alignSelf: "flex-start", textTransform: "none" }}>Open full details</Button> : null}
              </Stack>
            ) : null}
          </Drawer>
        </Box>
      ) : null}

      {/* ── Assets table ──────────────────────────────────────────────── */}
      {rackTab === "assets" ? (
        <Box sx={{ flex: 1, overflowY: "auto", p: "16px 20px" }}>
          {cabinet.assets.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: "10px" }}>
              <StorageIcon sx={{ fontSize: 32, color: "#e2e8f0", mb: 1 }} />
              <Typography sx={{ fontSize: 13, color: "#94a3b8" }}>No assets in this cabinet</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ bgcolor: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", bgcolor: "#f8fafc" } }}>
                    <TableCell>U</TableCell><TableCell>Asset</TableCell><TableCell align="right">Power</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedAssets.map(a => (
                    <TableRow key={a.id} hover onClick={() => onSelectAsset(a.id)} sx={{ cursor: "pointer" }}>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#64748b" }}>{a.uPosition != null ? `U${a.uPosition}` : "—"}</TableCell>
                      <TableCell><Typography sx={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{a.name}</Typography><Typography sx={{ fontSize: 10, color: "#94a3b8" }}>{a.assetType} · {a.assetTag}</Typography></TableCell>
                      <TableCell align="right" sx={{ fontFamily: "monospace", fontSize: 11, color: "#64748b" }}>{a.powerDrawW != null ? `${a.powerDrawW}W` : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      ) : null}

      {/* ── History ───────────────────────────────────────────────────── */}
      {rackTab === "history" ? (
        <Box sx={{ flex: 1, overflowY: "auto", p: "16px 20px" }}>
          <Box sx={{ maxWidth: 880, bgcolor: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            {cabinetHistory.length === 0 ? (
              <Box sx={{ py: 5, textAlign: "center" }}><Typography sx={{ fontSize: 12, color: "#94a3b8" }}>No cabinet history available yet</Typography></Box>
            ) : cabinetHistory.map((event, idx) => (
              <Box key={event.id} sx={{ px: 2, py: 1.5, borderBottom: idx < cabinetHistory.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                <Typography sx={{ fontSize: 12, color: "#0f172a", fontWeight: 500 }}>{actionLabel(event.action, event.data)}</Typography>
                <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{new Date(event.createdAt).toLocaleString()}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}

      {/* ── Linked records ────────────────────────────────────────────── */}
      {rackTab === "linked" ? (
        <Box sx={{ flex: 1, overflowY: "auto", p: "16px 20px" }}>
          <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" } }}>
            {[
              { title: "Service requests", items: linkedServiceRequests, onClick: (id: string) => navigate(`/service-requests/${id}`), subtitle: (item: any) => item.subject },
              { title: "Risks", items: linkedRisks, onClick: (id: string) => navigate(`/risks/${id}`), subtitle: (item: any) => `${item.likelihood} / ${item.impact}` },
              { title: "Issues", items: linkedIssues, onClick: (id: string) => navigate(`/issues/${id}`), subtitle: (item: any) => item.severity },
              { title: "Tasks", items: linkedTasks, onClick: (id: string) => setQuickTaskId(id), subtitle: (item: any) => item.title },
            ].map(section => (
              <Box key={section.title} sx={{ bgcolor: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid #f1f5f9", bgcolor: "#f8fafc" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em" }}>{section.title} ({section.items.length})</Typography>
                </Box>
                {section.items.length === 0 ? (
                  <Box sx={{ p: 2 }}><Typography sx={{ fontSize: 12, color: "#94a3b8" }}>No linked {section.title.toLowerCase()}</Typography></Box>
                ) : section.items.map((item: any, idx: number) => (
                  <Stack key={item.id} direction="row" alignItems="center" onClick={() => section.onClick(item.id)} sx={{ p: 1.5, cursor: "pointer", borderBottom: idx < section.items.length - 1 ? "1px solid #f1f5f9" : "none", "&:hover": { bgcolor: "#f8fafc" } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{item.reference}</Typography>
                      <Typography sx={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.subtitle(item)}</Typography>
                    </Box>
                    <StatusPill value={item.status} label={String(item.status).toLowerCase().replaceAll("_", " ")} size="sm" />
                  </Stack>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}

      <TaskQuickDetailModal open={Boolean(quickTaskId)} taskId={quickTaskId} users={users} canManage={canManage}
        onClose={() => setQuickTaskId(null)} onOpenFull={(taskId) => navigate(`/service-desk/task/${taskId}`)}
        onPatchTask={patchLinkedTask} onUpdateStatus={updateLinkedTaskStatus}
      />
    </Box>
  )
})

export default CabinetDetailView