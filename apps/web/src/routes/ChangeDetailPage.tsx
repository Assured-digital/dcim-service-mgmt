import React from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import LinkIcon from "@mui/icons-material/Link"
import AttachFileIcon from "@mui/icons-material/AttachFile"
import DescriptionIcon from "@mui/icons-material/Description"
import ImageIcon from "@mui/icons-material/Image"
import FileDownloadIcon from "@mui/icons-material/FileDownload"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
import PersonIcon from "@mui/icons-material/Person"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import LockIcon from "@mui/icons-material/Lock"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
import AssignmentIcon from "@mui/icons-material/Assignment"
import StorageIcon from "@mui/icons-material/Storage"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import BuildIcon from "@mui/icons-material/Build"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined"
import SendOutlinedIcon from "@mui/icons-material/SendOutlined"
import BlockIcon from "@mui/icons-material/Block"
import ThumbUpAltOutlinedIcon from "@mui/icons-material/ThumbUpAltOutlined"
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined"
import { type LinkedTask } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { CreateTaskModal, TaskQuickDetailModal } from "./TasksPage"
import {
  RecordDetailShell,
  StatusPopover,
  TransitionDialog,
  type CentreSection,
  type DetailField,
  type MoreMenuItem,
  type PopoverOption,
  type RecordMetadata,
  type RightSection,
  type StatusConfig,
  type StatusOption,
  type Transition,
} from "../components/detail"
import { transitions as changeTransitions } from "../config/transitions/changeTransitions"
import { useAssignableUsers, type AssignableUser } from "../lib/useAssignableUsers"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type ChangeApproval = {
  id: string
  decision: string
  notes: string | null
  decidedAt: string
  approver: { id: string; email: string }
}

type ChangeRequest = {
  id: string
  reference: string
  title: string
  description: string
  changeType: string
  status: string
  priority: string
  reason: string | null
  impactAssessment: string | null
  rollbackPlan: string | null
  implementationNotes: string | null
  postImplReview: string | null
  scheduledStart: string | null
  scheduledEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  closedAt: string | null
  assigneeId: string | null
  assignee: { id: string; email: string } | null
  createdById?: string | null
  approvals: ChangeApproval[]
  createdAt: string
  updatedAt: string
}

type AuditEvent = {
  id: string
  action: string
  actorUserId: string | null
  actorEmail?: string | null
  data?: Record<string, unknown> | null
  createdAt: string
}

type ChangeComment = {
  id: string
  body?: string
  content?: string
  message?: string
  type: string
  createdAt: string
  author: { id: string; email: string }
}

type Attachment = {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
  url?: string
}

type User = { id: string; email: string }

type LinkedTaskWithAssignee = LinkedTask & {
  assigneeId?: string | null
  assignee?: { id: string; email: string } | null
}

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
}

const FILTER_VALUES = ["all", "comment", "status", "assignment", "link"] as const
type ActivityFilter = typeof FILTER_VALUES[number]

const FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "comment", label: "Comments" },
  { value: "status", label: "Status" },
  { value: "assignment", label: "Assignments" },
  { value: "link", label: "Links" },
]

type EditableField =
  | "title"
  | "description"
  | "priority"
  | "assigneeId"
  | "reason"
  | "impactAssessment"
  | "rollbackPlan"
  | "implementationNotes"
  | "postImplReview"

type ImplementationField =
  | "reason"
  | "impactAssessment"
  | "rollbackPlan"
  | "implementationNotes"
  | "postImplReview"

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.2
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
}

const STATUS_COLOURS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#f1efe8", text: "#5f5e5a" },
  SUBMITTED: { bg: "#faeeda", text: "#854f0b" },
  PENDING_APPROVAL: { bg: "#faeeda", text: "#854f0b" },
  APPROVED: { bg: "#e6f1fb", text: "#185fa5" },
  REJECTED: { bg: "#fcebeb", text: "#a32d2d" },
  IN_PROGRESS: { bg: "#e6f1fb", text: "#185fa5" },
  COMPLETED: { bg: "#eaf3de", text: "#3b6d11" },
  CLOSED: { bg: "#f1efe8", text: "#5f5e5a" },
  CANCELLED: { bg: "#f1efe8", text: "#5f5e5a" },
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  DRAFT: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  SUBMITTED: <SendOutlinedIcon sx={{ fontSize: 14 }} />,
  PENDING_APPROVAL: <HourglassEmptyIcon sx={{ fontSize: 14 }} />,
  APPROVED: <ThumbUpAltOutlinedIcon sx={{ fontSize: 14 }} />,
  REJECTED: <BlockIcon sx={{ fontSize: 14 }} />,
  IN_PROGRESS: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  COMPLETED: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  CLOSED: <LockIcon sx={{ fontSize: 14 }} />,
  CANCELLED: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
}

const CHANGE_STATUS_ORDER = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
]

const CHANGE_STATUS_CONFIG: StatusConfig = {
  options: CHANGE_STATUS_ORDER.map<StatusOption>((value) => ({
    value,
    label: STATUS_LABELS[value],
    badgeClass: `b-${value.toLowerCase()}`,
    bg: STATUS_COLOURS[value].bg,
    iconColor: STATUS_COLOURS[value].text,
    icon: STATUS_ICONS[value],
    buttonIcon: STATUS_ICONS[value],
  })),
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority popover options
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_VALUES = ["low", "medium", "high", "critical"]

const PRIORITY_COLOURS: Record<string, { bg: string; text: string }> = {
  low: { bg: "#dcfce7", text: "#15803d" },
  medium: { bg: "#fef3c7", text: "#b45309" },
  high: { bg: "#ffedd5", text: "#c2410c" },
  critical: { bg: "#fee2e2", text: "#b91c1c" },
}

const PRIORITY_OPTIONS: PopoverOption[] = PRIORITY_VALUES.map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
  iconBg: PRIORITY_COLOURS[value].bg,
  iconColor: PRIORITY_COLOURS[value].text,
  icon: <FlagOutlinedIcon sx={{ fontSize: 14 }} />,
}))

