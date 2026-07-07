import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, IconButton, ListItemIcon, Menu, MenuItem, Stack, Tooltip, Typography,
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown"
import LinkIcon from "@mui/icons-material/Link"
import LinkOffIcon from "@mui/icons-material/LinkOff"
import { api } from "../lib/api"
import { useNotification } from "./NotificationProvider"
import { visualForType, routeForLink, clearParentLink, type LinkRecordType } from "../lib/linkedRecords"
import { StatusPill } from "./shared"
import type { LinkedIssue, LinkedRisk, LinkedServiceRequest, LinkedTask } from "../lib/infrastructure"
import { CreateRecordModal } from "./create/CreateRecordModal"
import { LinkExistingDialog } from "./LinkExistingDialog"
import { RecordTypeBadge } from "./RecordTypeBadge"
import { partitionByHistory } from "../lib/recordStatus"

// ─────────────────────────────────────────────────────────────────────────────
// ParentLinkedRecords — the shared linked-records surface for the DCIM estate
// entities (Asset / Cabinet / Site). These are "parent context" links: a work
// item points at its parent via the singular linkedEntity* scalar (CLAUDE.md —
// the LIVE generic parent pointer), NOT the RecordLink peer-join. So the list is
// four scalar-filtered queries, and creating a linked record stamps the parent.
//
// Visually this matches the Service Desk detail pages' LinkedRecordsContent — one
// clean row list (type icon + title + ref + status pill), replacing the old boxy
// 2×2 per-type section grid. Create routes through the shared CreateRecordModal
// (navigateAfterCreate=false, so the new row just appears here).
// ─────────────────────────────────────────────────────────────────────────────

export type ParentEntityType = "Asset" | "Cabinet" | "Site"

// Shared query keys — so a host page (e.g. AssetDetailPage's overview "recent
// linked") can read the SAME cache entry (react-query dedupes: one fetch), and a
// create here invalidates the base key to refresh every consumer at once.
export const parentLinkedBase = (entityType: ParentEntityType, entityId: string | undefined) =>
  ["parent-linked", entityType, entityId] as const
export const parentLinkedKey = (
  entityType: ParentEntityType,
  entityId: string | undefined,
  kind: "task" | "sr" | "risk" | "issue",
) => [...parentLinkedBase(entityType, entityId), kind]

// A normalised row for the merged list — visualType keys the icon/colour, and the
// detail route is derived from it. `recordType` is the CreateRecordModal key.
interface LinkedRow {
  visualType: LinkRecordType
  id: string
  reference: string
  title: string
  status: string
}

// The four parent-linkable kinds, each mapped to its create recordType + label.
const CREATE_KINDS: { recordType: LinkRecordType; label: string }[] = [
  { recordType: "task", label: "Task" },
  { recordType: "service_request", label: "Service request" },
  { recordType: "risk", label: "Risk" },
  { recordType: "issue", label: "Issue" },
]

