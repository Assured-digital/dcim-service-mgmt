import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import LinkIcon from "@mui/icons-material/Link"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import PersonIcon from "@mui/icons-material/Person"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import EventIcon from "@mui/icons-material/Event"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import LockIcon from "@mui/icons-material/Lock"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
import StorageIcon from "@mui/icons-material/Storage"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import BuildIcon from "@mui/icons-material/Build"
import { ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useActivityFilter } from "../lib/useActivityFilter"
import {
  SlimExpandCommentBox,
  ActivityFeedItem,
  ActivityTabs,
  EditableField as InlineEditable,
  RecordDetailShell,
  SectionPanel,
  StatusPopover,
  filterFeedEvents,
  type ActivityFilter,
  type CommentDraft,
  type CentreSection,
  type DetailField,
  type FeedEvent,
  type MoreMenuItem,
  type PopoverOption,
  type RecordMetadata,
  type RightSection,
  type StatusConfig,
  type StatusOption,
} from "../components/detail"
import { useBreadcrumb } from "./Shell"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { userLabel } from "../lib/userDisplay"
import { type AttachmentsHandle } from "../components/AttachmentsContent"
import { DocumentsPanel } from "../components/DocumentsPanel"
import type { AttachmentSummary } from "../lib/attachments"
import { statusColors, accentToken, type ThemeMode } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import { type AuditEvent } from "../lib/auditEvents"
import { AuditHistoryList } from "../components/AuditHistoryList"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type MaintenanceRecord = {
  id: string
  workType: string
  workTypeOther: string | null
  performedAt: string
  nextDueAt: string | null
  notes: string | null
  performedById: string | null
  performedBy: { id: string; displayName: string } | null
  asset: {
    id: string
    assetTag: string
    name: string
    site: { id: string; name: string } | null
  }
  createdAt?: string
  updatedAt?: string
  attachments?: AttachmentSummary[]
}

type AssetOption = { id: string; assetTag: string; name: string }

interface LinkedEntity {
  type: string
  id: string
  label: string
}

type EditableField =
  | "workType"
  | "workTypeOther"
  | "notes"
  | "performedById"
  | "performedAt"
  | "nextDueAt"

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.7
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PLANNED: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  SCHEDULED: <EventIcon sx={{ fontSize: 14 }} />,
  IN_PROGRESS: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  COMPLETED: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  CLOSED: <LockIcon sx={{ fontSize: 14 }} />,
  CANCELLED: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
}

