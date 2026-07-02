import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Chip, MenuItem,
  Stack, TextField, Typography
} from "@mui/material"
import type { SxProps, Theme } from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { api } from "../lib/api"
import { EditActionsButton } from "../components/EditActionsButton"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { useBreadcrumb } from "./Shell"
import { useThemeMode } from "../lib/theme"
import {
  Asset, AuditEvent, Cabinet, LinkedIssue, LinkedRisk, LinkedServiceRequest, LinkedTask,
  ASSET_LIFECYCLE_OPTIONS, HEADER_HEIGHT, getApiErrorMessage
} from "../lib/infrastructure"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import {
  ChangeAssetStatusDialog, DeleteConfirmDialog, LogMaintenanceDialog, MoveAssetDialog, RequestDeletionDialog
} from "./InfraDialogs"
import { CreateTaskModal } from "./modals/CreateTaskModal"
import { TaskQuickDetailModal } from "./modals/TaskQuickDetailModal"
import { CreateRiskModal, CreateIssueModal } from "./RisksIssuesPage"
import { CreateServiceRequestModal } from "./ServiceDeskPage"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"

// ─── Types ────────────────────────────────────────────────────────────────

type TabKey = "overview" | "connections" | "linked" | "maintenance" | "history"
type ActionDialog = "status" | "move" | "delete" | "requestDelete" | "logMaintenance" | null
type CreateModal = "task" | "risk" | "issue" | "serviceRequest" | null

type MaintenanceLog = {
  id: string
  workType: string
  workTypeOther: string | null
  performedAt: string
  notes: string | null
  nextDueAt: string | null
  performedBy: { id: string; displayName: string } | null
}

type AuditEventWithActor = AuditEvent & {
  entityType?: string
  entityId?: string
  actorUserId?: string | null
  actorDisplayName?: string | null
  data?: any
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDayMon(iso: string): { day: string; year: string } {
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    year: String(d.getFullYear())
  }
}

function warrantyColor(expiry: string | null): string | null {
  if (!expiry) return null
  const d = new Date(expiry).getTime()
  const now = Date.now()
  if (d < now) return "#dc2626"
  if (d - now < 90 * 86400000) return "#f59e0b"
  return null
}

function workTypeLabel(workType: string, other: string | null): string {
  if (workType === "OTHER" && other) return other
  return workType.replaceAll("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase())
}

function maintenanceDotColor(workType: string): string {
  switch (workType) {
    case "INSPECTION":
    case "PAT_INSPECTION":
    case "COOLING_CHECK":
    case "CABLE_AUDIT":
      return "#378ADD"
    case "PSU_REPLACEMENT":
    case "REPAIR":
      return "#D85A30"
    case "FIRMWARE_UPGRADE":
    case "UPGRADE":
      return "#639922"
    default:
      return "#94a3b8"
  }
}

function avatarBg(email: string | null | undefined): string {
  const palette = ["#1d4ed8", "#0d9488", "#7c3aed", "#b45309", "#be185d", "#15803d", "#ea580c"]
  let h = 0
  for (const ch of email ?? "?") h = (h * 31 + ch.charCodeAt(0)) & 0xffffffff
  return palette[Math.abs(h) % palette.length]
}

function initialsFrom(label: string | null | undefined): string {
  if (!label) return "?"
  const base = label.includes("@") ? label.split("@")[0] : label
  const parts = base.split(/[\s._-]/).filter(Boolean)
  if (parts.length === 0) return label[0]?.toUpperCase() ?? "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function describeAssetAction(action: string): string {
  const a = action.toLowerCase()
  if (a.includes("create")) return "created this asset"
  if (a.includes("delete")) return "deleted this asset"
  if (a.includes("status")) return "changed status"
  if (a.includes("move") || a.includes("moved")) return "moved the asset"
  if (a.includes("maintenance")) return "logged maintenance"
  if (a.includes("update")) return "updated the asset"
  return action.replaceAll("_", " ").toLowerCase()
}

// ─── Small presentational helpers ─────────────────────────────────────────

const labelSx = { fontSize: 12, color: "text.secondary", width: 120, flexShrink: 0 } as const
const valueSx = { fontSize: 12.5, color: "text.primary", fontWeight: 500 } as const
const sectionLabelSx = { fontSize: 10, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" } as const

function PropertyCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ bgcolor: "background.default", px: "16px", py: "10px", borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={sectionLabelSx}>{title}</Typography>
      </Box>
      <Box>{children}</Box>
    </Box>
  )
}

