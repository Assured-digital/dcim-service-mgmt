import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Chip,
  Snackbar,
  Typography,
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import PersonIcon from "@mui/icons-material/Person"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import BlockIcon from "@mui/icons-material/Block"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
import StorageIcon from "@mui/icons-material/Storage"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import BuildIcon from "@mui/icons-material/Build"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useActivityFilter } from "../lib/useActivityFilter"
import {
  EditableTitleCard,
  useDetailNarrow,
  ActivityTabs,
  SlimExpandCommentBox,
  ActivityFeedItem,
  type ResolvedMention,
  type CommentDraft,
  type FeedEvent,
  type FeedEventType,
  RecordDetailShell,
  SectionPanel,
  TransitionDialog,
  filterFeedEvents,
  type ActivityFilter,
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
import { transitions as taskTransitions } from "../config/transitions/taskTransitions"
import { useBreadcrumb } from "./Shell"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
import type { AttachmentSummary } from "../lib/attachments"
import { LinkRecordDialog } from "../components/LinkRecordDialog"
import { deleteRecordLink, type ResolvedLink } from "../lib/linkedRecords"
import { userLabel } from "../lib/userDisplay"
import { statusColors } from "../components/shared"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type Task = {
  id: string
  reference: string
  title: string
  description: string | null
  status: string
  priority: string
  dueAt: string | null
  assigneeId: string | null
  assignee: { id: string; displayName: string } | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  incident: { id: string; reference: string; title: string } | null
  links?: ResolvedLink[]
  attachments?: AttachmentSummary[]
  createdAt: string
  updatedAt: string
}

type AuditEvent = {
  id: string
  action: string
  actorUserId: string | null
  actorDisplayName?: string | null
  data?: Record<string, unknown> | null
  createdAt: string
}

type TaskComment = {
  id: string
  body?: string
  content?: string
  message?: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
  type: string
  createdAt: string
  author: { id: string; displayName: string }
  // Two-level threading: a post's replies are themselves comments (same shape).
  replies?: TaskComment[]
}


type EditableField = "priority" | "assigneeId" | "title" | "description"

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.4 + 10
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  OPEN: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  IN_PROGRESS: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  BLOCKED: <BlockIcon sx={{ fontSize: 14 }} />,
  DONE: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
}

