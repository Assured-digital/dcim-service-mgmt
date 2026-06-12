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
import AttachFileIcon from "@mui/icons-material/AttachFile"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
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
  ActivityCommentBox,
  ActivityTabs,
  RecordDetailShell,
  SectionPanel,
  StatusPopover,
  type ActivityFilter,
  type CentreSection,
  type DetailField,
  type MoreMenuItem,
  type PopoverOption,
  type RecordMetadata,
  type RightSection,
  type StatusConfig,
  type StatusOption,
} from "../components/detail"
import { useBreadcrumb } from "./Shell"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
import type { AttachmentSummary } from "../lib/attachments"

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
  performedBy: { id: string; email: string } | null
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

type FeedEventType = "status" | "comment" | "assignment" | "link"

type FeedEvent = {
  id: string
  type: FeedEventType
  actor: string
  text: React.ReactNode
  note?: string
  time: string
  createdAt: string
}

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

const STATUS_COLOURS: Record<string, { bg: string; text: string }> = {
  PLANNED: { bg: "#f1efe8", text: "#5f5e5a" },
  SCHEDULED: { bg: "#faeeda", text: "#854f0b" },
  IN_PROGRESS: { bg: "#e6f1fb", text: "#185fa5" },
  COMPLETED: { bg: "#eaf3de", text: "#3b6d11" },
  CLOSED: { bg: "#f1efe8", text: "#5f5e5a" },
  CANCELLED: { bg: "#fcebeb", text: "#a32d2d" },
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PLANNED: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  SCHEDULED: <EventIcon sx={{ fontSize: 14 }} />,
  IN_PROGRESS: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  COMPLETED: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  CLOSED: <LockIcon sx={{ fontSize: 14 }} />,
  CANCELLED: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
}