function PropertyRow({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", px: "16px", py: "11px", borderBottom: last ? "none" : "1px solid", borderColor: "divider", gap: "12px" }}>
      <Typography sx={labelSx}>{label}</Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}

function PropertyValue({ value, mono = false, color }: { value: React.ReactNode; mono?: boolean; color?: string }) {
  return (
    <Typography sx={{ ...valueSx, fontFamily: mono ? "monospace" : "inherit", color: color ?? valueSx.color }}>
      {value ?? "—"}
    </Typography>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export type AssetDetailMode = "standalone" | "embedded"

export default function AssetDetailPage({
  mode = "standalone",
  assetIdProp,
  onBackToRegister,
  manageBreadcrumb = true,
}: {
  mode?: AssetDetailMode
  assetIdProp?: string
  onBackToRegister?: () => void
  manageBreadcrumb?: boolean
} = {}) {
  const { siteId: routeSiteId, assetId: routeAssetId } = useParams<{ siteId: string; assetId: string }>()
  const assetId = assetIdProp ?? routeAssetId
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setBreadcrumbs } = useBreadcrumb()
  const { mode: themeMode } = useThemeMode()

  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  // Direct delete is the approver set; ENGINEER/SDA request deletion via the approval queue.
  const canDeleteDirect = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])
  const canRequestDeletion = hasAnyRole([ROLES.ENGINEER, ROLES.SERVICE_DESK_ANALYST])

  const [tab, setTab] = React.useState<TabKey>("overview")
  const [editMode, setEditMode] = React.useState(false)
  const [editDraft, setEditDraft] = React.useState<any>(null)
  const [savingEdit, setSavingEdit] = React.useState(false)
  const { notify } = useNotification()
  const [activeDialog, setActiveDialog] = React.useState<ActionDialog>(null)
  const [createModal, setCreateModal] = React.useState<CreateModal>(null)
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)

  // ── Main asset query ──────────────────────────────────────────────────
  const { data: asset, isLoading, error: fetchError } = useQuery({
    queryKey: ["asset-detail", assetId],
    queryFn: async () => (await api.get<Asset>(`/assets/${assetId}`)).data,
    enabled: !!assetId
  })

  const siteId = asset?.siteId ?? routeSiteId ?? null

  // ── Breadcrumb (only when this page owns the shell) ───────────────────
  React.useEffect(() => {
    if (!manageBreadcrumb || !asset) return
    const crumbs: { label: string; onClick?: () => void }[] = []
    if (asset.site && asset.siteId) {
      crumbs.push({ label: asset.site.name, onClick: () => navigate(`/asset-hierarchy/${asset.siteId}`) })
    }
    if (asset.cabinet?.room && asset.cabinet.roomId && asset.siteId) {
      crumbs.push({
        label: asset.cabinet.room.name,
        onClick: () => navigate(`/asset-hierarchy/${asset.siteId}/rooms/${asset.cabinet!.roomId}`)
      })
    }
    if (asset.cabinet && asset.cabinetId && asset.siteId) {
      crumbs.push({
        label: asset.cabinet.name,
        onClick: () => navigate(`/asset-hierarchy/${asset.siteId}/cabinets/${asset.cabinetId}`)
      })
    }
    crumbs.push({ label: asset.name })
    setBreadcrumbs(crumbs)
  }, [manageBreadcrumb, asset, navigate, setBreadcrumbs])

  // ── Tab-scoped queries ────────────────────────────────────────────────
  const { data: history = [] } = useQuery({
    queryKey: ["audit-asset", assetId],
    queryFn: async () => (await api.get<AuditEventWithActor[]>(`/audit-events/entity/Asset/${assetId}`)).data,
    enabled: !!assetId && tab === "history"
  })

  const { data: maintenanceLogs = [] } = useQuery({
    queryKey: ["maintenance-asset", assetId],
    queryFn: async () => (await api.get<MaintenanceLog[]>(`/maintenance`, { params: { assetId } })).data,
    enabled: !!assetId && tab === "maintenance"
  })

  const linkedEnabled = !!assetId

  const { data: linkedTasks = [] } = useQuery({
    queryKey: ["linked-tasks-asset", assetId],
    queryFn: async () => (await api.get<LinkedTask[]>("/tasks", { params: { linkedEntityType: "Asset", linkedEntityId: assetId } })).data,
    enabled: linkedEnabled
  })
  const { data: linkedServiceRequests = [] } = useQuery({
    queryKey: ["linked-service-requests-asset", assetId],
    queryFn: async () => (await api.get<LinkedServiceRequest[]>("/service-requests", { params: { linkedEntityType: "Asset", linkedEntityId: assetId } })).data,
    enabled: linkedEnabled
  })
  const { data: linkedRisks = [] } = useQuery({
    queryKey: ["linked-risks-asset", assetId],
    queryFn: async () => (await api.get<LinkedRisk[]>("/risks", { params: { linkedEntityType: "Asset", linkedEntityId: assetId } })).data,
    enabled: linkedEnabled
  })
  const { data: linkedIssues = [] } = useQuery({
    queryKey: ["linked-issues-asset", assetId],
    queryFn: async () => (await api.get<LinkedIssue[]>("/issues", { params: { linkedEntityType: "Asset", linkedEntityId: assetId } })).data,
    enabled: linkedEnabled
  })

  // Assignee picker source (feeds the linked-task quick-detail modal) —
  // operational-callable & client-scoped, replacing admin-only GET /users.
  const { data: users = [] } = useAssignableUsers()

  const { data: siteCabinets = [] } = useQuery({
    queryKey: ["site-cabinets", siteId],
    queryFn: async () => (await api.get<Cabinet[]>(`/sites/${siteId}/cabinets`)).data,
    enabled: !!siteId && (editMode || activeDialog === "move")
  })

  // ── Derived ───────────────────────────────────────────────────────────
  const linkedTotal = linkedTasks.length + linkedServiceRequests.length + linkedRisks.length + linkedIssues.length
  const linkedBadge = linkedTotal

  const recentLinked = React.useMemo(() => {
    const merged = [
      ...linkedTasks.map(t => ({ kind: "task" as const, id: t.id, reference: t.reference, status: t.status, subtitle: t.title })),
      ...linkedServiceRequests.map(s => ({ kind: "sr" as const, id: s.id, reference: s.reference, status: s.status, subtitle: s.subject })),
      ...linkedRisks.map(r => ({ kind: "risk" as const, id: r.id, reference: r.reference, status: r.status, subtitle: r.title })),
      ...linkedIssues.map(i => ({ kind: "issue" as const, id: i.id, reference: i.reference, status: i.status, subtitle: i.title })),
    ]
    return merged.slice(0, 3)
  }, [linkedTasks, linkedServiceRequests, linkedRisks, linkedIssues])

  const nextMaintenance = React.useMemo(() => {
    const now = Date.now()
    const upcoming = maintenanceLogs
      .map(m => m.nextDueAt)
      .filter((d): d is string => !!d && new Date(d).getTime() >= now)
      .sort()
    return upcoming[0] ?? null
  }, [maintenanceLogs])

  // ── Mutations ─────────────────────────────────────────────────────────
  const invalidateAsset = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ["asset-detail", assetId] })
    qc.invalidateQueries({ queryKey: ["audit-asset", assetId] })
    qc.invalidateQueries({ queryKey: ["assets"] })
    if (siteId) qc.invalidateQueries({ queryKey: ["site-cabinets", siteId] })
  }, [qc, assetId, siteId])

  const handleSaveEdit = React.useCallback(async () => {
    if (!asset || !editDraft) return
    setSavingEdit(true)
    try {
      await api.put(`/assets/${asset.id}`, editDraft)
      invalidateAsset()
      setEditMode(false)
      setEditDraft(null)
      notify.success("Asset updated")
    } catch (e) {
      notify.error(getApiErrorMessage(e, "Failed to save asset"))
    } finally { setSavingEdit(false) }
  }, [asset, editDraft, invalidateAsset, notify])

  const handleChangeStatus = React.useCallback(async (data: { lifecycleState: string; status: string }) => {
    if (!asset) return
    try {
      await api.put(`/assets/${asset.id}`, data)
      invalidateAsset()
      notify.success("Asset status updated")
    } catch (e) { notify.error(getApiErrorMessage(e, "Failed to update status")); throw e }
  }, [asset, invalidateAsset, notify])

  const handleMove = React.useCallback(async (data: { siteId: string; cabinetId: string | null; uPosition: number | null; rackSide: "FRONT" | "REAR" }) => {
    if (!asset) return
    try {
      await api.put(`/assets/${asset.id}`, data)
      invalidateAsset()
      notify.success("Asset moved")
    } catch (e) { notify.error(getApiErrorMessage(e, "Failed to move asset")); throw e }
  }, [asset, invalidateAsset, notify])

  const handleDelete = React.useCallback(async () => {
    if (!asset) return
    try {
      await api.delete(`/assets/${asset.id}`)
      qc.invalidateQueries({ queryKey: ["assets"] })
      if (siteId) qc.invalidateQueries({ queryKey: ["site-cabinets", siteId] })
      navigate(siteId ? `/asset-hierarchy/${siteId}` : "/asset-hierarchy")
      notify.success("Asset deleted")
    } catch (e) { notify.error(getApiErrorMessage(e, "Failed to delete asset")); throw e }
  }, [asset, qc, siteId, navigate, notify])

  const handleRequestDeletion = React.useCallback(async (reason: string) => {
    if (!asset) return
    try {
      await api.post(`/assets/${asset.id}/deletion-request`, { reason: reason || undefined })
      qc.invalidateQueries({ queryKey: ["asset-detail", asset.id] })
      notify.success("Deletion request submitted for approval")
    } catch (e) { notify.error(getApiErrorMessage(e, "Failed to submit deletion request")); throw e }
  }, [asset, qc, notify])

  const handleLogMaintenance = React.useCallback(async (data: any) => {
    if (!asset) return
    try {
      await api.post("/maintenance", { ...data, assetId: asset.id })
      qc.invalidateQueries({ queryKey: ["maintenance-asset", asset.id] })
      qc.invalidateQueries({ queryKey: ["asset-detail", asset.id] })
      notify.success("Maintenance logged")
    } catch (e) { notify.error(getApiErrorMessage(e, "Failed to log maintenance")); throw e }
  }, [asset, qc, notify])

  async function patchLinkedTask(taskId: string, patch: Record<string, any>) {
    await api.put(`/tasks/${taskId}`, patch)
    qc.invalidateQueries({ queryKey: ["linked-tasks-asset", assetId] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }
  async function updateLinkedTaskStatus(taskId: string, status: string) {
    await api.post(`/tasks/${taskId}/status`, { status })
    qc.invalidateQueries({ queryKey: ["linked-tasks-asset", assetId] })
    qc.invalidateQueries({ queryKey: ["tasks"] })
  }

  // ── Edit handlers ─────────────────────────────────────────────────────
  const enterEdit = React.useCallback(() => {
    if (!asset) return
    setEditDraft({
      assetTag: asset.assetTag,
      name: asset.name,
      assetType: asset.assetType,
      manufacturer: asset.manufacturer ?? "",
      modelNumber: asset.modelNumber ?? "",
      serialNumber: asset.serialNumber ?? "",
      ipAddress: asset.ipAddress ?? "",
      uPosition: asset.uPosition,
      uHeight: asset.uHeight,
      powerDrawW: asset.powerDrawW,
      rackSide: asset.rackSide ?? "FRONT",
      lifecycleState: asset.lifecycleState,
      cabinetId: asset.cabinetId ?? ""
    })
    setEditMode(true)
  }, [asset])

  const cancelEdit = React.useCallback(() => {
    setEditMode(false); setEditDraft(null)
  }, [])

  const patchDraft = React.useCallback((patch: Record<string, any>) => {
    setEditDraft((d: any) => ({ ...d, ...patch }))
  }, [])

  // ── Edge states ───────────────────────────────────────────────────────
  if (isLoading) return <Box sx={{ p: 3 }}><LoadingState /></Box>
  if (fetchError) return <Box sx={{ p: 3 }}><ErrorState title="Failed to load asset" /></Box>
  if (!asset) return <Box sx={{ p: 3 }}><EmptyState title="Asset not found" detail="The asset may have been deleted or you don't have access." /></Box>

  // ── Render ────────────────────────────────────────────────────────────
  const outerSx: SxProps<Theme> = mode === "standalone"
    ? {
        mx: { xs: "-12px", md: "-24px" }, mt: { xs: "-12px", md: "-24px" }, mb: { xs: "-12px", md: "-24px" },
        height: "calc(100vh - 56px)", display: "flex", flexDirection: "column", overflow: "hidden", bgcolor: "background.default"
      }
    : { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", bgcolor: "background.default" }

  return (
    <Box sx={outerSx}>

      {onBackToRegister ? (
        <Box sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", px: "24px", py: "6px", flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.5} onClick={onBackToRegister}
            sx={{ cursor: "pointer", width: "fit-content", color: "primary.main", "&:hover": { textDecoration: "underline" } }}>
            <ArrowBackIcon sx={{ fontSize: 14 }} />
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>Back to register</Typography>
          </Stack>
        </Box>
      ) : null}

      {/* ── Header ───────────────────────────────────────────────────── */}
      <Box sx={{ height: HEADER_HEIGHT, bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", px: "24px", display: "flex", alignItems: "center", flexShrink: 0, gap: 2 }}>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {asset.name}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.tertiary", flexShrink: 0 }}>
            {asset.assetType}
          </Typography>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
            {canManage ? (editMode ? (
              <Stack direction="row" spacing={1} sx={{ ml: 1 }}>
                <Button size="small" variant="outlined" onClick={cancelEdit} disabled={savingEdit} sx={{ textTransform: "none", fontSize: 12 }}>Cancel</Button>
                <Button size="small" variant="contained" onClick={handleSaveEdit} disabled={savingEdit} sx={{ textTransform: "none", fontSize: 12 }}>{savingEdit ? "Saving..." : "Save changes"}</Button>
              </Stack>
            ) : (
              <Box sx={{ ml: 1 }}>
                <EditActionsButton
                  onEdit={enterEdit}
                  actions={[
                    { label: "Change status", onClick: () => setActiveDialog("status") },
                    { label: "Move asset", onClick: () => setActiveDialog("move") },
                    { divider: true },
                    ...(canDeleteDirect
                      ? [{ label: "Delete asset", danger: true, onClick: () => setActiveDialog("delete") }]
                      : canRequestDeletion
                        ? [{
                            label: asset.deletionStatus === "PENDING" ? "Deletion requested" : "Request deletion",
                            danger: true,
                            disabled: asset.deletionStatus === "PENDING",
                            onClick: () => setActiveDialog("requestDelete"),
                          }]
                        : []),
                  ]}
                />
              </Box>
            )) : null}
        </Stack>
      </Box>

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <Box sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider", px: "24px", flexShrink: 0 }}>
        <Stack direction="row" spacing={0}>
          {[
            { key: "overview", label: "Overview" },
            { key: "connections", label: "Connections" },
            { key: "linked", label: "Linked records", count: linkedBadge },
            { key: "maintenance", label: "Maintenance" },
            { key: "history", label: "History" },
          ].map(t => {
            const active = tab === t.key
            return (
              <Box key={t.key} onClick={() => setTab(t.key as TabKey)}
                sx={{
                  px: "14px", py: "10px", cursor: "pointer", fontSize: 12.5, fontWeight: 500,
                  color: active ? "primary.main" : "text.secondary",
                  borderBottom: "2px solid", borderBottomColor: active ? "primary.main" : "transparent",
                  display: "flex", alignItems: "center", gap: "6px", mb: "-1px"
                }}>
                {t.label}
                {t.count != null ? (
                  <Box sx={{ px: "6px", py: "1px", borderRadius: "4px", fontSize: 10, fontWeight: 600, bgcolor: active ? (themeMode === "dark" ? "#16294a" : "#dbeafe") : (themeMode === "dark" ? "#1e293b" : "#f1f5f9"), color: active ? "primary.main" : "text.secondary" }}>
                    {t.count}
                  </Box>
                ) : null}
              </Box>
            )
          })}
        </Stack>
      </Box>

      {/* ── Tab content (scrolls) ────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflowY: "auto", p: "20px 24px" }}>
        {tab === "overview" ? (
          <OverviewTab
            asset={asset}
            editMode={editMode}
            editDraft={editDraft}
            onPatchDraft={patchDraft}
            cabinets={siteCabinets}
            recentLinked={recentLinked}
            onViewAllLinked={() => setTab("linked")}
            onOpenTask={id => setQuickTaskId(id)}
            navigate={navigate}
          />
        ) : null}

        {tab === "connections" ? <ConnectionsTab asset={asset} /> : null}

        {tab === "linked" ? (
          <LinkedTab
            tasks={linkedTasks}
            serviceRequests={linkedServiceRequests}
            risks={linkedRisks}
            issues={linkedIssues}
            onCreate={kind => setCreateModal(kind)}
            onOpenTask={id => setQuickTaskId(id)}
            navigate={navigate}
            canManage={canManage}
          />
        ) : null}

        {tab === "maintenance" ? (
          <MaintenanceTab
            asset={asset}
            logs={maintenanceLogs}
            nextDue={nextMaintenance}
            onLogMaintenance={() => setActiveDialog("logMaintenance")}
            canManage={canManage}
          />
        ) : null}

        {tab === "history" ? <HistoryTab events={history} /> : null}
      </Box>

      {/* ── Lazy-mounted dialogs ─────────────────────────────────────── */}
      {activeDialog === "status" && (
        <ChangeAssetStatusDialog
          asset={{ lifecycleState: asset.lifecycleState, status: asset.status }}
          onClose={() => setActiveDialog(null)}
          onSave={handleChangeStatus}
        />
      )}
      {activeDialog === "move" && (
        <MoveAssetDialog
          asset={{
            siteId: asset.siteId,
            siteName: asset.site?.name ?? null,
            cabinetId: asset.cabinetId,
            cabinetName: asset.cabinet?.name ?? null,
            uPosition: asset.uPosition,
            rackSide: asset.rackSide,
            cabinet: asset.cabinet ? { roomId: asset.cabinet.roomId, room: asset.cabinet.room ?? null } : null
          }}
          onClose={() => setActiveDialog(null)}
          onSave={handleMove}
        />
      )}
      {activeDialog === "delete" && (
        <DeleteConfirmDialog type="asset" label={asset.name} onClose={() => setActiveDialog(null)} onConfirm={handleDelete} />
      )}
      {activeDialog === "requestDelete" && (
        <RequestDeletionDialog label={asset.name} onClose={() => setActiveDialog(null)} onConfirm={handleRequestDeletion} />
      )}
      {activeDialog === "logMaintenance" && (
        <LogMaintenanceDialog onClose={() => setActiveDialog(null)} onSave={handleLogMaintenance} />
      )}

      {/* Create-record modals */}
      <CreateTaskModal
        navigateAfterCreate={false}
        open={createModal === "task"} onClose={() => setCreateModal(null)}
        linkedEntityType="Asset" linkedEntityId={asset.id} linkedEntityLabel={asset.name}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-tasks-asset", asset.id] }) }}
      />
      <CreateRiskModal
        open={createModal === "risk"} onClose={() => setCreateModal(null)}
        linkedEntityType="Asset" linkedEntityId={asset.id} linkedEntityLabel={asset.name}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-risks-asset", asset.id] }) }}
      />
      <CreateIssueModal
        open={createModal === "issue"} onClose={() => setCreateModal(null)}
        linkedEntityType="Asset" linkedEntityId={asset.id} linkedEntityLabel={asset.name}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-issues-asset", asset.id] }) }}
      />
      <CreateServiceRequestModal
        open={createModal === "serviceRequest"} onClose={() => setCreateModal(null)}
        linkedEntityType="Asset" linkedEntityId={asset.id} linkedEntityLabel={asset.name}
        navigateAfterCreate={false}
        onSuccess={async () => { qc.invalidateQueries({ queryKey: ["linked-service-requests-asset", asset.id] }) }}
      />

      <TaskQuickDetailModal
        open={Boolean(quickTaskId)} taskId={quickTaskId} users={users} canManage={canManage}
        onClose={() => setQuickTaskId(null)}
        onOpenFull={(taskId) => navigate(`/service-desk/task/${taskId}`)}
        onPatchTask={patchLinkedTask}
        onUpdateStatus={updateLinkedTaskStatus}
      />
    </Box>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────

const OverviewTab = React.memo(function OverviewTab({
  asset, editMode, editDraft, onPatchDraft, cabinets, recentLinked, onViewAllLinked, onOpenTask, navigate
}: {
  asset: Asset
  editMode: boolean
  editDraft: any
  onPatchDraft: (patch: Record<string, any>) => void
  cabinets: Cabinet[]
  recentLinked: { kind: "task" | "sr" | "risk" | "issue"; id: string; reference: string; status: string; subtitle: string }[]
  onViewAllLinked: () => void
  onOpenTask: (id: string) => void
  navigate: (path: string) => void
}) {
  const warrantyCol = warrantyColor(asset.warrantyExpiry)
  const draft = editDraft ?? {}

  return (
    <Box>
      <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
        {/* Hardware */}
        <PropertyCard title="Hardware">
          <PropertyRow label="Manufacturer">
            {editMode ? (
              <TextField size="small" value={draft.manufacturer ?? ""} onChange={e => onPatchDraft({ manufacturer: e.target.value })} fullWidth />
            ) : <PropertyValue value={asset.manufacturer} />}
          </PropertyRow>
          <PropertyRow label="Model">
            {editMode ? (
              <TextField size="small" value={draft.modelNumber ?? ""} onChange={e => onPatchDraft({ modelNumber: e.target.value })} fullWidth />
            ) : <PropertyValue value={asset.modelNumber} />}
          </PropertyRow>
          <PropertyRow label="Serial">
            {editMode ? (
              <TextField size="small" value={draft.serialNumber ?? ""} onChange={e => onPatchDraft({ serialNumber: e.target.value })} fullWidth />
            ) : <PropertyValue value={asset.serialNumber} mono />}
          </PropertyRow>
          <PropertyRow label="Asset tag" last>
            {editMode ? (
              <TextField size="small" value={draft.assetTag ?? ""} onChange={e => onPatchDraft({ assetTag: e.target.value })} fullWidth />
            ) : <PropertyValue value={asset.assetTag} mono />}
          </PropertyRow>
        </PropertyCard>

        {/* Location */}
        <PropertyCard title="Location">
          <PropertyRow label="Site">
            {asset.site && asset.siteId ? (
              <Typography
                onClick={() => navigate(`/asset-hierarchy/${asset.siteId}`)}
                sx={{ ...valueSx, cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}>
                {asset.site.name}
              </Typography>
            ) : <PropertyValue value={null} />}
          </PropertyRow>
          <PropertyRow label="Room">
            {asset.cabinet?.room && asset.cabinet.roomId && asset.siteId ? (
              <Typography
                onClick={() => navigate(`/asset-hierarchy/${asset.siteId}/rooms/${asset.cabinet!.roomId}`)}
                sx={{ ...valueSx, cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}>
                {asset.cabinet.room.name}
              </Typography>
            ) : <PropertyValue value={null} />}
          </PropertyRow>
          <PropertyRow label="Cabinet">
            {editMode ? (
              <TextField size="small" select value={draft.cabinetId ?? ""} onChange={e => onPatchDraft({ cabinetId: e.target.value })} fullWidth>
                <MenuItem value="">Unassigned</MenuItem>
                {cabinets.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
            ) : asset.cabinet && asset.cabinetId && asset.siteId ? (
              <Typography
                onClick={() => navigate(`/asset-hierarchy/${asset.siteId}/cabinets/${asset.cabinetId}`)}
                sx={{ ...valueSx, cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}>
                {asset.cabinet.name}
              </Typography>
            ) : <PropertyValue value={null} />}
          </PropertyRow>
          <PropertyRow label="Position" last>
            {editMode ? (
              <Stack direction="row" spacing={1}>
                <TextField size="small" label="U" type="number" value={draft.uPosition ?? ""} onChange={e => onPatchDraft({ uPosition: e.target.value ? parseInt(e.target.value) : null })} sx={{ width: 80 }} />
                <TextField size="small" label="Side" select value={draft.rackSide ?? "FRONT"} onChange={e => onPatchDraft({ rackSide: e.target.value })} sx={{ width: 100 }}>
                  <MenuItem value="FRONT">Front</MenuItem>
                  <MenuItem value="REAR">Rear</MenuItem>
                </TextField>
                <TextField size="small" label="Height" type="number" value={draft.uHeight ?? ""} onChange={e => onPatchDraft({ uHeight: e.target.value ? parseInt(e.target.value) : null })} sx={{ width: 90 }} />
              </Stack>
            ) : (
              <PropertyValue value={asset.uPosition != null
                ? `U${asset.uPosition}${asset.rackSide ? ` · ${asset.rackSide.toLowerCase()}` : ""}${asset.uHeight != null ? ` · ${asset.uHeight}U` : ""}`
                : null}
              />
            )}
          </PropertyRow>
        </PropertyCard>

        {/* Network */}
        <PropertyCard title="Network">
          <PropertyRow label="IP address" last>
            {editMode ? (
              <TextField size="small" value={draft.ipAddress ?? ""} onChange={e => onPatchDraft({ ipAddress: e.target.value })} fullWidth />
            ) : <PropertyValue value={asset.ipAddress} mono />}
          </PropertyRow>
        </PropertyCard>

        {/* Lifecycle */}
        <PropertyCard title="Lifecycle">
          <PropertyRow label="State">
            {editMode ? (
              <TextField size="small" select value={draft.lifecycleState ?? "ACTIVE"} onChange={e => onPatchDraft({ lifecycleState: e.target.value })} fullWidth>
                {ASSET_LIFECYCLE_OPTIONS.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
              </TextField>
            ) : (
              <StatusPill
                intent={entityStatusIntent(asset.lifecycleState)}
                label={asset.lifecycleState.charAt(0) + asset.lifecycleState.slice(1).toLowerCase()}
              />
            )}
          </PropertyRow>
          <PropertyRow label="Installed"><PropertyValue value={formatDate(asset.installDate)} /></PropertyRow>
          <PropertyRow label="Warranty">
            <PropertyValue value={formatDate(asset.warrantyExpiry)} color={warrantyCol ?? undefined} />
          </PropertyRow>
          <PropertyRow label="Power draw" last>
            {editMode ? (
              <TextField size="small" type="number" value={draft.powerDrawW ?? ""} onChange={e => onPatchDraft({ powerDrawW: e.target.value ? parseFloat(e.target.value) : null })} fullWidth />
            ) : <PropertyValue value={asset.powerDrawW != null ? `${asset.powerDrawW} W` : null} />}
          </PropertyRow>
        </PropertyCard>
      </Box>

      {/* Recent linked records strip */}
      <Box sx={{ mt: "14px", bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
        <Stack direction="row" alignItems="center" sx={{ bgcolor: "background.default", px: "16px", py: "10px", borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography sx={{ ...sectionLabelSx, flex: 1 }}>Recent linked records</Typography>
          <Typography onClick={onViewAllLinked} sx={{ fontSize: 11.5, color: "primary.main", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}>View all →</Typography>
        </Stack>
        {recentLinked.length === 0 ? (
          <Box sx={{ p: "20px", textAlign: "center" }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No linked records yet</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "grid", gap: "10px", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, p: "12px" }}>
            {recentLinked.map(item => (
              <Box key={`${item.kind}-${item.id}`}
                onClick={() => {
                  if (item.kind === "task") return onOpenTask(item.id)
                  if (item.kind === "sr") return navigate(`/service-desk/${item.id}`)
                  if (item.kind === "risk") return navigate(`/risks-issues/risks/${item.id}`)
                  if (item.kind === "issue") return navigate(`/risks-issues/issues/${item.id}`)
                }}
                sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: "10px 12px", cursor: "pointer", "&:hover": { bgcolor: "action.hover", borderColor: "text.tertiary" } }}>
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: "4px" }}>
                  <Typography sx={{ fontSize: 11.5, fontFamily: "monospace", fontWeight: 700, color: "text.secondary" }}>{item.reference}</Typography>
                  <Box sx={{ ml: "auto", display: "inline-flex", flexShrink: 0 }}>
                    <StatusPill value={item.status} label={String(item.status).toLowerCase().replaceAll("_", " ")} size="sm" />
                  </Box>
                </Stack>
                <Typography sx={{ fontSize: 12, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.subtitle}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
})

// ─── Connections tab ──────────────────────────────────────────────────────

const ConnectionsTab = React.memo(function ConnectionsTab({ asset }: { asset: Asset }) {
  const { mode } = useThemeMode()
  return (
    <Stack spacing={1.5} sx={{ maxWidth: 880 }}>
      <PropertyCard title="IP addresses">
        {asset.ipAddress ? (
          <Box sx={{ px: "16px", py: "11px", display: "flex", alignItems: "center", gap: 1 }}>
            <Typography sx={{ fontFamily: "monospace", fontSize: 12.5, color: "text.primary", fontWeight: 500 }}>{asset.ipAddress}</Typography>
            <Chip size="small" label="Primary" sx={{ bgcolor: mode === "dark" ? "#16294a" : "#dbeafe", color: "primary.main", fontSize: 9.5, height: 18, fontWeight: 600 }} />
          </Box>
        ) : (
          <Box sx={{ px: "16px", py: "14px" }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No IP address recorded</Typography>
          </Box>
        )}
      </PropertyCard>

      <PropertyCard title="Power connections">
        <Box sx={{ m: "12px", py: "20px", border: "1.5px dashed", borderColor: "divider", borderRadius: "8px", textAlign: "center" }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No power connections recorded</Typography>
        </Box>
      </PropertyCard>

      <PropertyCard title="Network interfaces">
        <Box sx={{ m: "12px", py: "20px", border: "1.5px dashed", borderColor: "divider", borderRadius: "8px", textAlign: "center" }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Network interface tracking coming soon</Typography>
        </Box>
      </PropertyCard>
    </Stack>
  )
})

// ─── Linked tab ───────────────────────────────────────────────────────────

function LinkedTab({
  tasks, serviceRequests, risks, issues, onCreate, onOpenTask, navigate, canManage
}: {
  tasks: LinkedTask[]
  serviceRequests: LinkedServiceRequest[]
  risks: LinkedRisk[]
  issues: LinkedIssue[]
  onCreate: (kind: CreateModal) => void
  onOpenTask: (id: string) => void
  navigate: (path: string) => void
  canManage: boolean
}) {
  const sections: {
    title: string
    kind: CreateModal
    items: { id: string; reference: string; status: string; subtitle: string }[]
    onRowClick: (id: string) => void
  }[] = [
    { title: "Tasks", kind: "task", items: tasks.map(t => ({ id: t.id, reference: t.reference, status: t.status, subtitle: t.title })), onRowClick: id => onOpenTask(id) },
    { title: "Service requests", kind: "serviceRequest", items: serviceRequests.map(s => ({ id: s.id, reference: s.reference, status: s.status, subtitle: s.subject })), onRowClick: id => navigate(`/service-desk/${id}`) },
    { title: "Risks", kind: "risk", items: risks.map(r => ({ id: r.id, reference: r.reference, status: r.status, subtitle: `${r.likelihood}/${r.impact} · ${r.title}` })), onRowClick: id => navigate(`/risks-issues/risks/${id}`) },
    { title: "Issues", kind: "issue", items: issues.map(i => ({ id: i.id, reference: i.reference, status: i.status, subtitle: `${i.severity} · ${i.title}` })), onRowClick: id => navigate(`/risks-issues/issues/${id}`) },
  ]

  return (
    <Box sx={{ display: "grid", gap: "12px", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
      {sections.map(section => (
        <Box key={section.title} sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
          <Stack direction="row" alignItems="center" sx={{ bgcolor: "background.default", px: "16px", py: "10px", borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography sx={{ ...sectionLabelSx, flex: 1 }}>{section.title} ({section.items.length})</Typography>
            {canManage ? (
              <Button size="small" onClick={() => onCreate(section.kind)} sx={{ textTransform: "none", fontSize: 11.5, minWidth: 0, px: "8px", py: "2px" }}>+ Create</Button>
            ) : null}
          </Stack>
          {section.items.length === 0 ? (
            <Box sx={{ p: "14px 16px" }}>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No linked {section.title.toLowerCase()}</Typography>
            </Box>
          ) : section.items.map((item, idx) => (
            <Stack key={item.id} direction="row" alignItems="center" onClick={() => section.onRowClick(item.id)}
              sx={{ p: "10px 16px", cursor: "pointer", borderBottom: idx < section.items.length - 1 ? "1px solid" : "none", borderColor: "divider", "&:hover": { bgcolor: "action.hover" }, gap: "10px" }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary", fontFamily: "monospace" }}>{item.reference}</Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.subtitle}</Typography>
              </Box>
              <StatusPill value={item.status} label={String(item.status).toLowerCase().replaceAll("_", " ")} size="sm" />
            </Stack>
          ))}
        </Box>
      ))}
    </Box>
  )
}

// ─── Maintenance tab ──────────────────────────────────────────────────────

function MaintenanceTab({
  asset, logs, nextDue, onLogMaintenance, canManage
}: {
  asset: Asset
  logs: MaintenanceLog[]
  nextDue: string | null
  onLogMaintenance: () => void
  canManage: boolean
}) {
  const lastPerformed = logs[0]?.performedAt ?? null

  return (
    <Box sx={{ maxWidth: 900 }}>
      <Box sx={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(3, 1fr)", mb: "12px" }}>
        {[
          { label: "Last maintained", value: formatDate(lastPerformed ?? (asset as any).lastMaintenanceAt ?? null) },
          { label: "Next scheduled", value: formatDate(nextDue) },
          { label: "Total entries", value: String(logs.length) },
        ].map(s => (
          <Box key={s.label} sx={{ bgcolor: "background.default", border: "1px solid", borderColor: "divider", borderRadius: "10px", p: "14px 16px" }}>
            <Typography sx={sectionLabelSx}>{s.label}</Typography>
            <Typography sx={{ fontSize: 16, fontWeight: 600, color: "text.primary", mt: "4px" }}>{s.value}</Typography>
          </Box>
        ))}
      </Box>

      {canManage ? (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: "10px" }}>
          <Button size="small" variant="contained" onClick={onLogMaintenance} sx={{ textTransform: "none", fontSize: 12 }}>Log maintenance</Button>
        </Stack>
      ) : null}

      {logs.length === 0 ? (
        <Box sx={{ py: "32px", border: "1.5px dashed", borderColor: "divider", borderRadius: "10px", textAlign: "center", bgcolor: "background.paper" }}>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>No maintenance logs for this asset</Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
          {logs.map((log, idx) => {
            const { day, year } = formatDayMon(log.performedAt)
            const color = maintenanceDotColor(log.workType)
            return (
              <Stack key={log.id} direction="row" alignItems="stretch" sx={{ p: "16px", borderBottom: idx < logs.length - 1 ? "1px solid" : "none", borderColor: "divider" }}>
                <Box sx={{ width: 70, flexShrink: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary" }}>{day}</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>{year}</Typography>
                </Box>
                <Box sx={{ width: 20, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", mt: "4px" }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, border: "2px solid", borderColor: "background.paper", boxShadow: t => `0 0 0 2px ${t.palette.divider}` }} />
                  <Box sx={{ flex: 1, width: 2, bgcolor: "divider", mt: "4px" }} />
                </Box>
                <Box sx={{ flex: 1, pl: "12px" }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: "4px" }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.primary" }}>{workTypeLabel(log.workType, log.workTypeOther)}</Typography>
                    <Chip size="small" label={log.workType.replaceAll("_", " ").toLowerCase()}
                      sx={{ bgcolor: `${color}1f`, color: color, fontSize: 9.5, height: 18, fontWeight: 600 }} />
                  </Stack>
                  {log.notes ? <Typography sx={{ fontSize: 12.5, color: "text.primary", mb: "4px" }}>{log.notes}</Typography> : null}
                  <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>
                    Performed by {log.performedBy?.displayName ?? "—"}
                    {log.nextDueAt ? ` · Next due ${formatDate(log.nextDueAt)}` : ""}
                  </Typography>
                </Box>
              </Stack>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

// ─── History tab ──────────────────────────────────────────────────────────

function HistoryTab({ events }: { events: AuditEventWithActor[] }) {
  if (events.length === 0) {
    return (
      <Box sx={{ maxWidth: 880, py: "32px", textAlign: "center" }}>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No history available yet</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 880, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
      {events.map((event, idx) => {
        const actor = event.actorDisplayName ?? "system"
        const changes: { field: string; from?: string; to?: string }[] =
          Array.isArray(event.data?.changes) ? event.data.changes
          : Array.isArray(event.data?.diff) ? event.data.diff
          : (event.data?.fields ? (event.data.fields as string[]).map(f => ({ field: f })) : [])
        const isStatusChange = (event.action.toLowerCase().includes("status") && event.data?.from && event.data?.to)

        return (
          <Box key={event.id} sx={{ p: "14px 16px", borderBottom: idx < events.length - 1 ? "1px solid" : "none", borderColor: "divider" }}>
            <Stack direction="row" alignItems="flex-start" spacing={1.25}>
              <Box sx={{ width: 26, height: 26, borderRadius: "50%", bgcolor: avatarBg(actor), color: "#fff", fontSize: 10.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {initialsFrom(actor)}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography sx={{ fontSize: 12.5, color: "text.primary", flex: 1, minWidth: 0 }}>
                    <Box component="span" sx={{ fontWeight: 600 }}>{actor}</Box>{" "}
                    <Box component="span" sx={{ color: "text.secondary" }}>{describeAssetAction(event.action)}</Box>
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "text.tertiary", flexShrink: 0 }}>{new Date(event.createdAt).toLocaleString()}</Typography>
                </Stack>

                {isStatusChange ? (
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: "6px" }}>
                    <StatusPill value={event.data!.from} label={String(event.data!.from).toLowerCase().replaceAll("_", " ")} size="sm" />
                    <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>→</Typography>
                    <StatusPill value={event.data!.to} label={String(event.data!.to).toLowerCase().replaceAll("_", " ")} size="sm" />
                  </Stack>
                ) : null}

                {!isStatusChange && changes.length > 0 ? (
                  <Box sx={{ mt: "8px", bgcolor: "background.default", border: "1px solid", borderColor: "divider", borderRadius: "8px", p: "10px 12px" }}>
                    {changes.map(c => (
                      <Stack key={c.field} direction="row" alignItems="baseline" spacing={0.75} sx={{ fontSize: 11.5, flexWrap: "wrap" }}>
                        <Typography component="span" sx={{ fontSize: 11.5, fontWeight: 600, color: "text.secondary" }}>{c.field}:</Typography>
                        {c.from != null ? (
                          <Typography component="span" sx={{ fontSize: 11.5, color: "#dc2626", textDecoration: "line-through" }}>{String(c.from)}</Typography>
                        ) : null}
                        {c.from != null && c.to != null ? <Typography component="span" sx={{ fontSize: 11.5, color: "text.tertiary" }}>→</Typography> : null}
                        {c.to != null ? (
                          <Typography component="span" sx={{ fontSize: 11.5, color: "#15803d" }}>{String(c.to)}</Typography>
                        ) : null}
                      </Stack>
                    ))}
                  </Box>
                ) : null}
              </Box>
            </Stack>
          </Box>
        )
      })}
    </Box>
  )
}