export function ParentLinkedRecords({
  entityType,
  entityId,
  entityLabel,
  canManage,
  onOpenTask,
}: {
  entityType: ParentEntityType
  entityId: string
  entityLabel: string
  canManage: boolean
  // When provided, a linked Task row calls this (e.g. the Asset page's quick-detail
  // modal) instead of navigating away. Other types always navigate to their detail.
  onOpenTask?: (id: string) => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)
  const [createType, setCreateType] = React.useState<LinkRecordType | null>(null)
  const [linkOpen, setLinkOpen] = React.useState(false)
  const [unlinkingId, setUnlinkingId] = React.useState<string | null>(null)
  const [view, setView] = React.useState<"live" | "history">("live")

  const params = { linkedEntityType: entityType, linkedEntityId: entityId }
  const base = parentLinkedBase(entityType, entityId)

  const tasks = useQuery({
    queryKey: parentLinkedKey(entityType, entityId, "task"),
    queryFn: async () => (await api.get<LinkedTask[]>("/tasks", { params })).data,
  })
  const srs = useQuery({
    queryKey: parentLinkedKey(entityType, entityId, "sr"),
    queryFn: async () => (await api.get<LinkedServiceRequest[]>("/service-requests", { params })).data,
  })
  const risks = useQuery({
    queryKey: parentLinkedKey(entityType, entityId, "risk"),
    queryFn: async () => (await api.get<LinkedRisk[]>("/risks", { params })).data,
  })
  const issues = useQuery({
    queryKey: parentLinkedKey(entityType, entityId, "issue"),
    queryFn: async () => (await api.get<LinkedIssue[]>("/issues", { params })).data,
  })

  // Merge into one list, grouped by kind order (icon distinguishes the type).
  const rows = React.useMemo<LinkedRow[]>(() => [
    ...(tasks.data ?? []).map((t) => ({ visualType: "task" as const, id: t.id, reference: t.reference, title: t.title, status: t.status })),
    ...(srs.data ?? []).map((s) => ({ visualType: "service_request" as const, id: s.id, reference: s.reference, title: s.subject, status: s.status })),
    ...(risks.data ?? []).map((r) => ({ visualType: "risk" as const, id: r.id, reference: r.reference, title: r.title, status: r.status })),
    ...(issues.data ?? []).map((i) => ({ visualType: "issue" as const, id: i.id, reference: i.reference, title: i.title, status: i.status })),
  ], [tasks.data, srs.data, risks.data, issues.data])

  // Split into Live (active) and History (terminal-status) so closed records stay
  // accessible without cluttering active work. The shown list follows the sub-tab.
  const { live, historical } = React.useMemo(() => partitionByHistory(rows, (r) => r.status), [rows])
  const shown = view === "live" ? live : historical

  function openCreate(recordType: LinkRecordType) {
    setMenuAnchor(null)
    setCreateType(recordType)
  }

  async function handleUnlink(childType: LinkRecordType, childId: string) {
    setUnlinkingId(childId)
    try {
      await clearParentLink(childType, childId)
      notify.success("Record unlinked")
      await qc.invalidateQueries({ queryKey: base })
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to unlink record")
    } finally {
      setUnlinkingId(null)
    }
  }

  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
      {/* Header — label + create control */}
      <Stack direction="row" alignItems="center" sx={{ px: "16px", py: "10px", borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography sx={{ flex: 1, fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "text.secondary" }}>
          Linked records ({rows.length})
        </Typography>
        {canManage ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button
              size="small"
              startIcon={<LinkIcon sx={{ fontSize: 14 }} />}
              onClick={() => setLinkOpen(true)}
              sx={{ textTransform: "none", fontSize: 11.5, "& .MuiButton-startIcon": { mr: 0.5 } }}
            >
              Link existing
            </Button>
            <Button
              size="small"
              startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              endIcon={<ArrowDropDownIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{ textTransform: "none", fontSize: 11.5, "& .MuiButton-startIcon": { mr: 0.5 }, "& .MuiButton-endIcon": { ml: 0.25 } }}
            >
              New linked record
            </Button>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
              {CREATE_KINDS.map(({ recordType, label }) => {
                const v = visualForType(recordType)
                const Icon = v.Icon
                return (
                  <MenuItem key={recordType} onClick={() => openCreate(recordType)} sx={{ fontSize: 13, minHeight: 34 }}>
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      <Box sx={{ width: 22, height: 22, borderRadius: 0.75, bgcolor: v.bg, color: v.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon sx={{ fontSize: 13 }} />
                      </Box>
                    </ListItemIcon>
                    {label}
                  </MenuItem>
                )
              })}
            </Menu>
          </Stack>
        ) : null}
      </Stack>

      {/* Row list — the unified LinkedRecordsContent visual language. */}
      {rows.length === 0 ? (
        <Box sx={{ px: "16px", py: "16px" }}>
          <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>No linked records</Typography>
        </Box>
      ) : (
        <>
          {/* Live / History sub-tabs — closed records live under History, one click away. */}
          <Stack direction="row" sx={{ px: "10px", borderBottom: "1px solid", borderColor: "divider" }}>
            {(["live", "history"] as const).map((v) => {
              const active = view === v
              const count = v === "live" ? live.length : historical.length
              return (
                <Box
                  key={v}
                  onClick={() => setView(v)}
                  sx={{
                    px: "10px", py: "8px", cursor: "pointer", fontSize: 12, fontWeight: 500, mb: "-1px",
                    color: active ? "primary.main" : "text.secondary",
                    borderBottom: "2px solid", borderBottomColor: active ? "primary.main" : "transparent",
                    display: "flex", alignItems: "center", gap: "6px",
                  }}
                >
                  {v === "live" ? "Live" : "History"}
                  <Box sx={{ px: "5px", py: "1px", borderRadius: "4px", fontSize: 10, fontWeight: 600, bgcolor: active ? "action.selected" : "action.hover", color: active ? "primary.main" : "text.secondary" }}>
                    {count}
                  </Box>
                </Box>
              )
            })}
          </Stack>

          {shown.length === 0 ? (
            <Box sx={{ px: "16px", py: "16px" }}>
              <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>
                {view === "live" ? "No live linked records" : "No historical linked records"}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ p: "6px" }}>
              {shown.map((row) => {
                return (
                  <Stack
                key={`${row.visualType}:${row.id}`}
                direction="row"
                alignItems="center"
                spacing={1.25}
                onClick={() =>
                  row.visualType === "task" && onOpenTask
                    ? onOpenTask(row.id)
                    : navigate(routeForLink({ type: row.visualType, id: row.id }))
                }
                sx={{ px: "10px", py: "8px", borderRadius: "8px", cursor: "pointer", "&:hover": { bgcolor: "action.hover" }, "&:hover .rl-unlink": { opacity: 1 } }}
              >
                <RecordTypeBadge type={row.visualType} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.title}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: "text.tertiary", fontFamily: "monospace" }}>
                    {row.reference}
                  </Typography>
                </Box>
                <StatusPill value={row.status} label={String(row.status).toLowerCase().replaceAll("_", " ")} size="sm" />
                {canManage ? (
                  <Tooltip title="Unlink from this record">
                    <IconButton
                      className="rl-unlink"
                      size="small"
                      disabled={unlinkingId === row.id}
                      onClick={(e) => { e.stopPropagation(); handleUnlink(row.visualType, row.id) }}
                      sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0, p: 0.25 }}
                    >
                      <LinkOffIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </Stack>
                )
              })}
            </Box>
          )}
        </>
      )}

      {/* Create — one shared surface; recordType switches per menu choice. Stays on
          this page (navigateAfterCreate=false) and refreshes just this entity's lists. */}
      {createType ? (
        <CreateRecordModal
          recordType={createType}
          open
          onClose={() => setCreateType(null)}
          navigateAfterCreate={false}
          linkedEntityType={entityType}
          linkedEntityId={entityId}
          linkedEntityLabel={entityLabel}
          onSuccess={async () => { await qc.invalidateQueries({ queryKey: base }) }}
        />
      ) : null}

      {/* Link an EXISTING work item to this parent (track 2). */}
      <LinkExistingDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        parentType={entityType}
        parentId={entityId}
        parentLabel={entityLabel}
        existingIds={rows.map((r) => r.id)}
        onLinked={async () => { await qc.invalidateQueries({ queryKey: base }) }}
      />
    </Box>
  )
}
