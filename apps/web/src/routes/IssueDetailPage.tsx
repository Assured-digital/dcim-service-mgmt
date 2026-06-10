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
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline"
import PersonIcon from "@mui/icons-material/Person"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import LockIcon from "@mui/icons-material/Lock"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import CloseIcon from "@mui/icons-material/Close"
import AssignmentIcon from "@mui/icons-material/Assignment"
import StorageIcon from "@mui/icons-material/Storage"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import BuildIcon from "@mui/icons-material/Build"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import { type LinkedTask } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { CreateTaskModal, TaskQuickDetailModal } from "./TasksPage"
import { useBreadcrumb } from "./Shell"
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
import { transitions as issueTransitions } from "../config/transitions/issueTransitions"
import { useAssignableUsers, type AssignableUser } from "../lib/useAssignableUsers"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { AttachmentsContent } from "../components/AttachmentsContent"
import type { AttachmentSummary } from "../lib/attachments"
import { LinkRecordDialog } from "../components/LinkRecordDialog"
import { deleteRecordLink, type ResolvedLink } from "../lib/linkedRecords"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type Issue = {
  id: string
  reference: string
  title: string
  description: string
  severity: string
  status: string
  resolution: string | null
  reviewDate: string | null
  closedAt: string | null
  links?: ResolvedLink[]
  attachments?: AttachmentSummary[]
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

type IssueComment = {
  id: string
  body?: string
  content?: string
  message?: string
  type: string
  createdAt: string
  author: { id: string; email: string }
}



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


const FILTER_VALUES = ["all", "comment", "status", "assignment", "link"] as const
type ActivityFilter = typeof FILTER_VALUES[number]

const FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "comment", label: "Comments" },
  { value: "status", label: "Status" },
  { value: "assignment", label: "Assignments" },
  { value: "link", label: "Links" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.6
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

const STATUS_COLOURS: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "#f1efe8", text: "#5f5e5a" },
  IN_PROGRESS: { bg: "#e6f1fb", text: "#185fa5" },
  RESOLVED: { bg: "#eaf3de", text: "#3b6d11" },
  CLOSED: { bg: "#f1efe8", text: "#5f5e5a" },
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  OPEN: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  IN_PROGRESS: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  RESOLVED: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  CLOSED: <LockIcon sx={{ fontSize: 14 }} />,
}

