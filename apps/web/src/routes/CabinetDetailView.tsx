import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Drawer, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography
} from "@mui/material"
import StorageIcon from "@mui/icons-material/Storage"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { TaskQuickDetailModal } from "./modals/TaskQuickDetailModal"
import { useNotification } from "../components/NotificationProvider"
import {
  Cabinet, CabinetReservation, Room, RackTab, ElevationSide,
  AuditEvent, LinkedTask, LinkedServiceRequest, LinkedRisk, LinkedIssue,
  assetBg, barColor, normalizeRackSide, formatKw, actionLabel, getApiErrorMessage
} from "../lib/infrastructure"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { getSiteCapacity, kw } from "../lib/capacity"
import { useThemeMode } from "../lib/theme"
import CabinetElevationV2 from "../components/elevation/CabinetElevationV2"
import { ReservationDialog } from "../components/elevation/ReservationDialog"

// ─── Cabinet detail view ─────────────────────────────────────────────────
// (The elevation itself lives in components/elevation/ — CabinetElevationV2.)

interface CabinetDetailViewProps {
  cabinet: Cabinet
  room: Room | null
  selectedAssetId: string | null
  onSelectAsset: (id: string | null) => void
  canManage: boolean
  // A3: click-empty-U-to-add — parent opens AddAssetDialog prefilled (spec §2.1).
  onAddAssetAt?: (u: number, side: ElevationSide) => void
}