const MAINTENANCE_STATUS_CONFIG: StatusConfig = {
  options: ["PLANNED", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CLOSED"].map<StatusOption>(
    (value) => ({
      value,
      label: STATUS_LABELS[value],
      badgeClass: `b-${value.toLowerCase()}`,
      bg: STATUS_COLOURS[value].bg,
      iconColor: STATUS_COLOURS[value].text,
      icon: STATUS_ICONS[value],
      buttonIcon: STATUS_ICONS[value],
    })
  ),
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

const WORK_TYPE_OPTIONS: PopoverOption[] = WORK_TYPES.map((value) => ({
  value,
  label: WORK_TYPE_LABELS[value],
  iconBg: "#e6f1fb",
  iconColor: "#185fa5",
  icon: <BuildIcon sx={{ fontSize: 14 }} />,
}))

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — spec section 3.3
// ─────────────────────────────────────────────────────────────────────────────

const MAINTENANCE_TYPE_BADGE = (
  <Box
    component="span"
    sx={{
      fontSize: 10,
      fontWeight: 500,
      bgcolor: "#f1efe8",
      color: "#5f5e5a",
      px: 1,
      py: 0.25,
      borderRadius: 1,
      letterSpacing: "0.04em",
    }}
  >
    MNT
  </Box>
)

// Linked record kind visuals (asset is the only linked entity for maintenance)
type LinkedEntityKind = "asset" | "site" | "default"

interface LinkedEntityVisual {
  Icon: React.ComponentType<{ sx?: object }>
  bg: string
  fg: string
  label: string
}

const LINKED_ENTITY_VISUALS: Record<LinkedEntityKind, LinkedEntityVisual> = {
  asset: { Icon: StorageIcon, bg: "#e6f1fb", fg: "#185fa5", label: "ASSET" },
  site: { Icon: LocationOnIcon, bg: "#eaf3de", fg: "#3b6d11", label: "SITE" },
  default: { Icon: LinkIcon, bg: "#eef2f6", fg: "#475569", label: "REF" },
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

interface FeedVisual {
  Icon: React.ComponentType<{ sx?: object }>
  bg: string
  fg: string
}

const FEED_VISUALS: Record<FeedEventType, FeedVisual> = {
  status: { Icon: PlayArrowIcon, bg: "#e6f1fb", fg: "#185fa5" },
  comment: { Icon: ChatBubbleOutlineIcon, bg: "#eaf3de", fg: "#3b6d11" },
  assignment: { Icon: PersonIcon, bg: "#faeeda", fg: "#854f0b" },
  link: { Icon: LinkIcon, bg: "#fbeaf0", fg: "#993556" },
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline editable text (spec section 5.1)
// ─────────────────────────────────────────────────────────────────────────────

interface InlineEditableProps {
  value: string
  placeholder?: string
  multiline?: boolean
  ariaLabel: string
  onCommit: (next: string) => void
  textSx?: object
  allowEmpty?: boolean
}

const InlineEditable = React.memo(function InlineEditable({
  value,
  placeholder,
  multiline = false,
  ariaLabel,
  onCommit,
  textSx,
  allowEmpty = false,
}: InlineEditableProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [editing, setEditing] = React.useState(false)

  React.useLayoutEffect(() => {
    if (!editing && ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value
    }
  }, [value, editing])

  const handleClick = React.useCallback(() => {
    if (editing) return
    setEditing(true)
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.selectNodeContents(el)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    })
  }, [editing])

  const commit = React.useCallback(() => {
    const el = ref.current
    const next = (el?.innerText ?? "").trim()
    if (!next && !allowEmpty) {
      if (el) el.innerText = value
    } else if (next !== value) {
      onCommit(next)
    }
    setEditing(false)
  }, [value, onCommit, allowEmpty])

  const handleKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault()
        if (ref.current) ref.current.innerText = value
        setEditing(false)
        ref.current?.blur()
      }
      if (!multiline && e.key === "Enter") {
        e.preventDefault()
        ref.current?.blur()
      }
    },
    [value, multiline]
  )

  const isEmpty = !value && !editing

  return (
    <Box
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      contentEditable={editing}
      suppressContentEditableWarning
      onClick={handleClick}
      onBlur={commit}
      onKeyDown={handleKey}
      sx={{
        outline: "none",
        cursor: editing ? "text" : "pointer",
        borderRadius: 1,
        px: 0.75,
        py: 0.5,
        whiteSpace: multiline ? "pre-wrap" : "normal",
        border: "1.5px solid",
        borderColor: editing ? "primary.main" : "transparent",
        bgcolor: "transparent",
        color: isEmpty ? "text.disabled" : "text.primary",
        "&:hover": editing ? undefined : { bgcolor: "action.hover" },
        ...textSx,
      }}
    >
      {isEmpty ? placeholder ?? "" : null}
    </Box>
  )
})

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
              bgcolor: "#e6f1fb",
              color: "#185fa5",
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
          options={WORK_TYPE_OPTIONS}
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
            ariaLabel="Custom work type"
            onCommit={onCommitWorkTypeOther}
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
          ariaLabel="Maintenance notes"
          onCommit={onCommitNotes}
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
  return (
    <Box>
      {entities.length === 0 ? (
        <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)" }}>
          No linked records
        </Typography>
      ) : (
        entities.map((entity) => {
          const visual = LINKED_ENTITY_VISUALS[entityKindFromType(entity.type)]
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
                    color: "var(--color-text-tertiary)",
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
// Activity section (spec section 6) — empty for maintenance until backend
// supports audit/comments. Compose box is hidden because no comments
// mutation is wired for maintenance.
// ─────────────────────────────────────────────────────────────────────────────

interface FeedItemProps {
  event: FeedEvent
  isLast: boolean
}

const FeedItem = React.memo(function FeedItem({ event, isLast }: FeedItemProps) {
  const visual = FEED_VISUALS[event.type]
  const Icon = visual.Icon

  return (
    <Box sx={{ display: "flex", gap: 1.5, py: 1, position: "relative" }}>
      {!isLast ? (
        <Box
          sx={{
            position: "absolute",
            left: 12,
            top: 28,
            bottom: -8,
            width: "1px",
            bgcolor: "divider",
          }}
        />
      ) : null}
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          bgcolor: visual.bg,
          color: visual.fg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        <Icon sx={{ fontSize: 14 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
            {event.actor}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
            {event.time}
          </Typography>
        </Stack>
        <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.5 }}>
          {event.text}
        </Typography>
        {event.note && event.note.trim().length > 0 ? (
          <Box
            sx={{
              borderLeft: "2px solid",
              borderColor: "success.light",
              pl: 1,
              py: 0.5,
              bgcolor: "action.hover",
              borderRadius: "0 4px 4px 0",
              mt: 0.5,
              fontSize: 12,
            }}
          >
            <Typography
              sx={{ fontSize: 12, color: "text.primary", whiteSpace: "pre-wrap", lineHeight: 1.5 }}
            >
              {event.note}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
})

interface ActivityContentProps {
  events: FeedEvent[]
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  composeEnabled: boolean
  noteValue: string
  onNoteChange: (value: string) => void
  savingNote: boolean
  onPostNote: () => void
}

const ActivityContent = React.memo(function ActivityContent({
  events,
  activeFilter,
  onFilterChange,
  composeEnabled,
  noteValue,
  onNoteChange,
  savingNote,
  onPostNote,
}: ActivityContentProps) {
  return (
    <Box>
      <ActivityTabs value={activeFilter} onChange={onFilterChange} />

      {composeEnabled && activeFilter === "comment" ? (
        <ActivityCommentBox
          value={noteValue}
          onChange={onNoteChange}
          saving={savingNote}
          onPost={onPostNote}
        />
      ) : null}

      {events.length === 0 ? (
        <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)" }}>
          No activity to show
        </Typography>
      ) : (
        events.map((event, idx) => (
          <FeedItem key={event.id} event={event} isLast={idx === events.length - 1} />
        ))
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
  const [workNoteBody, setWorkNoteBody] = React.useState("")
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
    (value: string) => handleFieldChange("performedById", value === "" ? null : value),
    [handleFieldChange]
  )

  // ── Activity (no audit/comments query for maintenance — empty feed) ────────

  const handleAddNote = React.useCallback(() => {
    // No comments mutation wired for maintenance; compose is hidden.
  }, [])

  const allFeedEvents = React.useMemo<FeedEvent[]>(() => [], [])
  const visibleFeedEvents = React.useMemo<FeedEvent[]>(() => {
    if (activeFilter === "all") return allFeedEvents
    return allFeedEvents.filter((e) => e.type === activeFilter)
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
    if (recordData.performedBy?.email) return recordData.performedBy.email
    if (recordData.performedById && users.data) {
      const match = users.data.find((u) => u.id === recordData.performedById)
      if (match) return match.email
    }
    return "Unassigned"
  }, [recordData, users.data])

  const usersOptions = React.useMemo<PopoverOption[]>(() => {
    const list: PopoverOption[] = (users.data ?? []).map((u) => ({
      value: u.id,
      label: u.displayName,
      iconBg: "#eaf3de",
      iconColor: "#3b6d11",
      icon: <PersonIcon sx={{ fontSize: 14 }} />,
    }))
    return [
      {
        value: "",
        label: "Unassigned",
        iconBg: "#f1efe8",
        iconColor: "#5f5e5a",
        icon: <PersonIcon sx={{ fontSize: 14 }} />,
      },
      ...list,
    ]
  }, [users.data])

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
                bgcolor: "#e6f1fb",
                color: "#185fa5",
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
              <Typography sx={{ fontSize: 12 }}>{recordData.performedBy.email}</Typography>
            ) : (
              <Typography sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}>
                Unassigned
              </Typography>
            )}
          </Box>
        ),
      },
    ]
  }, [recordData, canManage, usersOptions, handleSelectPerformedBy])

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
              activeFilter={activeFilter}
              onFilterChange={handleFilterChange}
              composeEnabled={false}
              noteValue={workNoteBody}
              onNoteChange={setWorkNoteBody}
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
    activeFilter,
    handleFilterChange,
    workNoteBody,
    savingNote,
    handleAddNote,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!recordData) return undefined
    return {
      submittedBy: recordData.performedBy?.email ?? null,
      createdAt: recordData.createdAt ?? recordData.performedAt,
      updatedAt: recordData.updatedAt ?? recordData.performedAt,
    }
  }, [recordData])

  const rightSections = React.useMemo<RightSection[]>(() => {
    return [
      {
        id: "attachments",
        title: "Attachments",
        icon: <AttachFileIcon sx={{ fontSize: 12 }} />,
        defaultOpen: false,
        headerAdd: { onClick: () => attachRef.current?.openPicker(), tooltip: "Attach file" },
        content: (
          <AttachmentsContent
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
        icon: <LinkIcon sx={{ fontSize: 12 }} />,
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
        typeBadge={MAINTENANCE_TYPE_BADGE}
        currentStatus={currentStatus}
        statusConfig={MAINTENANCE_STATUS_CONFIG}
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