// ─────────────────────────────────────────────────────────────────────────────
// Task status colour map — spec section 10
// ─────────────────────────────────────────────────────────────────────────────

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
}

const TASK_STATUS_COLOURS: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "#f1efe8", text: "#5f5e5a" },
  IN_PROGRESS: { bg: "#e6f1fb", text: "#185fa5" },
  BLOCKED: { bg: "#fcebeb", text: "#a32d2d" },
  DONE: { bg: "#eaf3de", text: "#3b6d11" },
}

const TASK_STATUS_OPTIONS: PopoverOption[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"].map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
  iconBg: TASK_STATUS_COLOURS[value].bg,
  iconColor: TASK_STATUS_COLOURS[value].text,
  icon: <AssignmentIcon sx={{ fontSize: 14 }} />,
}))

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — spec section 3.3 (CHG)
// ─────────────────────────────────────────────────────────────────────────────

const CHANGE_TYPE_BADGE = (
  <Box
    component="span"
    sx={{
      fontSize: 10,
      fontWeight: 500,
      bgcolor: "#e6f1fb",
      color: "#185fa5",
      px: 1,
      py: 0.25,
      borderRadius: 1,
      letterSpacing: "0.04em",
    }}
  >
    CHG
  </Box>
)

// Linked record kind visuals
type LinkedEntityKind = "asset" | "risk" | "site" | "incident" | "issue" | "default"

interface LinkedEntityVisual {
  Icon: React.ComponentType<{ sx?: object }>
  bg: string
  fg: string
  label: string
}

const LINKED_ENTITY_VISUALS: Record<LinkedEntityKind, LinkedEntityVisual> = {
  asset: { Icon: StorageIcon, bg: "#e6f1fb", fg: "#185fa5", label: "ASSET" },
  risk: { Icon: WarningAmberIcon, bg: "#faeeda", fg: "#854f0b", label: "RSK" },
  site: { Icon: LocationOnIcon, bg: "#eaf3de", fg: "#3b6d11", label: "SITE" },
  incident: { Icon: ErrorOutlineIcon, bg: "#fcebeb", fg: "#a32d2d", label: "INC" },
  issue: { Icon: ErrorOutlineIcon, bg: "#fbeaf0", fg: "#993556", label: "ISS" },
  default: { Icon: LinkIcon, bg: "#eef2f6", fg: "#475569", label: "REF" },
}

function entityKindFromType(value?: string | null): LinkedEntityKind {
  if (!value) return "default"
  const v = value.toLowerCase()
  if (v === "asset") return "asset"
  if (v === "risk") return "risk"
  if (v === "site") return "site"
  if (v === "incident") return "incident"
  if (v === "issue") return "issue"
  return "default"
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval colours
// ─────────────────────────────────────────────────────────────────────────────

const APPROVAL_COLOURS: Record<string, { bg: string; text: string }> = {
  APPROVED: { bg: "#eaf3de", text: "#3b6d11" },
  REJECTED: { bg: "#fcebeb", text: "#a32d2d" },
  DEFERRED: { bg: "#faeeda", text: "#854f0b" },
}

const APPROVAL_DEFAULT_COLOURS = { bg: "#f1efe8", text: "#5f5e5a" }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${date}, ${time}`
}

function formatScheduledDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`
}

function getInitials(email: string): string {
  const local = email.split("@")[0] ?? email
  const parts = local.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return local.slice(0, 2).toUpperCase()
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message)) return message.join(", ")
  }
  return fallback
}

function readDataString(data: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!data) return null
  const v = data[key]
  return typeof v === "string" && v.length > 0 ? v : null
}

function readDataFields(data: Record<string, unknown> | null | undefined): string[] {
  if (!data) return []
  const v = data["fields"]
  return Array.isArray(v) ? v.filter((f): f is string => typeof f === "string") : []
}

function bold(value: string): React.ReactNode {
  return (
    <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
      {value}
    </Box>
  )
}

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Logged the change",
  UPDATED: "Updated change",
  STATUS_UPDATED: "Status changed",
  APPROVAL_RECORDED: "Approval decision recorded",
}

function describeAuditEvent(
  action: string,
  data?: Record<string, unknown> | null,
): { type: FeedEventType; text: React.ReactNode } {
  const label = ACTION_LABELS[action] ?? action

  if (action === "STATUS_UPDATED") {
    const fromRaw = readDataString(data, "from")
    const toRaw = readDataString(data, "to")
    const from = fromRaw ? STATUS_LABELS[fromRaw] ?? fromRaw : null
    const to = toRaw ? STATUS_LABELS[toRaw] ?? toRaw : null
    return {
      type: "status",
      text: (
        <>
          {label}
          {from && to ? <> {bold(from)} → {bold(to)}</> : null}
        </>
      ),
    }
  }

  if (action === "CREATED") {
    return { type: "status", text: <>{label}</> }
  }

  if (action === "APPROVAL_RECORDED") {
    const decision = readDataString(data, "decision")
    return {
      type: "status",
      text: decision ? <>Approval recorded: {bold(decision)}</> : <>{label}</>,
    }
  }

  if (action === "UPDATED") {
    const fields = readDataFields(data)
    if (fields.length === 1 && fields[0] === "assigneeId") {
      const assigneeName =
        readDataString(data, "assignee") ??
        readDataString(data, "assigneeEmail") ??
        readDataString(data, "assigneeName")
      return {
        type: "assignment",
        text: assigneeName
          ? <>Assigned to {bold(assigneeName)}</>
          : <>Assignee updated</>,
      }
    }
    return {
      type: "status",
      text: (
        <>
          {label}
          {fields.length ? <>: {bold(fields.join(", "))}</> : null}
        </>
      ),
    }
  }

  return { type: "status", text: <>{label}</> }
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
}