const CabinetDetailView = React.memo(function CabinetDetailView({
  cabinet, room, selectedAssetId, onSelectAsset, canManage, onAddAssetAt
}: CabinetDetailViewProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()
  const { mode } = useThemeMode()
  const { notify } = useNotification()
  const [rackTab, setRackTab] = React.useState<RackTab>("dashboard")
  // "BOTH" renders front + rear side by side (the wide-pane default, spec §2.1).
  const [elevationSide, setElevationSide] = React.useState<ElevationSide | "BOTH">("BOTH")
  const [assetDrawerMode, setAssetDrawerMode] = React.useState<"lite" | "full">("lite")
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)
  // A3 interactions: click-to-move + reservation create/edit (spec §2.1).
  const [moveAssetId, setMoveAssetId] = React.useState<string | null>(null)
  const [reservationDialog, setReservationDialog] = React.useState<"new" | CabinetReservation | null>(null)

  const refreshCabinet = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["site-cabinets", cabinet.siteId] })
    qc.invalidateQueries({ queryKey: ["site-capacity", cabinet.siteId] })
    qc.invalidateQueries({ queryKey: ["assets"] })
  }, [qc, cabinet.siteId])

  // Decommission workflow (DCIM_SCHEMA_SPEC §4.2): retire frees capacity but
  // keeps the block drawn greyed; remove clears the position; dispose closes out.
  const [decommissioning, setDecommissioning] = React.useState(false)
  async function decommission(assetId: string, step: "RETIRE" | "REMOVE" | "DISPOSE") {
    setDecommissioning(true)
    try {
      await api.post(`/assets/${assetId}/decommission`, { step })
      notify.success(step === "RETIRE" ? "Asset retired — capacity freed" : step === "REMOVE" ? "Marked physically removed" : "Marked disposed")
      refreshCabinet()
      if (step === "REMOVE") onSelectAsset(null)
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Decommission step failed"))
    } finally { setDecommissioning(false) }
  }

  // Reset tab when cabinet changes
  React.useEffect(() => { setRackTab("dashboard") }, [cabinet.id])

  // ── Derived values (memoized) ──────────────────────────────────────────

  const frontAssets = React.useMemo(() => cabinet.assets.filter(a => normalizeRackSide(a.rackSide) === "FRONT"), [cabinet.assets])
  const rearAssets = React.useMemo(() => cabinet.assets.filter(a => normalizeRackSide(a.rackSide) === "REAR"), [cabinet.assets])
  const unrackedAssets = React.useMemo(() => cabinet.assets.filter(a => a.uPosition == null && !a.isZeroU), [cabinet.assets])

  const sortedAssets = React.useMemo(
    () => cabinet.assets.slice().sort((a, b) => (b.uPosition ?? 0) - (a.uPosition ?? 0)),
    [cabinet.assets]
  )

  const selectedRackAsset = React.useMemo(
    () => cabinet.assets.find(a => a.id === selectedAssetId) ?? null,
    [cabinet.assets, selectedAssetId]
  )

  // Nameplate sum stays as a secondary figure; the primary capacity numbers come
  // from the server engine (budgeted power, weight, contiguous free) via the site
  // capacity endpoint — single source of truth (spec §4.4).
  const nameplateKw = React.useMemo(
    () => cabinet.assets.reduce((sum, a) => sum + (a.powerDrawW ?? 0), 0) / 1000,
    [cabinet.assets]
  )

  const lifecycleCounts = React.useMemo(() => {
    return cabinet.assets.reduce((acc, a) => {
      const key = a.lifecycleState as keyof typeof acc
      if (key in acc) acc[key] += 1
      return acc
    }, { ACTIVE: 0, RETIRED: 0, STAGING: 0, PLANNED: 0, PROCUREMENT: 0 })
  }, [cabinet.assets])

  // ── Queries (only fire when relevant tab is active) ────────────────────

  const { data: siteCapacity } = useQuery({
    queryKey: ["site-capacity", cabinet.siteId],
    queryFn: () => getSiteCapacity(cabinet.siteId),
    enabled: rackTab === "dashboard",
  })
  const cabCap = siteCapacity?.cabinets.find(c => c.cabinetId === cabinet.id) ?? null

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
      <Box sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", px: "24px", flexShrink: 0 }}>
        <Stack direction="row" spacing={0}>
          {[
            { key: "dashboard", label: "Dashboard" },
            { key: "elevation", label: "Elevation" },
            { key: "assets", label: "Assets", count: cabinet.assets.length },
            { key: "history", label: "History" },
            { key: "linked", label: "Linked records" },
          ].map(t => (
            <Box key={t.key} onClick={() => setRackTab(t.key as RackTab)}
              sx={{ px: "14px", py: "10px", cursor: "pointer", fontSize: 12.5, fontWeight: 500, color: rackTab === t.key ? "primary.main" : "text.secondary", borderBottom: "2px solid", borderBottomColor: rackTab === t.key ? "primary.main" : "transparent", display: "flex", alignItems: "center", gap: "6px", mb: "-1px" }}>
              {t.label}
              {t.count != null ? <Box sx={{ px: "6px", py: "1px", borderRadius: "4px", fontSize: 10, fontWeight: 600, bgcolor: rackTab === t.key ? (mode === "dark" ? "#16294a" : "#dbeafe") : (mode === "dark" ? "#1e293b" : "#f1f5f9"), color: rackTab === t.key ? "primary.main" : "text.secondary" }}>{t.count}</Box> : null}
            </Box>
          ))}
        </Stack>
      </Box>

      {/* ── Dashboard ─────────────────────────────────────────────────── */}
      {rackTab === "dashboard" ? (
        <Box sx={{ flex: 1, overflowY: "auto", p: "20px 24px" }}>
          <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0,1fr))", xl: "repeat(5, minmax(0,1fr))" }, mb: "14px" }}>
            {[
              {
                label: "Budgeted power",
                value: cabCap ? kw(cabCap.power.value) : `${formatKw(nameplateKw * 0.6)} kW`,
                detail: cabCap?.power.capacity != null ? `of ${kw(cabCap.power.capacity)} · ${cabCap.power.pct}%` : `nameplate ${formatKw(nameplateKw)} kW`,
                pct: cabCap?.power.capacity != null ? cabCap.power.pct : undefined,
              },
              {
                label: "Space used",
                value: cabCap ? `${cabCap.space.pct}%` : (cabinet.totalU ? `${Math.round(((cabinet.usedU ?? 0) / cabinet.totalU) * 100)}%` : "—"),
                detail: cabCap ? `${cabCap.space.usedU} / ${cabCap.totalU} U` : undefined,
                pct: cabCap?.space.pct,
              },
              {
                label: "Largest free block",
                value: cabCap ? `${cabCap.space.largestContiguousU}U` : "—",
                detail: "contiguous",
              },
              {
                label: "Weight",
                value: cabCap && cabCap.weight.value > 0 ? `${Math.round(cabCap.weight.value)} kg` : (cabCap ? "—" : "—"),
                detail: cabCap?.weight.capacity != null ? `of ${Math.round(cabCap.weight.capacity)} kg · ${cabCap.weight.pct}%` : "no limit set",
                pct: cabCap?.weight.capacity != null ? cabCap.weight.pct : undefined,
              },
              {
                label: "Active assets",
                value: `${lifecycleCounts.ACTIVE}`,
                detail: `${lifecycleCounts.RETIRED} retired · ${cabCap?.activeReservations ?? 0} reserved`,
              },
            ].map(card => (
              <Box key={card.label} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "14px 16px", display: "flex", flexDirection: "column" }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: "text.tertiary", textTransform: "uppercase", letterSpacing: "0.08em", mb: "8px" }}>{card.label}</Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 750, lineHeight: 1.05, letterSpacing: "-0.5px", fontVariantNumeric: "tabular-nums" }}>{card.value}</Typography>
                {card.detail ? <Typography sx={{ fontSize: 11, color: "text.secondary", mt: "4px", fontVariantNumeric: "tabular-nums" }}>{card.detail}</Typography> : null}
                {card.pct != null ? (
                  <Box sx={{ mt: "auto", pt: "10px" }}>
                    <Box sx={{ height: 6, borderRadius: "4px", bgcolor: mode === "dark" ? "rgba(148,163,184,.16)" : "rgba(100,116,139,.14)", overflow: "hidden" }}>
                      <Box sx={{ height: "100%", width: `${Math.min(100, card.pct)}%`, borderRadius: "4px", bgcolor: barColor(card.pct, mode) }} />
                    </Box>
                  </Box>
                ) : null}
              </Box>
            ))}
          </Box>
          <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
            {[
              { label: "Cabinet type", value: cabinet.type || "—" },
              { label: "Total U", value: cabinet.totalU != null ? `${cabinet.totalU}U` : "—" },
              { label: "Used U", value: cabCap ? `${cabCap.space.usedU}U` : (cabinet.totalU != null ? `${cabinet.usedU ?? 0}U` : "—") },
              { label: "Front assets", value: `${frontAssets.length}` },
              { label: "Rear assets", value: `${rearAssets.length}` },
              { label: "Unpositioned assets", value: `${unrackedAssets.length}` },
            ].map((row, idx, arr) => (
              <Box key={row.label} sx={{ px: "16px", py: "10px", display: "flex", alignItems: "center", borderBottom: idx < arr.length - 1 ? "1px solid" : "none", borderColor: "divider" }}>
                <Typography sx={{ fontSize: 12, color: "text.secondary", width: 150 }}>{row.label}</Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{row.value}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}

      {/* ── Elevation ─────────────────────────────────────────────────── */}
      {rackTab === "elevation" ? (
        <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <Box sx={{ width: 720, maxWidth: "56vw", flexShrink: 0, overflowY: "auto", p: "24px 16px 24px 24px", bgcolor: "background.default" }}>
            <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center" }}>
              <Button size="small" onClick={() => setElevationSide("BOTH")} sx={{ fontSize: 12, textTransform: "none", bgcolor: elevationSide === "BOTH" ? "rgba(29,78,216,0.1)" : "transparent" }}>Side by side</Button>
              <Button size="small" onClick={() => setElevationSide("FRONT")} sx={{ fontSize: 12, textTransform: "none", bgcolor: elevationSide === "FRONT" ? "rgba(29,78,216,0.1)" : "transparent" }}>Front ({frontAssets.length})</Button>
              <Button size="small" onClick={() => setElevationSide("REAR")} sx={{ fontSize: 12, textTransform: "none", bgcolor: elevationSide === "REAR" ? "rgba(29,78,216,0.1)" : "transparent" }}>Rear ({rearAssets.length})</Button>
              {canManage ? (
                <Button size="small" onClick={() => setReservationDialog("new")} sx={{ ml: "auto !important", fontSize: 12, textTransform: "none" }}>
                  Reserve space
                </Button>
              ) : null}
            </Stack>
            {cabinet.totalU ? (
              <Box sx={{ maxWidth: elevationSide === "BOTH" ? 680 : 560 }}>
                <CabinetElevationV2
                  cabinet={cabinet}
                  sides={elevationSide}
                  selectedAssetId={selectedAssetId}
                  onSelectAsset={handleSelectElevationAsset}
                  canManage={canManage}
                  moveAssetId={moveAssetId}
                  onEndMove={() => setMoveAssetId(null)}
                  onAddAssetAt={onAddAssetAt}
                  onEditReservation={(r) => setReservationDialog(r ?? "new")}
                  onDataChanged={refreshCabinet}
                />
              </Box>
            ) : (
              <Box sx={{ py: 6, textAlign: "center" }}><Typography sx={{ fontSize: 12, color: "text.tertiary" }}>No U-space data for this cabinet</Typography></Box>
            )}
          </Box>
          <Drawer anchor="right" open={!!selectedRackAsset} onClose={() => onSelectAsset(null)} PaperProps={{ sx: { width: 420, borderLeft: "1px solid", borderColor: "divider", p: 2, bgcolor: "background.default" } }}>
            {selectedRackAsset ? (
              <Stack spacing={2}>
                <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
                  <Box sx={{ p: "16px 20px 14px", borderBottom: "1px solid", borderColor: "divider" }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: "8px" }}>
                      <Box sx={{ px: "8px", py: "3px", borderRadius: "4px", bgcolor: assetBg(selectedRackAsset.assetType, mode) }}><Typography sx={{ fontSize: 10.5, fontWeight: 600, color: mode === "dark" ? "#cbd5e1" : "#334155" }}>{selectedRackAsset.assetType}</Typography></Box>
                      <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: "text.tertiary" }}>{selectedRackAsset.assetTag}</Typography>
                      <Box sx={{ ml: "auto", display: "inline-flex" }}>
                        <StatusPill intent={entityStatusIntent(selectedRackAsset.lifecycleState)} label={selectedRackAsset.lifecycleState.toLowerCase()} size="sm" />
                      </Box>
                    </Stack>
                    <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{selectedRackAsset.name}</Typography>
                  </Box>
                  <Box sx={{ px: "20px", py: "10px", bgcolor: "background.default", borderBottom: "1px solid", borderColor: "divider" }}>
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{room ? `${room.name} ▸ ` : ""}{cabinet.name} ▸ {selectedRackAsset.uPosition != null ? `U${selectedRackAsset.uPosition}` : "Unpositioned"} {normalizeRackSide(selectedRackAsset.rackSide).toLowerCase()}</Typography>
                  </Box>
                  <Box sx={{ p: "14px 20px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 14px" }}>
                    {[["Manufacturer", selectedRackAsset.manufacturer ?? "—"], ["Model", selectedRackAsset.modelNumber ?? "—"], ["Serial", selectedRackAsset.serialNumber ?? "—"], ["IP", selectedRackAsset.ipAddress ?? "—"], ["U Height", selectedRackAsset.uHeight != null ? `${selectedRackAsset.uHeight}U` : "—"], ["Power", selectedRackAsset.powerDrawW != null ? `${selectedRackAsset.powerDrawW}W` : "—"]].map(([label, value]) => (
                      <Box key={label}><Typography sx={{ fontSize: 10.5, color: "text.tertiary" }}>{label}</Typography><Typography sx={{ fontSize: 12, fontWeight: 500 }}>{value}</Typography></Box>
                    ))}
                  </Box>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {assetDrawerMode === "lite" ? <Button size="small" variant="outlined" onClick={handleOpenFullDetails} sx={{ textTransform: "none" }}>Open full details</Button> : null}
                  {canManage && !selectedRackAsset.isZeroU && selectedRackAsset.lifecycleState !== "RETIRED" ? (
                    <Button size="small" variant="outlined" sx={{ textTransform: "none" }}
                      onClick={() => { setMoveAssetId(selectedRackAsset.id); onSelectAsset(null) }}>
                      Move in cabinet
                    </Button>
                  ) : null}
                  {/* Decommission steps (spec §4.2) — contextual on the asset's state */}
                  {canManage && selectedRackAsset.lifecycleState !== "RETIRED" ? (
                    <Button size="small" variant="outlined" color="warning" disabled={decommissioning} sx={{ textTransform: "none" }}
                      onClick={() => decommission(selectedRackAsset.id, "RETIRE")}>
                      Retire
                    </Button>
                  ) : null}
                  {canManage && selectedRackAsset.lifecycleState === "RETIRED" && !selectedRackAsset.physicallyRemoved ? (
                    <Button size="small" variant="outlined" color="warning" disabled={decommissioning} sx={{ textTransform: "none" }}
                      onClick={() => decommission(selectedRackAsset.id, "REMOVE")}>
                      Mark removed from cabinet
                    </Button>
                  ) : null}
                  {canManage && selectedRackAsset.lifecycleState === "RETIRED" && selectedRackAsset.disposalStatus !== "DISPOSED" ? (
                    <Button size="small" variant="outlined" color="error" disabled={decommissioning} sx={{ textTransform: "none" }}
                      onClick={() => decommission(selectedRackAsset.id, "DISPOSE")}>
                      Mark disposed
                    </Button>
                  ) : null}
                </Stack>
                {selectedRackAsset.lifecycleState === "RETIRED" ? (
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                    Retired — capacity freed{selectedRackAsset.physicallyRemoved ? ", removed from cabinet" : ", still racked (greyed in the elevation)"}{selectedRackAsset.disposalStatus === "DISPOSED" ? ", disposed" : selectedRackAsset.disposalStatus === "MARKED_FOR_DISPOSAL" ? ", awaiting disposal" : ""}.
                  </Typography>
                ) : null}
              </Stack>
            ) : null}
          </Drawer>
          {reservationDialog ? (
            <ReservationDialog
              siteId={cabinet.siteId}
              cabinetId={cabinet.id}
              totalU={cabinet.totalU ?? 42}
              startingUnit={cabinet.startingUnit ?? 1}
              existing={reservationDialog === "new" ? null : reservationDialog}
              onClose={() => setReservationDialog(null)}
              onChanged={refreshCabinet}
            />
          ) : null}
        </Box>
      ) : null}

      {/* ── Assets table ──────────────────────────────────────────────── */}
      {rackTab === "assets" ? (
        <Box sx={{ flex: 1, overflowY: "auto", p: "16px 20px" }}>
          {cabinet.assets.length === 0 ? (
            <Box sx={{ py: 6, textAlign: "center", border: "1.5px dashed", borderColor: "divider", borderRadius: "10px" }}>
              <StorageIcon sx={{ fontSize: 32, color: "text.tertiary", mb: 1 }} />
              <Typography sx={{ fontSize: 13, color: "text.tertiary" }}>No assets in this cabinet</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px" }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.tertiary", bgcolor: "background.default" } }}>
                    <TableCell>U</TableCell><TableCell>Asset</TableCell><TableCell align="right">Power</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedAssets.map(a => (
                    <TableRow key={a.id} hover onClick={() => onSelectAsset(a.id)} sx={{ cursor: "pointer" }}>
                      <TableCell sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "text.secondary" }}>{a.uPosition != null ? `U${a.uPosition}` : "—"}</TableCell>
                      <TableCell><Typography sx={{ fontSize: 12, fontWeight: 600 }}>{a.name}</Typography><Typography sx={{ fontSize: 10, color: "text.tertiary" }}>{a.assetType} · {a.assetTag}</Typography></TableCell>
                      <TableCell align="right" sx={{ fontFamily: "monospace", fontSize: 11, color: "text.secondary" }}>{a.powerDrawW != null ? `${a.powerDrawW}W` : "—"}</TableCell>
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
          <Box sx={{ maxWidth: 880, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
            {cabinetHistory.length === 0 ? (
              <Box sx={{ py: 5, textAlign: "center" }}><Typography sx={{ fontSize: 12, color: "text.tertiary" }}>No cabinet history available yet</Typography></Box>
            ) : cabinetHistory.map((event, idx) => (
              <Box key={event.id} sx={{ px: 2, py: 1.5, borderBottom: idx < cabinetHistory.length - 1 ? "1px solid" : "none", borderColor: "divider" }}>
                <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{actionLabel(event.action, event.data)}</Typography>
                <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>{new Date(event.createdAt).toLocaleString()}</Typography>
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
              <Box key={section.title} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
                <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.default" }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>{section.title} ({section.items.length})</Typography>
                </Box>
                {section.items.length === 0 ? (
                  <Box sx={{ p: 2 }}><Typography sx={{ fontSize: 12, color: "text.tertiary" }}>No linked {section.title.toLowerCase()}</Typography></Box>
                ) : section.items.map((item: any, idx: number) => (
                  <Stack key={item.id} direction="row" alignItems="center" onClick={() => section.onClick(item.id)} sx={{ p: 1.5, cursor: "pointer", borderBottom: idx < section.items.length - 1 ? "1px solid" : "none", borderColor: "divider", "&:hover": { bgcolor: "action.hover" } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{item.reference}</Typography>
                      <Typography sx={{ fontSize: 11, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.subtitle(item)}</Typography>
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