// Built per-render with the active mode (statusColors light branch is unchanged).
function buildMaintenanceStatusConfig(mode: ThemeMode): StatusConfig {
  return {
    options: ["PLANNED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CLOSED"].map<StatusOption>(
      (value) => ({
        value,
        label: STATUS_LABELS[value],
        badgeClass: `b-${value.toLowerCase()}`,
        bg: statusColors(value, mode).bg,
        iconColor: statusColors(value, mode).text,
        icon: STATUS_ICONS[value],
        buttonIcon: STATUS_ICONS[value],
      })
    ),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Work type config
// ─────────────────────────────────────────────────────────────────────────────

const WORK_TYPES = [
  "INSPECTION",
  "PSU_REPLACEMENT",
  "FIRMWARE_UPGRADE",
  "PAT_INSPECTION",
  "COOLING_CHECK",
  "CABLE_AUDIT",
  "REPAIR",
  "UPGRADE",
  "OTHER",
] as const

const WORK_TYPE_LABELS: Record<string, string> = {
  INSPECTION: "Inspection",
  PSU_REPLACEMENT: "PSU replacement",
  FIRMWARE_UPGRADE: "Firmware upgrade",
  PAT_INSPECTION: "PAT inspection",
  COOLING_CHECK: "Cooling check",
  CABLE_AUDIT: "Cable audit",
  REPAIR: "Repair",
  UPGRADE: "Upgrade",
  OTHER: "Other",
}

function buildWorkTypeOptions(mode: ThemeMode): PopoverOption[] {
  const tone = accentToken("blue", mode)
  return WORK_TYPES.map((value) => ({
    value,
    label: WORK_TYPE_LABELS[value],
    iconBg: tone.bg,
    iconColor: tone.text,
    icon: <BuildIcon sx={{ fontSize: 14 }} />,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — spec section 3.3
// ─────────────────────────────────────────────────────────────────────────────

// Maintenance identity badge — the neutral accent wash (light = the prior literals).
function maintenanceTypeBadge(mode: ThemeMode) {
  const a = accentToken("neutral", mode)
  return (
    <Box
      component="span"
      sx={{
        fontSize: 10,
        fontWeight: 500,
        bgcolor: a.bg,
        color: a.text,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        letterSpacing: "0.04em",
      }}
    >
      MNT
    </Box>
  )
}

// Linked record kind visuals (asset is the only linked entity for maintenance)
type LinkedEntityKind = "asset" | "site" | "default"

interface LinkedEntityVisual {
  Icon: React.ComponentType<{ sx?: object }>
  bg: string
  fg: string
  label: string
}

// Icon + label are mode-invariant; the tinted bg/fg flip with mode (asset = blue,
// site = green accent washes; default = the terminal slate). Light = the prior literals.
const LINKED_ENTITY_META: Record<LinkedEntityKind, { Icon: LinkedEntityVisual["Icon"]; label: string }> = {
  asset: { Icon: StorageIcon, label: "ASSET" },
  site: { Icon: LocationOnIcon, label: "SITE" },
  default: { Icon: LinkIcon, label: "REF" },
}

function linkedEntityVisual(kind: LinkedEntityKind, mode: ThemeMode): LinkedEntityVisual {
  const tone =
    kind === "asset" ? accentToken("blue", mode) :
    kind === "site" ? accentToken("green", mode) :
    (mode === "dark" ? { bg: "#1e293b", text: "#94a3b8" } : { bg: "#eef2f6", text: "#475569" })
  const meta = LINKED_ENTITY_META[kind]
  return { Icon: meta.Icon, bg: tone.bg, fg: tone.text, label: meta.label }
}

function entityKindFromType(value?: string | null): LinkedEntityKind {
  if (!value) return "default"
  const v = value.toLowerCase()
  if (v === "asset") return "asset"
  if (v === "site") return "site"
  return "default"
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message)) return message.join(", ")
  }
  return fallback
}

function deriveStatus(record: MaintenanceRecord): string {
  const performed = new Date(record.performedAt).getTime()
  if (Number.isFinite(performed) && performed > Date.now()) return "SCHEDULED"
  return "COMPLETED"
}


// ─────────────────────────────────────────────────────────────────────────────
// Title card (spec section 5.1)
// Maintenance has no editable title/description fields in its data model — we
// render the asset name and site as a static summary in the title slot.
// ─────────────────────────────────────────────────────────────────────────────

interface MaintenanceTitleCardProps {
  assetName: string
  assetTag: string
  siteName: string | null
}

const MaintenanceTitleCard = React.memo(function MaintenanceTitleCard({
  assetName,
  assetTag,
  siteName,
}: MaintenanceTitleCardProps) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography
        variant="caption"
        color="text.tertiary"
        sx={{ fontWeight: 500, display: "block", mb: 0.5 }}
      >
        Subject
      </Typography>
      <Typography
        sx={{
          fontSize: "1.25rem",
          fontWeight: 500,
          lineHeight: 1.6,
          fontFamily: "'Space Grotesk', sans-serif",
          color: "text.primary",
        }}
      >
        {assetName}
      </Typography>

      <Typography
        variant="caption"
        color="text.tertiary"
        sx={{ fontWeight: 500, display: "block", mt: 1.5, mb: 0.5 }}
      >
        Description
      </Typography>
      <Typography
        sx={{ fontSize: "0.8125rem", lineHeight: 1.5, color: "text.secondary" }}
      >
        {assetTag}
        {siteName ? ` · ${siteName}` : ""}
      </Typography>
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Work details section (spec 9.7 — work type + notes inline editable)
// ─────────────────────────────────────────────────────────────────────────────

interface WorkDetailsContentProps {
  workType: string
  workTypeOther: string
  notes: string
  performedAt: string
  nextDueAt: string | null
  performedByLabel: string
  onSelectWorkType: (value: string) => void
  onCommitWorkTypeOther: (value: string) => void
  onCommitNotes: (value: string) => void
}

const WorkDetailsContent = React.memo(function WorkDetailsContent({
  workType,
  workTypeOther,
  notes,
  performedAt,
  nextDueAt,
  performedByLabel,
  onSelectWorkType,
  onCommitWorkTypeOther,
  onCommitNotes,
}: WorkDetailsContentProps) {
  const { mode } = useThemeMode()
  const workTypeOptions = React.useMemo(() => buildWorkTypeOptions(mode), [mode])
  const workTypeTone = accentToken("blue", mode)
  const anchorRef = React.useRef<HTMLButtonElement | null>(null)
  const [open, setOpen] = React.useState(false)
  const handleOpen = React.useCallback(() => setOpen(true), [])
  const handleClose = React.useCallback(() => setOpen(false), [])
  const handleSelect = React.useCallback(
    (value: string) => {
      onSelectWorkType(value)
      setOpen(false)
    },
    [onSelectWorkType]
  )

  const workTypeLabel = WORK_TYPE_LABELS[workType] ?? workType

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <Typography
          variant="caption"
          color="text.tertiary"
          sx={{ fontWeight: 500, display: "block", mb: 0.5 }}
        >
          Work type
        </Typography>
        <Box sx={{ pl: 0.75, py: 0.5 }}>
          <Box
            component="button"
            ref={anchorRef}
            onClick={handleOpen}
            sx={{
              all: "unset",
              cursor: "pointer",
              bgcolor: workTypeTone.bg,
              color: workTypeTone.text,
              fontSize: 11,
              fontWeight: 500,
              px: 1,
              py: 0.25,
              borderRadius: 1,
            }}
          >
            {workTypeLabel}
          </Box>
        </Box>
        <StatusPopover
          id="maintenance-work-type"
          header="Work type"
          options={workTypeOptions}
          currentValue={workType}
          onSelect={handleSelect}
          anchorEl={anchorRef.current}
          open={open}
          onClose={handleClose}
        />
      </Box>

      {workType === "OTHER" ? (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            color="text.tertiary"
            sx={{ fontWeight: 500, display: "block", mb: 0.5 }}
          >
            Custom work type
          </Typography>
          <InlineEditable
            value={workTypeOther}
            placeholder="Describe the work"
            commit="blur"
            ariaLabel="Custom work type"
            onSave={onCommitWorkTypeOther}
            textSx={{
              fontSize: "0.8125rem",
              lineHeight: 1.5,
              color: "text.secondary",
            }}
          />
        </Box>
      ) : null}

      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 1.5, px: 0.75, flexWrap: "wrap", rowGap: 0.5 }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Typography variant="caption" color="text.tertiary" sx={{ fontWeight: 500 }}>
            Performed
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(performedAt)}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Typography variant="caption" color="text.tertiary" sx={{ fontWeight: 500 }}>
            Next due
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDate(nextDueAt)}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Typography variant="caption" color="text.tertiary" sx={{ fontWeight: 500 }}>
            Performed by
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {performedByLabel}
          </Typography>
        </Stack>
      </Stack>

      <Box>
        <Typography
          variant="caption"
          color="text.tertiary"
          sx={{ fontWeight: 500, display: "block", mb: 0.5 }}
        >
          Notes
        </Typography>
        <InlineEditable
          value={notes}
          placeholder="Add maintenance notes"
          multiline
          allowEmpty
          commit="blur"
          ariaLabel="Maintenance notes"
          onSave={onCommitNotes}
          textSx={{
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            color: "text.secondary",
          }}
        />
      </Box>
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Linked records section (spec 7.4)
// ─────────────────────────────────────────────────────────────────────────────

interface LinkedRecordsContentProps {
  entities: LinkedEntity[]
  onAddLink: () => void
  // Inline "Link record" button below the list. The shell page hoists the add
  // action to the section header "+", so it passes false.
  showAddButton?: boolean
}

const LinkedRecordsContent = React.memo(function LinkedRecordsContent({
  entities,
  onAddLink,
  showAddButton = true,
}: LinkedRecordsContentProps) {
  const { mode } = useThemeMode()
  return (
    <Box>
      {entities.length === 0 ? (
        <Typography variant="caption" sx={{ color: "text.tertiary" }}>
          No linked records
        </Typography>
      ) : (
        entities.map((entity) => {
          const visual = linkedEntityVisual(entityKindFromType(entity.type), mode)
          const Icon = visual.Icon
          return (
            <Box
              key={`${entity.type}-${entity.id}`}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 0.625,
                borderRadius: 1,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: 1,
                  bgcolor: visual.bg,
                  color: visual.fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon sx={{ fontSize: 14 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 12,
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "text.primary",
                  }}
                >
                  {entity.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: "text.tertiary",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {visual.label}
                </Typography>
              </Box>
            </Box>
          )
        })
      )}
      {showAddButton ? (
        <Button
          variant="text"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={onAddLink}
          sx={{ textTransform: "none", mt: 0.25 }}
        >
          Link record
        </Button>
      ) : null}
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Activity section (spec section 6). Comments are empty for maintenance until the
// backend wires comments (compose box hidden — no comments mutation). History
// renders the audit stream directly via AuditHistoryList; maintenance emits no
// audit events yet, so it shows the empty state until 1b adds them.
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityContentProps {
  events: FeedEvent[]
  auditEvents: AuditEvent[]
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  composeEnabled: boolean
  savingNote: boolean
  onPostNote: (draft: CommentDraft) => void | Promise<void>
}

const ActivityContent = React.memo(function ActivityContent({
  events,
  auditEvents,
  activeFilter,
  onFilterChange,
  composeEnabled,
  savingNote,
  onPostNote,
}: ActivityContentProps) {
  const { mode } = useThemeMode()
  const [visibleCount, setVisibleCount] = React.useState(10)

  const handleFilterChange = React.useCallback(
    (filter: ActivityFilter) => {
      setVisibleCount(10)
      onFilterChange(filter)
    },
    [onFilterChange]
  )

  const handleLoadMore = React.useCallback(
    () => setVisibleCount((c) => c + 10),
    []
  )

  const isHistory = activeFilter === "all"
  const total = isHistory ? auditEvents.length : events.length
  const visibleEvents = events.slice(0, visibleCount)

  return (
    <Box>
      <ActivityTabs value={activeFilter} onChange={handleFilterChange} />

      {composeEnabled && activeFilter === "comment" ? (
        <SlimExpandCommentBox saving={savingNote} onPost={onPostNote} />
      ) : null}

      {total === 0 ? (
        <Typography variant="caption" sx={{ color: "text.tertiary" }}>
          No activity to show
        </Typography>
      ) : isHistory ? (
        <AuditHistoryList events={auditEvents.slice(0, visibleCount)} recordNoun="maintenance record" />
      ) : (
        visibleEvents.map((event, idx) => (
          <ActivityFeedItem key={event.id} event={event} isLast={idx === visibleEvents.length - 1} mode={mode} />
        ))
      )}

      {visibleCount < total && (
        <Box sx={{ pt: 1.5, display: "flex", justifyContent: "center" }}>
          <Button
            variant="text"
            size="small"
            onClick={handleLoadMore}
            sx={{ color: "text.secondary", fontSize: 12 }}
          >
            Load more ({total - visibleCount} remaining)
          </Button>
        </Box>
      )}
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function MaintenanceDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { mode } = useThemeMode()
  const maintenanceStatusConfig = React.useMemo(() => buildMaintenanceStatusConfig(mode), [mode])
  const { setPageFullBleed } = useBreadcrumb()

  // Render flush in the Shell content area (no surrounding padding/frame), matching
  // the Service Request detail page, whose ServiceDeskPage wrapper sets this.
  React.useEffect(() => {
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [setPageFullBleed])

  const canManage = hasAnyRole([
    ...ORG_SUPER_ROLES,
    ROLES.SERVICE_MANAGER,
    ROLES.SERVICE_DESK_ANALYST,
    ROLES.ENGINEER,
  ])
  const canDelete = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])

  const { activeFilter, handleFilterChange } = useActivityFilter()

  const [error, setError] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)
  const [linkCopied, setLinkCopied] = React.useState(false)
  const [workDetailsOpen, setWorkDetailsOpen] = React.useState(true)
  const [savingNote] = React.useState(false)

  // ── Queries (preserved exactly) ────────────────────────────────────────────

  const record = useQuery({
    queryKey: ["maintenance", id],
    queryFn: async () => (await api.get<MaintenanceRecord>(`/maintenance/${id}`)).data,
    enabled: !!id,
  })

  const assets = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await api.get<AssetOption[]>("/assets")).data,
  })

  // Assignee picker source ("Performed by") — operational-callable &
  // client-scoped, replacing admin-only GET /users. value = id, label = displayName.
  // performedByLabel below still reads the embedded performedBy first and only
  // falls back to this list, so existing records resolve regardless.
  const users = useAssignableUsers()

  // Audit stream for the History tab. Maintenance emits no audit events yet, so this
  // currently returns []; it lights up automatically when 1b wires maintenance audit.
  const { data: auditEvents } = useQuery({
    queryKey: ["audit-maintenance", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/Maintenance/${id}`)).data,
    enabled: !!id,
  })

  // ── Mutations (preserved exactly) ──────────────────────────────────────────

  const handleFieldChange = React.useCallback(
    async (field: EditableField, value: string | null) => {
      if (!id) return
      setError("")
      try {
        await api.put(`/maintenance/${id}`, { [field]: value })
        qc.invalidateQueries({ queryKey: ["maintenance"] })
        qc.invalidateQueries({ queryKey: ["maintenance", id] })
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, "Failed to save maintenance record"))
      }
    },
    [id, qc]
  )

  // Commit path for the pending-confirm Details popover field (performed by). Unlike
  // handleFieldChange it does NOT swallow errors — the shell awaits this on ✓ and
  // owns the success/error toast + pending state.
  const commitDetailField = React.useCallback(
    async (field: EditableField, value: string | null) => {
      await api.put(`/maintenance/${id}`, { [field]: value })
      await qc.invalidateQueries({ queryKey: ["maintenance", id] })
      qc.invalidateQueries({ queryKey: ["maintenance"] })
    },
    [id, qc]
  )

  const handleDelete = React.useCallback(async () => {
    if (!id) return
    setDeleting(true)
    setError("")
    try {
      await api.delete(`/maintenance/${id}`)
      await qc.invalidateQueries({ queryKey: ["maintenance"] })
      navigate("/maintenance")
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to delete maintenance record"))
    } finally {
      setDeleting(false)
    }
  }, [id, qc, navigate])

  const handleStatusChange = React.useCallback(() => {
    // Maintenance records have no backend status field; status is derived from
    // performedAt. The status button is informational — selections are no-ops.
  }, [])

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Field commit handlers ──────────────────────────────────────────────────

  const handleSelectWorkType = React.useCallback(
    (value: string) => handleFieldChange("workType", value),
    [handleFieldChange]
  )
  const handleCommitWorkTypeOther = React.useCallback(
    (value: string) => handleFieldChange("workTypeOther", value),
    [handleFieldChange]
  )
  const handleCommitNotes = React.useCallback(
    (value: string) => handleFieldChange("notes", value),
    [handleFieldChange]
  )
  const handleSelectPerformedBy = React.useCallback(
    (value: string) => commitDetailField("performedById", value === "" ? null : value),
    [commitDetailField]
  )

  // ── Activity (no audit/comments query for maintenance — empty feed) ────────

  const handleAddNote = React.useCallback((_draft: CommentDraft) => {
    // No comments mutation wired for maintenance; compose is hidden.
  }, [])

  const allFeedEvents = React.useMemo<FeedEvent[]>(() => [], [])
  const visibleFeedEvents = React.useMemo<FeedEvent[]>(() => {
    return filterFeedEvents(allFeedEvents, activeFilter)
  }, [allFeedEvents, activeFilter])

  // ── Link copy ──────────────────────────────────────────────────────────────

  const handleCopyLink = React.useCallback(() => {
    const href = window.location.href
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(href).then(() => setLinkCopied(true))
    } else {
      setLinkCopied(true)
    }
  }, [])

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  const handleAddLink = React.useCallback(() => {
    // TODO: link entity dialog
  }, [])
  // Lets the Attachments section-header "+" open the (encapsulated) file picker.
  const attachRef = React.useRef<AttachmentsHandle>(null)

  // ── Derived ────────────────────────────────────────────────────────────────

  const recordData = record.data

  const performedByLabel = React.useMemo(() => {
    if (!recordData) return "—"
    if (recordData.performedBy?.displayName) return recordData.performedBy.displayName
    if (recordData.performedById && users.data) {
      const match = users.data.find((u) => u.id === recordData.performedById)
      if (match) return match.displayName
    }
    return "Unassigned"
  }, [recordData, users.data])

  const usersOptions = React.useMemo<PopoverOption[]>(() => {
    const assigned = accentToken("green", mode)
    const unassigned = accentToken("neutral", mode)
    const list: PopoverOption[] = (users.data ?? []).map((u) => ({
      value: u.id,
      label: u.displayName,
      iconBg: assigned.bg,
      iconColor: assigned.text,
      icon: <PersonIcon sx={{ fontSize: 14 }} />,
    }))
    return [
      {
        value: "",
        label: "Unassigned",
        iconBg: unassigned.bg,
        iconColor: unassigned.text,
        icon: <PersonIcon sx={{ fontSize: 14 }} />,
      },
      ...list,
    ]
  }, [users.data, mode])

  const linkedEntities = React.useMemo<LinkedEntity[]>(() => {
    if (!recordData) return []
    const entries: LinkedEntity[] = [
      {
        type: "asset",
        id: recordData.asset.id,
        label: `${recordData.asset.assetTag} · ${recordData.asset.name}`,
      },
    ]
    if (recordData.asset.site) {
      entries.push({
        type: "site",
        id: recordData.asset.site.id,
        label: recordData.asset.site.name,
      })
    }
    return entries
  }, [recordData])

  const currentStatus = React.useMemo(() => {
    if (!recordData) return "COMPLETED"
    return deriveStatus(recordData)
  }, [recordData])

  // ── More menu ──────────────────────────────────────────────────────────────

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(() => {
    const items: MoreMenuItem[] = [
      {
        label: "Copy link",
        icon: <ContentCopyIcon sx={{ fontSize: 14 }} />,
        onClick: handleCopyLink,
      },
    ]
    if (canDelete) {
      items.push({
        label: deleting ? "Cancelling…" : "Cancel maintenance",
        icon: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: handleDelete,
        danger: true,
      })
    }
    return items
  }, [handleCopyLink, handleDelete, canDelete, deleting])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!recordData) return []
    const valueWrapperSx = {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      textAlign: "right",
      gap: 0.5,
    } as const
    return [
      {
        key: "type",
        label: "Type",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography variant="body2" color="text.secondary">
              Maintenance
            </Typography>
          </Box>
        ),
      },
      {
        key: "asset",
        label: "Asset",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Chip
              size="small"
              label={recordData.asset.assetTag}
              sx={{
                bgcolor: accentToken("blue", mode).bg,
                color: accentToken("blue", mode).text,
                fontWeight: 600,
                fontSize: 11,
                height: 20,
              }}
            />
          </Box>
        ),
      },
      {
        key: "performedAt",
        label: "Performed",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {formatDate(recordData.performedAt)}
            </Typography>
          </Box>
        ),
      },
      {
        key: "nextDueAt",
        label: "Next due",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {formatDate(recordData.nextDueAt)}
            </Typography>
          </Box>
        ),
      },
      {
        key: "performedById",
        label: "Performed by",
        editable: canManage,
        currentValue: recordData.performedById ?? "",
        popoverOptions: canManage ? usersOptions : undefined,
        onSelect: canManage ? handleSelectPerformedBy : undefined,
        value: (
          <Box sx={valueWrapperSx}>
            {recordData.performedBy ? (
              <Typography sx={{ fontSize: 12 }}>{userLabel(recordData.performedBy)}</Typography>
            ) : (
              <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>
                Unassigned
              </Typography>
            )}
          </Box>
        ),
      },
    ]
  }, [recordData, canManage, usersOptions, handleSelectPerformedBy, mode])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!recordData) return []
    return [
      {
        id: "work-details",
        title: "",
        flush: true,
        content: (
          <Box sx={{ mb: 0 }}>
            <Divider sx={{ my: 2.5 }} />
            <Box
              onClick={() => setWorkDetailsOpen((o) => !o)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                cursor: "pointer",
                mb: 1,
                userSelect: "none",
                width: "fit-content",
              }}
            >
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  color: "text.secondary",
                  transform: workDetailsOpen ? "none" : "rotate(-90deg)",
                  transition: "transform .15s",
                }}
              />
              <Typography variant="caption" fontWeight={500} color="text.secondary">
                Work details
              </Typography>
            </Box>
            {workDetailsOpen && (
              <WorkDetailsContent
                workType={recordData.workType}
                workTypeOther={recordData.workTypeOther ?? ""}
                notes={recordData.notes ?? ""}
                performedAt={recordData.performedAt}
                nextDueAt={recordData.nextDueAt}
                performedByLabel={performedByLabel}
                onSelectWorkType={handleSelectWorkType}
                onCommitWorkTypeOther={handleCommitWorkTypeOther}
                onCommitNotes={handleCommitNotes}
              />
            )}
          </Box>
        ),
      },
      {
        id: "activity",
        title: "",
        flush: true,
        content: (
          <SectionPanel title="Activity">
            <ActivityContent
              events={visibleFeedEvents}
              auditEvents={auditEvents ?? []}
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              composeEnabled={false}
              savingNote={savingNote}
              onPostNote={handleAddNote}
            />
          </SectionPanel>
        ),
      },
    ]
  }, [
    recordData,
    workDetailsOpen,
    performedByLabel,
    handleSelectWorkType,
    handleCommitWorkTypeOther,
    handleCommitNotes,
    visibleFeedEvents,
    auditEvents,
    activeFilter,
    handleFilterChange,
    savingNote,
    handleAddNote,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!recordData) return undefined
    return {
      submittedBy: recordData.performedBy?.displayName ?? null,
      createdAt: recordData.createdAt ?? recordData.performedAt,
      updatedAt: recordData.updatedAt ?? recordData.performedAt,
    }
  }, [recordData])

  const rightSections = React.useMemo<RightSection[]>(() => {
    return [
      {
        id: "attachments",
        title: "Documents",
        defaultOpen: false,
        headerAdd: { onClick: () => attachRef.current?.openPicker(), tooltip: "Attach file" },
        content: (
          <DocumentsPanel
            ref={attachRef}
            attachments={recordData?.attachments ?? []}
            recordType="maintenance"
            recordId={recordData?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["maintenance", id] })}
            showAddButton={false}
          />
        ),
      },
      {
        id: "linked",
        title: "Linked records",
        defaultOpen: false,
        headerAdd: { onClick: handleAddLink, tooltip: "Link record" },
        content: (
          <LinkedRecordsContent
            entities={linkedEntities}
            onAddLink={handleAddLink}
            showAddButton={false}
          />
        ),
      },
    ]
  }, [
    recordData,
    qc,
    id,
    linkedEntities,
    handleAddLink,
  ])

  // The assets query is preserved from the previous render layer; its data
  // is no longer rendered now that the edit dialog is gone, but the query is
  // intentionally retained so the cache stays warm for any future use.
  void assets

  // ── Render ─────────────────────────────────────────────────────────────────

  if (record.isLoading) return <LoadingState />
  if (!record.data) return <ErrorState title="Maintenance record not found" />

  return (
    <>
      {error ? (
        <Box sx={{ px: 3, pt: 2 }}>
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        </Box>
      ) : null}

      <RecordDetailShell
        backLabel="Back"
        onBack={handleBack}
        recordRef={record.data.asset.assetTag}
        typeBadge={maintenanceTypeBadge(mode)}
        currentStatus={currentStatus}
        statusConfig={maintenanceStatusConfig}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <MaintenanceTitleCard
            assetName={record.data.asset.name}
            assetTag={record.data.asset.assetTag}
            siteName={record.data.asset.site?.name ?? null}
          />
        }
        sections={sections}
        detailFields={detailFields}
        metadata={metadata}
        rightSections={rightSections}
      />

      <Snackbar
        open={linkCopied}
        autoHideDuration={2000}
        onClose={handleLinkSnackbarClose}
        message="Link copied"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  )
}