const InlineEditable = React.memo(function InlineEditable({
  value,
  placeholder,
  multiline = false,
  ariaLabel,
  onCommit,
  textSx,
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
    if (!next) {
      if (el) el.innerText = value
    } else if (next !== value) {
      onCommit(next)
    }
    setEditing(false)
  }, [value, onCommit])

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
// ─────────────────────────────────────────────────────────────────────────────

interface ChangeTitleCardProps {
  title: string
  description: string
  onCommitTitle: (next: string) => void
  onCommitDescription: (next: string) => void
}

const ChangeTitleCard = React.memo(function ChangeTitleCard({
  title,
  description,
  onCommitTitle,
  onCommitDescription,
}: ChangeTitleCardProps) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography
        variant="caption"
        color="text.tertiary"
        sx={{ fontWeight: 500, display: "block", mb: 0.5 }}
      >
        Subject
      </Typography>
      <InlineEditable
        value={title}
        ariaLabel="Change title"
        onCommit={onCommitTitle}
        textSx={{
          fontSize: "1.25rem",
          fontWeight: 500,
          lineHeight: 1.6,
          fontFamily: "'Space Grotesk', sans-serif",
          px: 0,
          mx: 0,
        }}
      />

      <Typography
        variant="caption"
        color="text.tertiary"
        sx={{ fontWeight: 500, display: "block", mt: 1.5, mb: 0.5 }}
      >
        Description
      </Typography>
      <InlineEditable
        value={description}
        placeholder="Add a description"
        multiline
        ariaLabel="Change description"
        onCommit={onCommitDescription}
        textSx={{
          fontSize: "0.8125rem",
          lineHeight: 1.5,
          color: "text.secondary",
          px: 0,
          mx: 0,
        }}
      />
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Tasks section (spec 5.2)
// ─────────────────────────────────────────────────────────────────────────────

interface TaskStatusBadgeProps {
  status: string
  onClick: (anchor: HTMLElement) => void
}

const TaskStatusBadge = React.memo(function TaskStatusBadge({
  status,
  onClick,
}: TaskStatusBadgeProps) {
  const colours = TASK_STATUS_COLOURS[status] ?? TASK_STATUS_COLOURS.OPEN
  const label = TASK_STATUS_LABELS[status] ?? status
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      onClick(e.currentTarget)
    },
    [onClick]
  )
  return (
    <Box
      component="button"
      onClick={handleClick}
      sx={{
        all: "unset",
        cursor: "pointer",
        bgcolor: colours.bg,
        color: colours.text,
        fontSize: 10,
        fontWeight: 500,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        flexShrink: 0,
      }}
    >
      {label}
    </Box>
  )
})

interface AssigneeCellProps {
  assignee: { id: string; email: string } | null | undefined
  onClick: (anchor: HTMLElement) => void
}

const AssigneeCell = React.memo(function AssigneeCell({
  assignee,
  onClick,
}: AssigneeCellProps) {
  const handleClick = React.useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation()
      onClick(e.currentTarget)
    },
    [onClick]
  )
  return (
    <Box
      onClick={handleClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        flexShrink: 0,
        cursor: "pointer",
      }}
    >
      {assignee ? (
        <>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              bgcolor: "#eaf3de",
              color: "#3b6d11",
              fontSize: 9,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {getInitials(assignee.email)}
          </Box>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            {assignee.email}
          </Typography>
        </>
      ) : (
        <Typography
          color="text.tertiary"
          sx={{ fontSize: 11, fontStyle: "italic" }}
        >
          Unassigned
        </Typography>
      )}
    </Box>
  )
})

interface TasksSectionContentProps {
  tasks: LinkedTaskWithAssignee[]
  users: AssignableUser[]
  canManage: boolean
  onCreate: () => void
  onSelectTask: (taskId: string) => void
  onChangeTaskStatus: (taskId: string, nextStatus: string) => void
  onChangeTaskAssignee: (taskId: string, nextAssigneeId: string) => void
}