const TASK_STATUS_CONFIG: StatusConfig = {
  options: ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"].map<StatusOption>((value) => ({
    value,
    label: STATUS_LABELS[value],
    badgeClass: `b-${value.toLowerCase()}`,
    bg: statusColors(value).bg,
    iconColor: statusColors(value).text,
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
// Type badge — spec section 3.3 (Task = TSK)
// ─────────────────────────────────────────────────────────────────────────────

const TASK_TYPE_BADGE = (
  <Box
    component="span"
    sx={{
      fontSize: 10,
      fontWeight: 500,
      bgcolor: "#eeedfe",
      color: "#3c3489",
      px: 1,
      py: 0.25,
      borderRadius: 1,
      letterSpacing: "0.04em",
    }}
  >
    TSK
  </Box>
)

function entityPath(type: string | null, id: string | null): string | null {
  if (!type || !id) return null
  const paths: Record<string, string> = {
    ServiceRequest: `/service-desk/${id}`,
    ChangeRequest: `/changes/${id}`,
    Risk: `/risks-issues/risks/${id}`,
    Issue: `/risks-issues/issues/${id}`,
    Site: `/sites/${id}`,
    Survey: `/surveys/${id}`,
    Incident: `/incidents/${id}`,
  }
  return paths[type] ?? null
}

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

function formatDate(value: string | null): string {
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
  CREATED: "Created the task",
  UPDATED: "Updated task",
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
    if (fields.length === 1 && fields[0] === "assigneeId") {
      const assigneeName =
        readDataString(data, "assignee") ??
        readDataString(data, "assigneeEmail") ??
        readDataString(data, "assigneeName")
      return {
        type: "assignment",
        text: assigneeName ? <>Assigned to {bold(assigneeName)}</> : <>Assignee updated</>,
      }
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// Activity section (spec section 6)
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityContentProps {
  events: FeedEvent[]
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  savingNote: boolean
  onPostNote: (draft: CommentDraft) => void | Promise<void>
}

const ActivityContent = React.memo(function ActivityContent({
  events,
  activeFilter,
  onFilterChange,
  savingNote,
  onPostNote,
}: ActivityContentProps) {
  return (
    <Box>
      <ActivityTabs value={activeFilter} onChange={onFilterChange} />

      {activeFilter === "comment" ? (
        <SlimExpandCommentBox saving={savingNote} onPost={onPostNote} />
      ) : null}

      {events.length === 0 ? (
        <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)" }}>
          No activity to show
        </Typography>
      ) : (
        events.map((event, idx) => (
          <ActivityFeedItem key={event.id} event={event} isLast={idx === events.length - 1} />
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

export default function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { setPageFullBleed } = useBreadcrumb()
  const narrow = useDetailNarrow()

  // Render flush in the Shell content area (no surrounding padding/frame), matching
  // the Service Request detail page, whose ServiceDeskPage wrapper sets this.
  // In the narrow association-peek drawer the main ticket page behind owns full-bleed;
  // the drawer instance must NOT touch it, else its unmount on close clobbers the main
  // page's state (same rule as the breadcrumb label — see RecordDetailShell).
  React.useEffect(() => {
    if (narrow) return
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [narrow, setPageFullBleed])

  const canManage = hasAnyRole([
    ...ORG_SUPER_ROLES,
    ROLES.SERVICE_MANAGER,
    ROLES.SERVICE_DESK_ANALYST,
    ROLES.ENGINEER,
  ])

  const { activeFilter, handleFilterChange, resetFilterAfterComment } =
    useActivityFilter()

  const [error, setError] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)
  const [transitionTarget, setTransitionTarget] = React.useState<Transition | null>(null)
  const [linkCopied, setLinkCopied] = React.useState(false)

  // ── Queries (preserved exactly) ────────────────────────────────────────────

  const { data: task, isLoading } = useQuery({
    queryKey: ["task-detail", id],
    queryFn: async () => (await api.get<Task>(`/tasks/${id}`)).data,
    enabled: !!id,
  })

  const { data: users = [] } = useAssignableUsers()

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-task", id],
    queryFn: async () => (await api.get<AuditEvent[]>(`/audit-events/entity/Task/${id}`)).data,
    enabled: !!id,
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-task", id],
    queryFn: async () =>
      (await api.get<TaskComment[]>(`/comments/Task/${id}/work-notes`)).data,
    enabled: !!id,
  })


  // ── Mutations (preserved exactly) ──────────────────────────────────────────

  const handleFieldChange = React.useCallback(
    async (field: EditableField, value: string) => {
      if (!task) return
      setError("")
      try {
        await api.put(`/tasks/${id}`, { [field]: value })
        qc.invalidateQueries({ queryKey: ["task-detail", id] })
        qc.invalidateQueries({ queryKey: ["audit-task", id] })
        qc.invalidateQueries({ queryKey: ["tasks"] })
        // Confirm only the title/description edits — popover-driven fields
        // (priority/assignee) flow through here too and stay silent.
        if (field === "title") notify.success("Title updated")
        else if (field === "description") notify.success("Description updated")
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, "Failed to save task properties"))
      }
    },
    [id, task, qc, notify]
  )

  const handleAddNote = React.useCallback(async (draft: CommentDraft) => {
    if (!draft.body.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Task",
        entityId: id,
        body: draft.body,
        bodyJson: draft.bodyJson,
        mentions: draft.mentions,
      })
      qc.invalidateQueries({ queryKey: ["work-notes-task", id] })
      qc.invalidateQueries({ queryKey: ["audit-task", id] })
      resetFilterAfterComment()
      notify.success("Note added")
    } finally {
      setSavingNote(false)
    }
  }, [id, qc, resetFilterAfterComment, notify])

  const statusMutation = useMutation({
    mutationFn: async ({ to, comment }: { to: string; comment?: string }) =>
      api.post(`/tasks/${id}/status`, { status: to, comment }),
    onSuccess: () => {
      setError("")
      qc.invalidateQueries({ queryKey: ["task-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-task", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-task", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    onError: (e: unknown) => {
      setError(getApiErrorMessage(e, "Failed to update status"))
    },
  })

  const handleStatusChange = React.useCallback(
    (to: string) => {
      if (!task) return
      const transition = taskTransitions.find(
        (t) => t.from === task.status && t.to === to
      )
      if (transition?.requiresDialog) {
        setTransitionTarget(transition)
      } else {
        statusMutation.mutate({ to })
      }
    },
    [task, statusMutation]
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


  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const handleAddLink = React.useCallback(() => setLinkDialogOpen(true), [])
  // Lets the Attachments section-header "+" open the (encapsulated) file picker.
  const attachRef = React.useRef<AttachmentsHandle>(null)
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => deleteRecordLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-detail", id] }),
  })
  const handleUnlink = React.useCallback(
    (linkId: string) => unlinkMutation.mutate(linkId),
    [unlinkMutation]
  )

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Derived ────────────────────────────────────────────────────────────────

  // Soft-links resolved by the backend, plus the Task's parent-incident FK
  // relation (shown for context but not unlinkable here — empty linkId).
  const links = React.useMemo<ResolvedLink[]>(() => {
    const soft = task?.links ?? []
    if (
      task?.incident &&
      !soft.some((l) => l.type === "incident" && l.id === task.incident!.id)
    ) {
      const incidentRow: ResolvedLink = {
        linkId: "",
        type: "incident",
        id: task.incident.id,
        reference: task.incident.reference,
        title: task.incident.title || task.incident.reference,
        status: "",
      }
      return [incidentRow, ...soft]
    }
    return soft
  }, [task])

  const allFeedEvents = React.useMemo<FeedEvent[]>(() => {
    const audit: FeedEvent[] = (auditEvents ?? []).map((e) => {
      const { type, text } = describeAuditEvent(e.action, e.data)
      const transitionComment =
        e.action === "STATUS_UPDATED" ? readDataString(e.data, "comment") : null
      return {
        id: `audit-${e.id}`,
        type,
        actor: e.actorDisplayName ?? "System",
        text,
        note: transitionComment ?? undefined,
        time: formatDateTime(e.createdAt),
        createdAt: e.createdAt,
      }
    })
    const notes: FeedEvent[] = (workNotes ?? []).map((n) => ({
      id: `note-${n.id}`,
      type: "comment",
      actor: n.author.displayName,
      text: null,
      note: n.body ?? n.content ?? n.message ?? "",
      bodyJson: n.bodyJson,
      mentions: n.mentions,
      commentId: n.id,
      entityId: id,
      replies: (n.replies ?? []).map((r) => ({
        id: r.id,
        actor: r.author.displayName,
        note: r.body ?? r.content ?? r.message ?? "",
        bodyJson: r.bodyJson,
        mentions: r.mentions,
        time: formatDateTime(r.createdAt),
      })),
      time: formatDateTime(n.createdAt),
      createdAt: n.createdAt,
    }))
    return [...audit, ...notes].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [auditEvents, workNotes, id])

  const visibleFeedEvents = React.useMemo<FeedEvent[]>(() => {
    return filterFeedEvents(allFeedEvents, activeFilter)
  }, [allFeedEvents, activeFilter])

  const usersOptions = React.useMemo<PopoverOption[]>(() => {
    const list: PopoverOption[] = users.map((u) => ({
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
  }, [users])

  const isOverdue = React.useMemo(() => {
    if (!task?.dueAt) return false
    return new Date(task.dueAt) < new Date() && task.status !== "DONE"
  }, [task])

  // ── Title commit handlers ──────────────────────────────────────────────────

  const handleCommitTitle = React.useCallback(
    (next: string) => handleFieldChange("title", next),
    [handleFieldChange]
  )
  const handleCommitDescription = React.useCallback(
    (next: string) => handleFieldChange("description", next),
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

  const handleMarkDone = React.useCallback(() => {
    if (!task) return
    handleStatusChange("DONE")
  }, [task, handleStatusChange])

  const handleCancelTask = React.useCallback(() => {
    if (!task) return
    handleStatusChange("DONE")
  }, [task, handleStatusChange])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Copy link",
        icon: <ContentCopyIcon sx={{ fontSize: 14 }} />,
        onClick: handleCopyLink,
      },
      {
        label: "Mark done",
        icon: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
        onClick: handleMarkDone,
      },
      {
        label: "Cancel task",
        icon: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: handleCancelTask,
        danger: true,
      },
    ],
    [handleCopyLink, handleMarkDone, handleCancelTask]
  )

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!task) return []
    const priorityColours = PRIORITY_COLOURS[task.priority] ?? PRIORITY_COLOURS.medium
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
              Task
            </Typography>
          </Box>
        ),
      },
      {
        key: "priority",
        label: "Priority",
        editable: true,
        currentValue: task.priority,
        popoverOptions: PRIORITY_OPTIONS,
        onSelect: handleSelectPriority,
        value: (
          <Box sx={valueWrapperSx}>
            <Chip
              size="small"
              label={task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
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
        currentValue: task.assigneeId ?? "",
        popoverOptions: usersOptions,
        onSelect: handleSelectAssignee,
        value: (
          <Box sx={valueWrapperSx}>
            {task.assignee ? (
              <Typography sx={{ fontSize: 12 }}>{userLabel(task.assignee)}</Typography>
            ) : (
              <Typography
                sx={{ fontSize: 12, color: "text.disabled", fontStyle: "italic" }}
              >
                Unassigned
              </Typography>
            )}
          </Box>
        ),
      },
      {
        key: "dueAt",
        label: "Due date",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography
              sx={{
                fontSize: 12,
                color: isOverdue ? "#b91c1c" : "text.secondary",
                fontWeight: isOverdue ? 600 : 400,
              }}
            >
              {task.dueAt ? formatDate(task.dueAt) : "N/A"}
            </Typography>
          </Box>
        ),
      },
    ]
  }, [task, usersOptions, handleSelectPriority, handleSelectAssignee, isOverdue])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!task) return []
    return [
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
              savingNote={savingNote}
              onPostNote={handleAddNote}
            />
          </SectionPanel>
        ),
      },
    ]
  }, [
    task,
    visibleFeedEvents,
    activeFilter,
    handleFilterChange,
    savingNote,
    handleAddNote,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!task) return undefined
    return {
      submittedBy: null,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    }
  }, [task])

  const rightSections = React.useMemo<RightSection[]>(() => {
    return [
      {
        id: "attachments",
        title: "Attachments",
        defaultOpen: false,
        headerAdd: { onClick: () => attachRef.current?.openPicker(), tooltip: "Attach file" },
        content: (
          <AttachmentsContent
            ref={attachRef}
            attachments={task?.attachments ?? []}
            recordType="task"
            recordId={task?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["task-detail", id] })}
            showAddButton={false}
          />
        ),
      },
      {
        id: "linked",
        title: "Linked records",
        defaultOpen: true,
        headerAdd: { onClick: handleAddLink, tooltip: "Link record" },
        content: (
          <LinkedRecordsContent
            links={links}
            onAddLink={handleAddLink}
            onUnlink={handleUnlink}
            showAddButton={false}
          />
        ),
      },
    ]
  }, [
    task,
    qc,
    id,
    links,
    handleAddLink,
    handleUnlink,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────

  // canManage gates editability — currently the shell exposes editing through
  // popovers/inline editors directly; we still compute it to silence lint.
  void canManage

  if (isLoading) return <LoadingState />
  if (!task) return <ErrorState title="Task not found" />

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
        recordRef={task.reference}
        typeBadge={TASK_TYPE_BADGE}
        currentStatus={task.status}
        statusConfig={TASK_STATUS_CONFIG}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <EditableTitleCard
            title={task.title}
            description={task.description ?? ""}
            onCommitTitle={handleCommitTitle}
            onCommitDescription={handleCommitDescription}
          />
        }
        sections={sections}
        detailFields={detailFields}
        metadata={metadata}
        rightSections={rightSections}
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
        sourceType="task"
        sourceId={task.id}
        onLinked={() => qc.invalidateQueries({ queryKey: ["task-detail", id] })}
      />
    </>
  )
}