const ISSUE_STATUS_CONFIG: StatusConfig = {
  options: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map<StatusOption>((value) => ({
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
// Severity popover options — spec 9.6 (AMBER / RED)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = {
  GREEN: "Green",
  AMBER: "Amber",
  RED: "Red",
}

const SEVERITY_COLOURS: Record<string, { bg: string; text: string }> = {
  GREEN: { bg: "#dcfce7", text: "#15803d" },
  AMBER: { bg: "#fef3c7", text: "#b45309" },
  RED: { bg: "#fee2e2", text: "#b91c1c" },
}

const SEVERITY_OPTIONS: PopoverOption[] = ["AMBER", "RED"].map((value) => ({
  value,
  label: SEVERITY_LABELS[value],
  iconBg: SEVERITY_COLOURS[value].bg,
  iconColor: SEVERITY_COLOURS[value].text,
  icon: <WarningAmberIcon sx={{ fontSize: 14 }} />,
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

const TASK_STATUS_OPTIONS: PopoverOption[] = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"].map(
  (value) => ({
    value,
    label: TASK_STATUS_LABELS[value],
    iconBg: TASK_STATUS_COLOURS[value].bg,
    iconColor: TASK_STATUS_COLOURS[value].text,
    icon: <AssignmentIcon sx={{ fontSize: 14 }} />,
  })
)

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — spec section 3.3
// ─────────────────────────────────────────────────────────────────────────────

const ISSUE_TYPE_BADGE = (
  <Box
    component="span"
    sx={{
      fontSize: 10,
      fontWeight: 500,
      bgcolor: "#fbeaf0",
      color: "#993556",
      px: 1,
      py: 0.25,
      borderRadius: 1,
      letterSpacing: "0.04em",
    }}
  >
    ISS
  </Box>
)

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  })
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return `${date}, ${time}`
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
  CREATED: "Issue logged",
  UPDATED: "Updated issue",
  STATUS_UPDATED: "Status changed",
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

  if (action === "UPDATED") {
    const fields = readDataFields(data)
    if (fields.includes("linkedEntityType") || fields.includes("linkedEntityId")) {
      return { type: "link", text: <>Linked record updated</> }
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

interface IssueTitleCardProps {
  title: string
  description: string
  onCommitTitle: (next: string) => void
  onCommitDescription: (next: string) => void
}

const IssueTitleCard = React.memo(function IssueTitleCard({
  title,
  description,
  onCommitTitle,
  onCommitDescription,
}: IssueTitleCardProps) {
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
        ariaLabel="Issue title"
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
        ariaLabel="Issue description"
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
              fontFamily: "monospace",
              fontSize: 11,
              color: "text.secondary",
              flexShrink: 0,
            }}
          >
            {task.reference}
          </Typography>
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

// Attachments panel is provided by the shared AttachmentsContent component.

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function IssueDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [activityOpen, setActivityOpen] = React.useState(true)

  // ── Queries (preserved exactly) ────────────────────────────────────────────

  const { data: issue, isLoading } = useQuery({
    queryKey: ["issue-detail", id],
    queryFn: async () => (await api.get<Issue>(`/issues/${id}`)).data,
    enabled: !!id,
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-issue", id],
    queryFn: async () =>
      (
        await api.get<LinkedTaskWithAssignee[]>("/tasks", {
          params: { linkedEntityType: "Issue", linkedEntityId: id },
        })
      ).data,
    enabled: !!id,
  })

  const { data: users = [] } = useAssignableUsers()

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-issue", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/Issue/${id}`)).data,
    enabled: !!id,
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-issue", id],
    queryFn: async () =>
      (await api.get<IssueComment[]>(`/comments/Issue/${id}/work-notes`)).data,
    enabled: !!id,
  })


  // ── Mutations (preserved exactly) ──────────────────────────────────────────

  const handlePutField = React.useCallback(
    async (patch: Record<string, string | undefined>) => {
      if (!issue) return
      setError("")
      try {
        await api.put(`/issues/${id}`, patch)
        qc.invalidateQueries({ queryKey: ["issue-detail", id] })
        qc.invalidateQueries({ queryKey: ["audit-issue", id] })
        qc.invalidateQueries({ queryKey: ["issues"] })
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, "Failed to save issue properties"))
      }
    },
    [id, issue, qc]
  )

  const handleAddNote = React.useCallback(async () => {
    if (!workNoteBody.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Issue",
        entityId: id,
        body: workNoteBody.trim(),
      })
      setWorkNoteBody("")
      qc.invalidateQueries({ queryKey: ["work-notes-issue", id] })
      qc.invalidateQueries({ queryKey: ["audit-issue", id] })
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
    mutationFn: async ({ to, resolution }: { to: string; resolution?: string }) =>
      api.post(`/issues/${id}/status`, { status: to, resolution }),
    onSuccess: () => {
      setError("")
      qc.invalidateQueries({ queryKey: ["issue-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-issue", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-issue", id] })
      qc.invalidateQueries({ queryKey: ["issues"] })
    },
    onError: (e: unknown) => {
      setError(getApiErrorMessage(e, "Failed to update status"))
    },
  })

  const handleStatusChange = React.useCallback(
    (to: string) => {
      if (!issue) return
      const transition = issueTransitions.find(
        (t) => t.from === issue.status && t.to === to
      )
      if (transition?.requiresDialog) {
        setTransitionTarget(transition)
      } else {
        statusMutation.mutate({ to })
      }
    },
    [issue, statusMutation]
  )

  const handleTransitionConfirm = React.useCallback(
    (data: Record<string, string>) => {
      if (!transitionTarget) return
      const value = (data.resolution ?? data.reason ?? "").trim() || undefined
      const resolution =
        transitionTarget.to === "RESOLVED" || transitionTarget.to === "CLOSED"
          ? value
          : undefined
      statusMutation.mutate({ to: transitionTarget.to, resolution })
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
      qc.invalidateQueries({ queryKey: ["linked-tasks-issue", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskStatus = React.useCallback(
    async (taskId: string, status: string) => {
      await api.post(`/tasks/${taskId}/status`, { status })
      qc.invalidateQueries({ queryKey: ["linked-tasks-issue", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskAssignee = React.useCallback(
    async (taskId: string, assigneeId: string) => {
      await api.put(`/tasks/${taskId}`, { assigneeId: assigneeId || null })
      qc.invalidateQueries({ queryKey: ["linked-tasks-issue", id] })
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
    () => qc.invalidateQueries({ queryKey: ["linked-tasks-issue", id] }),
    [id, qc]
  )

  const handleOpenFullTask = React.useCallback(
    (taskId: string) => {
      if (!issue) return
      navigate(`/tasks/${taskId}`, {
        state: { fromIssue: issue.id, fromIssueRef: issue.reference },
      })
    },
    [issue, navigate]
  )


  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const handleAddLink = React.useCallback(() => setLinkDialogOpen(true), [])
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => deleteRecordLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-detail", id] }),
  })
  const handleUnlink = React.useCallback(
    (linkId: string) => unlinkMutation.mutate(linkId),
    [unlinkMutation]
  )

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Derived ────────────────────────────────────────────────────────────────

  const links = issue?.links ?? []

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

  // ── Title commit handlers ──────────────────────────────────────────────────

  const handleCommitTitle = React.useCallback(
    (next: string) => handlePutField({ title: next }),
    [handlePutField]
  )
  const handleCommitDescription = React.useCallback(
    (next: string) => handlePutField({ description: next }),
    [handlePutField]
  )

  // ── Field-popover handlers ─────────────────────────────────────────────────

  const handleSelectSeverity = React.useCallback(
    (v: string) => handlePutField({ severity: v }),
    [handlePutField]
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

  const handleCloseIssue = React.useCallback(() => {
    if (!issue) return
    handleStatusChange("CLOSED")
  }, [issue, handleStatusChange])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Copy link",
        icon: <ContentCopyIcon sx={{ fontSize: 14 }} />,
        onClick: handleCopyLink,
      },
      {
        label: "Close issue",
        icon: <CloseIcon sx={{ fontSize: 14 }} />,
        onClick: handleCloseIssue,
      },
    ],
    [handleCopyLink, handleCloseIssue]
  )

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!issue) return []
    const severityColours = SEVERITY_COLOURS[issue.severity] ?? SEVERITY_COLOURS.AMBER
    const severityLabel = SEVERITY_LABELS[issue.severity] ?? issue.severity
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
              Issue
            </Typography>
          </Box>
        ),
      },
      {
        key: "severity",
        label: "Severity",
        editable: true,
        currentValue: issue.severity,
        popoverOptions: SEVERITY_OPTIONS,
        onSelect: handleSelectSeverity,
        value: (
          <Box sx={valueWrapperSx}>
            <Chip
              size="small"
              label={severityLabel}
              sx={{
                bgcolor: severityColours.bg,
                color: severityColours.text,
                fontWeight: 600,
                fontSize: 11,
                height: 20,
              }}
            />
          </Box>
        ),
      },
    ]
  }, [issue, handleSelectSeverity])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!issue) return []
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
                  users={users}
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
    issue,
    linkedTasks,
    users,
    canManage,
    handleOpenCreateTask,
    handleSelectTask,
    updateLinkedTaskStatus,
    updateLinkedTaskAssignee,
    visibleFeedEvents,
    activeFilter,
    handleFilterChange,
    workNoteBody,
    savingNote,
    handleAddNote,
    tasksOpen,
    activityOpen,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!issue) return undefined
    return {
      submittedBy: null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }
  }, [issue])

  const rightSections = React.useMemo<RightSection[]>(() => {
    return [
      {
        id: "attachments",
        title: "Attachments",
        icon: <AttachFileIcon sx={{ fontSize: 12 }} />,
        defaultOpen: false,
        content: (
          <AttachmentsContent
            attachments={issue?.attachments ?? []}
            recordType="issue"
            recordId={issue?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["issue-detail", id] })}
          />
        ),
      },
      {
        id: "linked",
        title: "Linked records",
        icon: <LinkIcon sx={{ fontSize: 12 }} />,
        defaultOpen: false,
        content: (
          <LinkedRecordsContent links={links} onAddLink={handleAddLink} onUnlink={handleUnlink} />
        ),
      },
    ]
  }, [
    issue,
    qc,
    id,
    links,
    handleAddLink,
    handleUnlink,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingState />
  if (!issue) return <ErrorState title="Issue not found" />

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
        recordRef={issue.reference}
        typeBadge={ISSUE_TYPE_BADGE}
        currentStatus={issue.status}
        statusConfig={ISSUE_STATUS_CONFIG}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <IssueTitleCard
            title={issue.title}
            description={issue.description}
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
        linkedEntityType="Issue"
        linkedEntityId={issue.id}
        linkedEntityLabel={issue.reference}
        onSuccess={handleCreateTaskSuccess}
      />

      <TaskQuickDetailModal
        open={Boolean(quickTaskId)}
        taskId={quickTaskId}
        users={users}
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

      <LinkRecordDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        sourceType="issue"
        sourceId={issue.id}
        onLinked={() => qc.invalidateQueries({ queryKey: ["issue-detail", id] })}
      />
    </>
  )
}