const TasksSectionContent = React.memo(function TasksSectionContent({
  tasks,
  users,
  canManage,
  onCreate,
  onSelectTask,
  onChangeTaskStatus,
  onChangeTaskAssignee,
}: TasksSectionContentProps) {
  const [activePopover, setActivePopover] = React.useState<{
    taskId: string
    type: "status" | "assignee"
    anchor: HTMLElement
  } | null>(null)

  const handleStatusClick = React.useCallback(
    (taskId: string) => (anchor: HTMLElement) => {
      setActivePopover({ taskId, type: "status", anchor })
    },
    []
  )

  const closeStatusPopover = React.useCallback(() => setActivePopover(null), [])

  const handleStatusSelect = React.useCallback(
    (next: string) => {
      if (activePopover?.type !== "status") return
      onChangeTaskStatus(activePopover.taskId, next)
      setActivePopover(null)
    },
    [activePopover, onChangeTaskStatus]
  )

  const handleAssigneeClick = React.useCallback(
    (taskId: string) => (anchor: HTMLElement) => {
      setActivePopover({ taskId, type: "assignee", anchor })
    },
    []
  )

  const closeAssigneePopover = React.useCallback(
    () => setActivePopover(null),
    []
  )

  const handleAssigneeSelect = React.useCallback(
    (next: string) => {
      if (activePopover?.type !== "assignee") return
      onChangeTaskAssignee(activePopover.taskId, next)
      setActivePopover(null)
    },
    [activePopover, onChangeTaskAssignee]
  )

  const handleRowClick = React.useCallback(
    (taskId: string) => () => onSelectTask(taskId),
    [onSelectTask]
  )

  const assigneeOptions = React.useMemo<PopoverOption[]>(() => {
    const list: PopoverOption[] = users.map((u) => ({
      value: u.id,
      label: u.displayName,
      iconBg: "#eaf3de",
      iconColor: "#3b6d11",
      icon: (
        <Box component="span" sx={{ fontSize: 9, fontWeight: 600 }}>
          {getInitials(u.email)}
        </Box>
      ),
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
  }, [users])

  return (
    <Box>
      {tasks.map((task) => (
        <Paper
          key={task.id}
          variant="outlined"
          onClick={handleRowClick(task.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0.875,
            mb: 0.5,
            borderRadius: 1,
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <Typography
            sx={{
              flex: 1,
              fontSize: 12,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "text.primary",
            }}
          >
            {task.title}
          </Typography>
          <AssigneeCell
            assignee={task.assignee ?? null}
            onClick={handleAssigneeClick(task.id)}
          />
          <TaskStatusBadge status={task.status} onClick={handleStatusClick(task.id)} />
        </Paper>
      ))}

      {canManage ? (
        <Button
          variant="text"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={onCreate}
          sx={{ textTransform: "none", mt: 1 }}
        >
          Add task
        </Button>
      ) : null}

      <StatusPopover
        id="task-status-popover"
        header="Task status"
        options={TASK_STATUS_OPTIONS}
        currentValue={
          activePopover?.type === "status"
            ? tasks.find((t) => t.id === activePopover.taskId)?.status ?? ""
            : ""
        }
        onSelect={handleStatusSelect}
        anchorEl={activePopover?.type === "status" ? activePopover.anchor : null}
        open={activePopover?.type === "status"}
        onClose={closeStatusPopover}
      />

      <StatusPopover
        id="task-assignee-popover"
        header="Assignee"
        options={assigneeOptions}
        currentValue={
          activePopover?.type === "assignee"
            ? tasks.find((t) => t.id === activePopover.taskId)?.assigneeId ?? ""
            : ""
        }
        onSelect={handleAssigneeSelect}
        anchorEl={activePopover?.type === "assignee" ? activePopover.anchor : null}
        open={activePopover?.type === "assignee"}
        onClose={closeAssigneePopover}
      />
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Implementation section
// ─────────────────────────────────────────────────────────────────────────────

interface ImplementationSectionContentProps {
  reason: string
  impactAssessment: string
  rollbackPlan: string
  implementationNotes: string
  postImplReview: string
  onCommit: (field: ImplementationField, value: string) => void
}

const IMPLEMENTATION_FIELDS: { key: ImplementationField; label: string; placeholder: string }[] = [
  { key: "reason", label: "Reason", placeholder: "Add a reason" },
  { key: "impactAssessment", label: "Impact assessment", placeholder: "Describe the impact" },
  { key: "rollbackPlan", label: "Rollback plan", placeholder: "Describe the rollback plan" },
  { key: "implementationNotes", label: "Implementation notes", placeholder: "Add implementation notes" },
  { key: "postImplReview", label: "Post-implementation review", placeholder: "Add a post-implementation review" },
]

const ImplementationSectionContent = React.memo(function ImplementationSectionContent({
  reason,
  impactAssessment,
  rollbackPlan,
  implementationNotes,
  postImplReview,
  onCommit,
}: ImplementationSectionContentProps) {
  const valueByKey: Record<ImplementationField, string> = React.useMemo(
    () => ({
      reason,
      impactAssessment,
      rollbackPlan,
      implementationNotes,
      postImplReview,
    }),
    [reason, impactAssessment, rollbackPlan, implementationNotes, postImplReview]
  )

  const commitByKey: Record<ImplementationField, (next: string) => void> = React.useMemo(
    () => ({
      reason: (next) => onCommit("reason", next),
      impactAssessment: (next) => onCommit("impactAssessment", next),
      rollbackPlan: (next) => onCommit("rollbackPlan", next),
      implementationNotes: (next) => onCommit("implementationNotes", next),
      postImplReview: (next) => onCommit("postImplReview", next),
    }),
    [onCommit]
  )

  return (
    <Box>
      {IMPLEMENTATION_FIELDS.map((field, idx) => (
        <Box
          key={field.key}
          sx={{ mb: idx === IMPLEMENTATION_FIELDS.length - 1 ? 0 : 1.5 }}
        >
          <Typography
            variant="caption"
            color="text.tertiary"
            sx={{ fontWeight: 500, display: "block", mb: 0.5 }}
          >
            {field.label}
          </Typography>
          <InlineEditable
            value={valueByKey[field.key]}
            placeholder={field.placeholder}
            multiline
            ariaLabel={field.label}
            onCommit={commitByKey[field.key]}
            textSx={{
              fontSize: "0.8125rem",
              lineHeight: 1.5,
              color: "text.secondary",
            }}
          />
        </Box>
      ))}
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Approvals section (read-only)
// ─────────────────────────────────────────────────────────────────────────────

interface ApprovalsSectionContentProps {
  approvals: ChangeApproval[]
}

const ApprovalsSectionContent = React.memo(function ApprovalsSectionContent({
  approvals,
}: ApprovalsSectionContentProps) {
  if (approvals.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)" }}>
        No approvals recorded
      </Typography>
    )
  }
  return (
    <Box>
      {approvals.map((approval) => {
        const colours = APPROVAL_COLOURS[approval.decision] ?? APPROVAL_DEFAULT_COLOURS
        const label =
          STATUS_LABELS[approval.decision] ??
          approval.decision.charAt(0) + approval.decision.slice(1).toLowerCase()
        return (
          <Paper
            key={approval.id}
            variant="outlined"
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1,
              px: 1.25,
              py: 0.875,
              mb: 0.5,
              borderRadius: 1,
            }}
          >
            <Box
              sx={{
                bgcolor: colours.bg,
                color: colours.text,
                fontSize: 10,
                fontWeight: 500,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                flexShrink: 0,
                mt: 0.25,
              }}
            >
              {label}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                rowGap={0.25}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 500, color: "text.primary" }}>
                  {approval.approver.email}
                </Typography>
                <Typography sx={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                  {formatDateTime(approval.decidedAt)}
                </Typography>
              </Stack>
              {approval.notes ? (
                <Typography
                  sx={{
                    fontSize: 12,
                    color: "text.secondary",
                    mt: 0.5,
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.5,
                  }}
                >
                  {approval.notes}
                </Typography>
              ) : null}
            </Box>
          </Paper>
        )
      })}
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Linked records section (right panel)
// ─────────────────────────────────────────────────────────────────────────────

interface LinkedRecordsContentProps {
  entities: LinkedEntity[]
  onAddLink: () => void
}

function entityDisplayName(type: string): string {
  const t = type.toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const LinkedRecordsContent = React.memo(function LinkedRecordsContent({
  entities,
  onAddLink,
}: LinkedRecordsContentProps) {
  return (
    <Box>
      {entities.length === 0
        ? null
        : entities.map((entity) => {
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
                    {entityDisplayName(entity.type)}
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
                    {entity.id}
                  </Typography>
                </Box>
              </Box>
            )
          })}
      <Button
        variant="text"
        size="small"
        startIcon={<AddIcon sx={{ fontSize: 14 }} />}
        onClick={onAddLink}
        sx={{ textTransform: "none", mt: 0.25 }}
      >
        Link record
      </Button>
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Activity section (spec section 6)
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
              sx={{
                fontSize: 12,
                color: "text.primary",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
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
  noteValue: string
  onNoteChange: (value: string) => void
  savingNote: boolean
  onPostNote: () => void
}

const ActivityContent = React.memo(function ActivityContent({
  events,
  activeFilter,
  onFilterChange,
  noteValue,
  onNoteChange,
  savingNote,
  onPostNote,
}: ActivityContentProps) {
  const handleFilterClick = React.useCallback(
    (filter: ActivityFilter) => () => onFilterChange(filter),
    [onFilterChange]
  )

  const handleNoteFieldChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onNoteChange(e.target.value),
    [onNoteChange]
  )

  return (
    <Box>
      <Stack direction="row" spacing={0.75} sx={{ mb: 1, flexWrap: "wrap" }}>
        {FILTER_OPTIONS.map((opt) => {
          const isActive = activeFilter === opt.value
          return (
            <Chip
              key={opt.value}
              size="small"
              label={opt.label}
              onClick={handleFilterClick(opt.value)}
              variant={isActive ? "filled" : "outlined"}
              color={isActive ? "primary" : "default"}
            />
          )
        })}
      </Stack>

      {activeFilter === "comment" ? (
        <Paper variant="outlined" sx={{ overflow: "hidden", mb: 1.75 }}>
          <TextField
            multiline
            minRows={2}
            fullWidth
            placeholder="Add a work note..."
            variant="outlined"
            size="small"
            value={noteValue}
            onChange={handleNoteFieldChange}
            sx={{
              "& .MuiOutlinedInput-root": {
                "& fieldset": { border: 0 },
                "&:hover fieldset": { border: 0 },
                "&.Mui-focused fieldset": { border: 0 },
              },
            }}
          />
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              p: 0.75,
              borderTop: "0.5px solid",
              borderColor: "divider",
            }}
          >
            <Button
              variant="contained"
              size="small"
              disabled={!noteValue.trim() || savingNote}
              onClick={onPostNote}
            >
              Post note
            </Button>
          </Box>
        </Paper>
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
// Attachments section (spec 7.3)
// ─────────────────────────────────────────────────────────────────────────────

interface AttachmentsContentProps {
  attachments: Attachment[]
  onAttach: () => void
  onDownload: (attachment: Attachment) => void
}

const AttachmentsContent = React.memo(function AttachmentsContent({
  attachments,
  onAttach,
  onDownload,
}: AttachmentsContentProps) {
  const handleDownload = React.useCallback(
    (attachment: Attachment) => () => onDownload(attachment),
    [onDownload]
  )

  // TODO: wire attachments API
  return (
    <Box>
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith("image/")
        const Icon = isImage ? ImageIcon : DescriptionIcon
        return (
          <Box
            key={attachment.id}
            onClick={handleDownload(attachment)}
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
                bgcolor: "action.hover",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon sx={{ fontSize: 14, color: "text.secondary" }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 12,
                  display: "block",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {attachment.fileName}
              </Typography>
              <Typography sx={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                {formatFileSize(attachment.fileSize)} ·{" "}
                {new Date(attachment.createdAt).toLocaleDateString("en-GB")}
              </Typography>
            </Box>
            <FileDownloadIcon sx={{ fontSize: 12, color: "var(--color-text-tertiary)" }} />
          </Box>
        )
      })}
      <Button
        variant="text"
        size="small"
        startIcon={<AddIcon sx={{ fontSize: 14 }} />}
        onClick={onAttach}
        sx={{ textTransform: "none", mt: 0.25 }}
      >
        Attach file
      </Button>
    </Box>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ChangeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const canManage = hasAnyRole([
    ...ORG_SUPER_ROLES,
    ROLES.SERVICE_MANAGER,
    ROLES.SERVICE_DESK_ANALYST,
  ])

  const activityParam = searchParams.get("activity")
  const activeFilter: ActivityFilter = React.useMemo(() => {
    if (activityParam && (FILTER_VALUES as readonly string[]).includes(activityParam)) {
      return activityParam as ActivityFilter
    }
    return "all"
  }, [activityParam])

  const handleFilterChange = React.useCallback(
    (filter: ActivityFilter) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (filter === "all") next.delete("activity")
          else next.set("activity", filter)
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)
  const [workNoteBody, setWorkNoteBody] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)
  const [transitionTarget, setTransitionTarget] = React.useState<Transition | null>(null)
  const [linkCopied, setLinkCopied] = React.useState(false)
  const [tasksOpen, setTasksOpen] = React.useState(true)
  const [implementationOpen, setImplementationOpen] = React.useState(true)
  const [approvalsOpen, setApprovalsOpen] = React.useState(true)
  const [activityOpen, setActivityOpen] = React.useState(true)

  // ── Queries (preserved exactly) ────────────────────────────────────────────

  const { data: change, isLoading } = useQuery({
    queryKey: ["change-detail", id],
    queryFn: async () => (await api.get<ChangeRequest>(`/changes/${id}`)).data,
    enabled: !!id,
  })

  // Admin-only directory — retained ONLY to resolve the "submitted by" creator
  // (createdById → email). Operational viewers 403 here and get [] (unchanged
  // behaviour); org-super resolve it. NOT an assignee picker — see
  // assignableUsers below for the (now operational-callable) pickers.
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
  })

  // Assignee-picker source (operational-callable; scoped to the active client).
  const { data: assignableUsers = [] } = useAssignableUsers()

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-change", id],
    queryFn: async () =>
      (
        await api.get<LinkedTaskWithAssignee[]>("/tasks", {
          params: { linkedEntityType: "ChangeRequest", linkedEntityId: id },
        })
      ).data,
    enabled: !!id,
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-change", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/ChangeRequest/${id}`)).data,
    enabled: !!id,
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-change", id],
    queryFn: async () =>
      (await api.get<ChangeComment[]>(`/comments/ChangeRequest/${id}/work-notes`)).data,
    enabled: !!id,
  })

  const attachments: Attachment[] = React.useMemo(() => [], [])

  // ── Mutations (preserved exactly) ──────────────────────────────────────────

  const handleFieldChange = React.useCallback(
    async (field: EditableField, value: string) => {
      if (!change) return
      setError("")
      try {
        await api.put(`/changes/${id}`, { [field]: value })
        qc.invalidateQueries({ queryKey: ["change-detail", id] })
        qc.invalidateQueries({ queryKey: ["audit-change", id] })
        qc.invalidateQueries({ queryKey: ["tickets"] })
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, "Failed to save change properties"))
      }
    },
    [id, change, qc]
  )

  const handleAddNote = React.useCallback(async () => {
    if (!workNoteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "ChangeRequest",
        entityId: id,
        body: workNoteBody.trim(),
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-change", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
      if (activeFilter !== "all") {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.delete("activity")
            return next
          },
          { replace: true }
        )
      }
    } finally {
      setSavingNote(false)
    }
  }, [activeFilter, id, qc, setSearchParams, workNoteBody])

  const statusMutation = useMutation({
    mutationFn: async ({ to, comment }: { to: string; comment?: string }) => {
      await api.post(`/changes/${id}/status`, { status: to })
      if (comment && comment.trim().length > 0) {
        await api.post("/comments/work-note", {
          entityType: "ChangeRequest",
          entityId: id,
          body: comment.trim(),
        })
      }
    },
    onSuccess: () => {
      setError("")
      qc.invalidateQueries({ queryKey: ["change-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-change", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    onError: (e: unknown) => {
      setError(getApiErrorMessage(e, "Failed to update status"))
    },
  })

  const handleStatusChange = React.useCallback(
    (to: string) => {
      if (!change) return
      const transition = changeTransitions.find(
        (t) => t.from === change.status && t.to === to
      )
      if (transition?.requiresDialog) {
        setTransitionTarget(transition)
      } else {
        statusMutation.mutate({ to })
      }
    },
    [change, statusMutation]
  )

  const handleTransitionConfirm = React.useCallback(
    (data: Record<string, string>) => {
      if (!transitionTarget) return
      const comment =
        Object.values(data)
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .join("\n")
          .trim() || undefined
      statusMutation.mutate({ to: transitionTarget.to, comment })
      setTransitionTarget(null)
    },
    [transitionTarget, statusMutation]
  )

  const handleTransitionClose = React.useCallback(() => {
    setTransitionTarget(null)
  }, [])

  const patchLinkedTask = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (taskId: string, patch: Record<string, any>) => {
      await api.put(`/tasks/${taskId}`, patch)
      qc.invalidateQueries({ queryKey: ["linked-tasks-change", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskStatus = React.useCallback(
    async (taskId: string, status: string) => {
      await api.post(`/tasks/${taskId}/status`, { status })
      qc.invalidateQueries({ queryKey: ["linked-tasks-change", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskAssignee = React.useCallback(
    async (taskId: string, assigneeId: string) => {
      await api.put(`/tasks/${taskId}`, { assigneeId: assigneeId || null })
      qc.invalidateQueries({ queryKey: ["linked-tasks-change", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const handleOpenCreateTask = React.useCallback(() => setTaskOpen(true), [])
  const handleCloseCreateTask = React.useCallback(() => setTaskOpen(false), [])
  const handleSelectTask = React.useCallback(
    (taskId: string) => setQuickTaskId(taskId),
    []
  )
  const handleCloseQuickTask = React.useCallback(() => setQuickTaskId(null), [])
  const handleCreateTaskSuccess = React.useCallback(
    () => qc.invalidateQueries({ queryKey: ["linked-tasks-change", id] }),
    [id, qc]
  )

  const handleOpenFullTask = React.useCallback(
    (taskId: string) => {
      if (!change) return
      navigate(`/tasks/${taskId}`, {
        state: { fromChange: change.id, fromChangeRef: change.reference },
      })
    },
    [change, navigate]
  )

  const handleAttach = React.useCallback(() => {
    // TODO: wire attachments API
  }, [])
  const handleDownloadAttachment = React.useCallback((_attachment: Attachment) => {
    // TODO: wire attachments API
  }, [])

  const handleAddLink = React.useCallback(() => {
    // TODO: link entity dialog
  }, [])

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Derived ────────────────────────────────────────────────────────────────

  const submittedByEmail = React.useMemo(() => {
    if (!change?.createdById) return null
    const match = users.find((u) => u.id === change.createdById)
    return match?.email ?? null
  }, [change, users])

  const linkedEntities = React.useMemo<LinkedEntity[]>(() => [], [])

  const allFeedEvents = React.useMemo<FeedEvent[]>(() => {
    const audit: FeedEvent[] = (auditEvents ?? []).map((e) => {
      const { type, text } = describeAuditEvent(e.action, e.data)
      const transitionComment =
        e.action === "STATUS_UPDATED" ? readDataString(e.data, "comment") : null
      return {
        id: `audit-${e.id}`,
        type,
        actor: e.actorEmail ?? "System",
        text,
        note: transitionComment ?? undefined,
        time: formatDateTime(e.createdAt),
        createdAt: e.createdAt,
      }
    })
    const notes: FeedEvent[] = (workNotes ?? []).map((n) => ({
      id: `note-${n.id}`,
      type: "comment",
      actor: n.author.email,
      text: <>added a work note</>,
      note: n.body ?? n.content ?? n.message ?? "",
      time: formatDateTime(n.createdAt),
      createdAt: n.createdAt,
    }))
    return [...audit, ...notes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [auditEvents, workNotes])

  const visibleFeedEvents = React.useMemo<FeedEvent[]>(() => {
    if (activeFilter === "all") return allFeedEvents
    return allFeedEvents.filter((e) => e.type === activeFilter)
  }, [allFeedEvents, activeFilter])

  const usersOptions = React.useMemo<PopoverOption[]>(() => {
    const list: PopoverOption[] = assignableUsers.map((u) => ({
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
  }, [assignableUsers])

  // ── Title commit handlers ──────────────────────────────────────────────────

  const handleCommitTitle = React.useCallback(
    (next: string) => handleFieldChange("title", next),
    [handleFieldChange]
  )
  const handleCommitDescription = React.useCallback(
    (next: string) => handleFieldChange("description", next),
    [handleFieldChange]
  )

  const handleCommitImplementation = React.useCallback(
    (field: ImplementationField, next: string) => handleFieldChange(field, next),
    [handleFieldChange]
  )

  // ── Field-popover handlers ─────────────────────────────────────────────────

  const handleSelectPriority = React.useCallback(
    (v: string) => handleFieldChange("priority", v),
    [handleFieldChange]
  )
  const handleSelectAssignee = React.useCallback(
    (v: string) => handleFieldChange("assigneeId", v),
    [handleFieldChange]
  )

  // ── More menu ──────────────────────────────────────────────────────────────

  const handleCopyLink = React.useCallback(() => {
    const href = window.location.href
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(href).then(() => setLinkCopied(true))
    } else {
      setLinkCopied(true)
    }
  }, [])

  const handleCancelChange = React.useCallback(() => {
    if (!change) return
    handleStatusChange("CANCELLED")
  }, [change, handleStatusChange])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Copy link",
        icon: <ContentCopyIcon sx={{ fontSize: 14 }} />,
        onClick: handleCopyLink,
      },
      {
        label: "Cancel change",
        icon: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: handleCancelChange,
        danger: true,
      },
    ],
    [handleCopyLink, handleCancelChange]
  )

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!change) return []
    const priorityColours = PRIORITY_COLOURS[change.priority] ?? PRIORITY_COLOURS.medium
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
              Change
            </Typography>
          </Box>
        ),
      },
      {
        key: "changeType",
        label: "Change type",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography variant="body2" color="text.secondary">
              {change.changeType}
            </Typography>
          </Box>
        ),
      },
      {
        key: "priority",
        label: "Priority",
        editable: true,
        currentValue: change.priority,
        popoverOptions: PRIORITY_OPTIONS,
        onSelect: handleSelectPriority,
        value: (
          <Box sx={valueWrapperSx}>
            <Chip
              size="small"
              label={change.priority.charAt(0).toUpperCase() + change.priority.slice(1)}
              sx={{
                bgcolor: priorityColours.bg,
                color: priorityColours.text,
                fontWeight: 600,
                fontSize: 11,
                height: 20,
              }}
            />
          </Box>
        ),
      },
      {
        key: "assigneeId",
        label: "Assignee",
        editable: true,
        currentValue: change.assigneeId ?? "",
        popoverOptions: usersOptions,
        onSelect: handleSelectAssignee,
        value: (
          <Box sx={valueWrapperSx}>
            {change.assignee ? (
              <Typography variant="body2" color="text.secondary">
                {change.assignee.email}
              </Typography>
            ) : (
              <Typography
                variant="body2"
                sx={{ color: "text.disabled", fontStyle: "italic" }}
              >
                Unassigned
              </Typography>
            )}
          </Box>
        ),
      },
      {
        key: "scheduledStart",
        label: "Scheduled start",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography variant="body2" color="text.secondary">
              {formatScheduledDate(change.scheduledStart)}
            </Typography>
          </Box>
        ),
      },
      {
        key: "scheduledEnd",
        label: "Scheduled end",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography variant="body2" color="text.secondary">
              {formatScheduledDate(change.scheduledEnd)}
            </Typography>
          </Box>
        ),
      },
    ]
  }, [change, usersOptions, handleSelectPriority, handleSelectAssignee])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!change) return []
    return [
      {
        id: "tasks",
        title: "",
        flush: true,
        content: (
          <Box sx={{ mb: 0 }}>
            <Divider sx={{ my: 2.5 }} />
            <Box
              onClick={() => setTasksOpen((o) => !o)}
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
                  transform: tasksOpen ? "none" : "rotate(-90deg)",
                  transition: "transform .15s",
                }}
              />
              <Typography variant="caption" fontWeight={500} color="text.secondary">
                Tasks
              </Typography>
            </Box>
            {tasksOpen && (
              <Box>
                <TasksSectionContent
                  tasks={linkedTasks ?? []}
                  users={assignableUsers}
                  canManage={canManage}
                  onCreate={handleOpenCreateTask}
                  onSelectTask={handleSelectTask}
                  onChangeTaskStatus={updateLinkedTaskStatus}
                  onChangeTaskAssignee={updateLinkedTaskAssignee}
                />
              </Box>
            )}
          </Box>
        ),
      },
      {
        id: "implementation",
        title: "",
        flush: true,
        content: (
          <Box sx={{ mb: 0 }}>
            <Divider sx={{ my: 2.5 }} />
            <Box
              onClick={() => setImplementationOpen((o) => !o)}
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
                  transform: implementationOpen ? "none" : "rotate(-90deg)",
                  transition: "transform .15s",
                }}
              />
              <BuildIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="caption" fontWeight={500} color="text.secondary">
                Implementation
              </Typography>
            </Box>
            {implementationOpen && (
              <ImplementationSectionContent
                reason={change.reason ?? ""}
                impactAssessment={change.impactAssessment ?? ""}
                rollbackPlan={change.rollbackPlan ?? ""}
                implementationNotes={change.implementationNotes ?? ""}
                postImplReview={change.postImplReview ?? ""}
                onCommit={handleCommitImplementation}
              />
            )}
          </Box>
        ),
      },
      {
        id: "approvals",
        title: "",
        flush: true,
        content: (
          <Box sx={{ mb: 0 }}>
            <Divider sx={{ my: 2.5 }} />
            <Box
              onClick={() => setApprovalsOpen((o) => !o)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                cursor: "pointer",
                mb: 1,
                userSelect: "none",
              }}
            >
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  color: "text.secondary",
                  transform: approvalsOpen ? "none" : "rotate(-90deg)",
                  transition: "transform .15s",
                }}
              />
              <AssignmentTurnedInOutlinedIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="caption" fontWeight={500} color="text.secondary">
                Approvals
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)" }}>
                {(change.approvals ?? []).length}{" "}
                {(change.approvals ?? []).length === 1 ? "decision" : "decisions"}
              </Typography>
            </Box>
            {approvalsOpen && (
              <ApprovalsSectionContent approvals={change.approvals ?? []} />
            )}
          </Box>
        ),
      },
      {
        id: "activity",
        title: "",
        flush: true,
        content: (
          <Box sx={{ mb: 0 }}>
            <Divider sx={{ my: 2.5 }} />
            <Box
              onClick={() => setActivityOpen((o) => !o)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                cursor: "pointer",
                mb: 1.5,
                userSelect: "none",
              }}
            >
              <ExpandMoreIcon
                sx={{
                  fontSize: 16,
                  color: "text.secondary",
                  transform: activityOpen ? "none" : "rotate(-90deg)",
                  transition: "transform .15s",
                }}
              />
              <Typography variant="caption" fontWeight={500} color="text.secondary">
                Activity
              </Typography>
            </Box>
            {activityOpen && (
              <Box>
                <ActivityContent
                  events={visibleFeedEvents}
                  activeFilter={activeFilter}
                  onFilterChange={handleFilterChange}
                  noteValue={workNoteBody}
                  onNoteChange={setWorkNoteBody}
                  savingNote={savingNote}
                  onPostNote={handleAddNote}
                />
              </Box>
            )}
          </Box>
        ),
      },
    ]
  }, [
    change,
    linkedTasks,
    assignableUsers,
    canManage,
    handleOpenCreateTask,
    handleSelectTask,
    updateLinkedTaskStatus,
    updateLinkedTaskAssignee,
    handleCommitImplementation,
    visibleFeedEvents,
    activeFilter,
    handleFilterChange,
    workNoteBody,
    savingNote,
    handleAddNote,
    tasksOpen,
    implementationOpen,
    approvalsOpen,
    activityOpen,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!change) return undefined
    return {
      submittedBy: submittedByEmail,
      createdAt: change.createdAt,
      updatedAt: change.updatedAt,
    }
  }, [change, submittedByEmail])

  const rightSections = React.useMemo<RightSection[]>(() => {
    return [
      {
        id: "attachments",
        title: "Attachments",
        icon: <AttachFileIcon sx={{ fontSize: 12 }} />,
        defaultOpen: false,
        content: (
          <AttachmentsContent
            attachments={attachments}
            onAttach={handleAttach}
            onDownload={handleDownloadAttachment}
          />
        ),
      },
      {
        id: "linked",
        title: "Linked records",
        icon: <LinkIcon sx={{ fontSize: 12 }} />,
        defaultOpen: false,
        content: (
          <LinkedRecordsContent entities={linkedEntities} onAddLink={handleAddLink} />
        ),
      },
    ]
  }, [
    attachments,
    handleAttach,
    handleDownloadAttachment,
    linkedEntities,
    handleAddLink,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingState />
  if (!change) return <ErrorState title="Change not found" />

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
        recordRef={change.reference}
        typeBadge={CHANGE_TYPE_BADGE}
        currentStatus={change.status}
        statusConfig={CHANGE_STATUS_CONFIG}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <ChangeTitleCard
            title={change.title}
            description={change.description}
            onCommitTitle={handleCommitTitle}
            onCommitDescription={handleCommitDescription}
          />
        }
        sections={sections}
        detailFields={detailFields}
        metadata={metadata}
        rightSections={rightSections}
      />

      <CreateTaskModal
        open={taskOpen}
        onClose={handleCloseCreateTask}
        linkedEntityType="ChangeRequest"
        linkedEntityId={change.id}
        linkedEntityLabel={change.reference}
        onSuccess={handleCreateTaskSuccess}
      />

      <TaskQuickDetailModal
        open={Boolean(quickTaskId)}
        taskId={quickTaskId}
        users={assignableUsers}
        canManage={canManage}
        onClose={handleCloseQuickTask}
        onOpenFull={handleOpenFullTask}
        onPatchTask={patchLinkedTask}
        onUpdateStatus={updateLinkedTaskStatus}
      />

      <TransitionDialog
        open={transitionTarget !== null}
        transition={transitionTarget}
        onConfirm={handleTransitionConfirm}
        onClose={handleTransitionClose}
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
