import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Button,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import PersonIcon from "@mui/icons-material/Person"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import LockIcon from "@mui/icons-material/Lock"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined"
import { downloadRecordReport } from "../lib/recordReport"
import CloseIcon from "@mui/icons-material/Close"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
import StorageIcon from "@mui/icons-material/Storage"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import BuildIcon from "@mui/icons-material/Build"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined"
import { statusColors, priorityToken, accentToken, PriorityPill, TypeBadge, AssigneeCell, type LinkedTask, type ThemeMode } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { useThemeMode } from "../lib/theme"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useActivityFilter } from "../lib/useActivityFilter"
import { CreateTaskModal, TaskQuickDetailModal } from "./TasksPage"
import {
  SlimExpandCommentBox,
  ActivityFeedItem,
  type ResolvedMention,
  type CommentDraft,
  type FeedEvent,
  EditableTitleCard,
  ActivityTabs,
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
import { transitions as serviceRequestTransitions } from "../config/transitions/serviceRequestTransitions"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
import type { AttachmentSummary } from "../lib/attachments"
import { LinkRecordDialog } from "../components/LinkRecordDialog"
import { deleteRecordLink, type ResolvedLink } from "../lib/linkedRecords"
import { TasksSectionContent } from "../components/TasksSectionContent"
import { type AuditEvent } from "../lib/auditEvents"
import { AuditHistoryList } from "../components/AuditHistoryList"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type SR = {
  id: string
  reference: string
  subject: string
  description: string
  status: string
  priority: string
  closureSummary: string | null
  createdById?: string | null
  createdBy?: { id: string; displayName: string } | null
  links?: ResolvedLink[]
  attachments?: AttachmentSummary[]
  createdAt: string
  updatedAt: string
  assignee: { id: string; displayName: string } | null
  client: { id: string; name: string }
}

type SRComment = {
  id: string
  body: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
  type: string
  visibleToCustomer: boolean
  fromCustomer: boolean
  createdAt: string
  author: { id: string; displayName: string }
  // Two-level threading: a post's replies are themselves comments (same shape).
  replies?: SRComment[]
}


type LinkedTaskWithAssignee = LinkedTask & {
  assigneeId?: string | null
  assignee?: { id: string; displayName: string } | null
}

type EditableField = "subject" | "description" | "priority" | "assigneeId"

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.3
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  WAITING_CUSTOMER: "Waiting on customer",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  NEW: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  ASSIGNED: <PersonIcon sx={{ fontSize: 14 }} />,
  IN_PROGRESS: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  WAITING_CUSTOMER: <HourglassEmptyIcon sx={{ fontSize: 14 }} />,
  COMPLETED: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  CLOSED: <LockIcon sx={{ fontSize: 14 }} />,
  CANCELLED: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
}

const SR_STATUS_ORDER = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_CUSTOMER",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]

// Built per-render with the active mode (statusColors light branch is unchanged),
// so the status pill + popover swatches follow the theme.
function buildSRStatusConfig(mode: ThemeMode): StatusConfig {
  return {
    options: SR_STATUS_ORDER.map<StatusOption>((value) => ({
      value,
      label: STATUS_LABELS[value],
      badgeClass: `b-${value.toLowerCase()}`,
      bg: statusColors(value, mode).bg,
      iconColor: statusColors(value, mode).text,
      icon: STATUS_ICONS[value],
      buttonIcon: STATUS_ICONS[value],
    })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Priority popover options
// ─────────────────────────────────────────────────────────────────────────────

const PRIORITY_VALUES = ["low", "medium", "high", "critical"]

// priorityToken reproduces the prior PRIORITY_COLOURS values exactly in light, and
// adds the dark ramp — so a priority swatch matches the PriorityPill everywhere.
function buildPriorityOptions(mode: ThemeMode): PopoverOption[] {
  return PRIORITY_VALUES.map((value) => {
    const tok = priorityToken(value, mode)
    return {
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1),
      iconBg: tok.bg,
      iconColor: tok.text,
      icon: <FlagOutlinedIcon sx={{ fontSize: 14 }} />,
    }
  })
}

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


function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message)) return message.join(", ")
  }
  return fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity section (spec section 6)
// ─────────────────────────────────────────────────────────────────────────────

interface ActivityContentProps {
  events: FeedEvent[]
  auditEvents: AuditEvent[]
  activeFilter: ActivityFilter
  onFilterChange: (filter: ActivityFilter) => void
  savingNote: boolean
  onPostNote: (draft: CommentDraft) => void | Promise<void>
}

const ActivityContent = React.memo(function ActivityContent({
  events,
  auditEvents,
  activeFilter,
  onFilterChange,
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

      {activeFilter === "comment" ? (
        <SlimExpandCommentBox saving={savingNote} onPost={onPostNote} />
      ) : null}

      {total === 0 ? (
        <Typography
          variant="caption"
          sx={{ color: "text.tertiary" }}
        >
          No activity to show
        </Typography>
      ) : isHistory ? (
        <AuditHistoryList events={auditEvents.slice(0, visibleCount)} recordNoun="service request" />
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
// Attachments section (spec 7.3)
// ─────────────────────────────────────────────────────────────────────────────

// Attachments panel is provided by the shared AttachmentsContent component.

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function ServiceRequestDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { mode } = useThemeMode()
  const srStatusConfig = React.useMemo(() => buildSRStatusConfig(mode), [mode])
  const priorityOptions = React.useMemo(() => buildPriorityOptions(mode), [mode])

  const canManage = hasAnyRole([
    ...ORG_SUPER_ROLES,
    ROLES.SERVICE_MANAGER,
    ROLES.SERVICE_DESK_ANALYST,
  ])

  const { activeFilter, handleFilterChange, resetFilterAfterComment } =
    useActivityFilter()

  const [error, setError] = React.useState("")
  const [taskOpen, setTaskOpen] = React.useState(false)
  const [quickTaskId, setQuickTaskId] = React.useState<string | null>(null)
  const [savingNote, setSavingNote] = React.useState(false)
  const [transitionTarget, setTransitionTarget] = React.useState<Transition | null>(null)
  const [linkCopied, setLinkCopied] = React.useState(false)

  // ── Queries (preserved exactly) ────────────────────────────────────────────

  const { data: sr, isLoading } = useQuery({
    queryKey: ["sr-detail", id],
    queryFn: async () => (await api.get<SR>(`/service-requests/${id}`)).data,
    enabled: !!id,
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-sr", id],
    queryFn: async () =>
      (
        await api.get<LinkedTaskWithAssignee[]>("/tasks", {
          params: { linkedEntityType: "ServiceRequest", linkedEntityId: id },
        })
      ).data,
    enabled: !!id,
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-sr", id],
    queryFn: async () =>
      (await api.get<SRComment[]>(`/comments/ServiceRequest/${id}/work-notes`)).data,
    enabled: !!id,
  })

  const { data: customerUpdates } = useQuery({
    queryKey: ["customer-updates-sr", id],
    queryFn: async () =>
      (await api.get<SRComment[]>(`/comments/ServiceRequest/${id}/customer-updates`)).data,
    enabled: !!id,
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-sr", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/ServiceRequest/${id}`)).data,
    enabled: !!id,
  })

  // Assignee-picker source (operational-callable; scoped to the active client).
  const { data: assignableUsers = [] } = useAssignableUsers()


  // ── Mutations (preserved exactly) ──────────────────────────────────────────

  const handleFieldChange = React.useCallback(
    async (field: EditableField, value: string) => {
      if (!sr) return
      setError("")
      try {
        await api.put(`/service-requests/${id}`, { [field]: value })
        qc.invalidateQueries({ queryKey: ["sr-detail", id] })
        qc.invalidateQueries({ queryKey: ["audit-sr", id] })
        qc.invalidateQueries({ queryKey: ["tickets"] })
        // Confirm only the subject/description edits — popover-driven fields
        // (priority/assignee) flow through here too and stay silent.
        if (field === "subject") notify.success("Title updated")
        else if (field === "description") notify.success("Description updated")
      } catch (e: unknown) {
        // Subject/description surface as a toast and rethrow, so EditableField
        // keeps the field editable with the draft. Popover fields stay silent.
        if (field === "subject" || field === "description") {
          notify.error("Couldn't save — please try again")
          throw e
        }
        setError(getApiErrorMessage(e, "Failed to save service request"))
      }
    },
    [id, sr, qc, notify]
  )

  // Commit path for the pending-confirm Details popover fields (priority/assignee).
  // Unlike handleFieldChange it does NOT swallow errors or toast — the shell awaits
  // this on ✓ and owns the success/error toast + pending state.
  const commitDetailField = React.useCallback(
    async (field: EditableField, value: string) => {
      await api.put(`/service-requests/${id}`, { [field]: value })
      await qc.invalidateQueries({ queryKey: ["sr-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    [id, qc]
  )

  const handleAddNote = React.useCallback(async (draft: CommentDraft) => {
    if (!draft.body.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "ServiceRequest",
        entityId: id,
        body: draft.body,
        bodyJson: draft.bodyJson,
        mentions: draft.mentions,
        serviceRequestId: id,
      })
      qc.invalidateQueries({ queryKey: ["work-notes-sr", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
      resetFilterAfterComment()
      notify.success("Note added")
    } finally {
      setSavingNote(false)
    }
  }, [id, qc, resetFilterAfterComment, notify])

  const statusMutation = useMutation({
    mutationFn: async ({
      to,
      data,
    }: {
      to: string
      data?: Record<string, string>
    }) => {
      const assigneeId = data?.assigneeId?.trim()
      if (assigneeId) {
        await api.put(`/service-requests/${id}`, { assigneeId })
      }

      const closureSummary = data?.resolution?.trim()
      const payload: { status: string; closureSummary?: string } = { status: to }
      if (closureSummary) {
        payload.closureSummary = closureSummary
      }
      await api.post(`/service-requests/${id}/status`, payload)

      const note = (data?.note ?? data?.reason ?? "").trim()
      if (note) {
        await api.post("/comments/work-note", {
          entityType: "ServiceRequest",
          entityId: id,
          body: note,
          serviceRequestId: id,
        })
      }
    },
    onSuccess: () => {
      setError("")
      qc.invalidateQueries({ queryKey: ["sr-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-sr", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    onError: (e: unknown) => {
      setError(getApiErrorMessage(e, "Failed to update status"))
    },
  })

  const handleStatusChange = React.useCallback(
    (to: string) => {
      if (!sr) return
      const transition = serviceRequestTransitions.find(
        (t) => t.from === sr.status && t.to === to
      )
      if (transition?.requiresDialog) {
        setTransitionTarget(transition)
      } else {
        statusMutation.mutate({ to })
      }
    },
    [sr, statusMutation]
  )

  const handleTransitionConfirm = React.useCallback(
    (data: Record<string, string>) => {
      if (!transitionTarget) return
      statusMutation.mutate({ to: transitionTarget.to, data })
      setTransitionTarget(null)
    },
    [transitionTarget, statusMutation]
  )

  const handleTransitionClose = React.useCallback(() => {
    setTransitionTarget(null)
  }, [])

  // Customer-update mutation preserved (not surfaced in the new compose box).
  const customerUpdateMutation = useMutation({
    mutationFn: async (body: string) =>
      api.post("/comments/customer-update", {
        entityType: "ServiceRequest",
        entityId: id,
        body: body.trim(),
        serviceRequestId: id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-updates-sr", id] })
      qc.invalidateQueries({ queryKey: ["audit-sr", id] })
    },
  })
  void customerUpdateMutation

  const patchLinkedTask = React.useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (taskId: string, patch: Record<string, any>) => {
      await api.put(`/tasks/${taskId}`, patch)
      qc.invalidateQueries({ queryKey: ["linked-tasks-sr", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskStatus = React.useCallback(
    async (taskId: string, status: string) => {
      await api.post(`/tasks/${taskId}/status`, { status })
      qc.invalidateQueries({ queryKey: ["linked-tasks-sr", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskAssignee = React.useCallback(
    async (taskId: string, assigneeId: string) => {
      await api.put(`/tasks/${taskId}`, { assigneeId: assigneeId || null })
      qc.invalidateQueries({ queryKey: ["linked-tasks-sr", id] })
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
    () => qc.invalidateQueries({ queryKey: ["linked-tasks-sr", id] }),
    [id, qc]
  )

  const handleOpenFullTask = React.useCallback(
    (taskId: string) => {
      if (!sr) return
      navigate(`/tasks/${taskId}`, {
        state: { fromSR: sr.id, fromSRRef: sr.reference },
      })
    },
    [sr, navigate]
  )


  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const handleAddLink = React.useCallback(() => setLinkDialogOpen(true), [])
  // Lets the Attachments section-header "+" open the (encapsulated) file picker.
  const attachRef = React.useRef<AttachmentsHandle>(null)
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => deleteRecordLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sr-detail", id] }),
  })
  const handleUnlink = React.useCallback(
    (linkId: string) => unlinkMutation.mutate(linkId),
    [unlinkMutation]
  )

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Derived ────────────────────────────────────────────────────────────────

  const links = sr?.links ?? []

  // Comments tab feed — work-notes + customer updates. History renders the audit
  // stream directly via AuditHistoryList (no longer routed through FeedEvents).
  const allFeedEvents = React.useMemo<FeedEvent[]>(() => {
    const notes: FeedEvent[] = (workNotes ?? []).map((n) => ({
      id: `note-${n.id}`,
      type: "comment",
      actor: n.author.displayName,
      text: null,
      commentKind: "work_note",
      note: n.body,
      bodyJson: n.bodyJson,
      mentions: n.mentions,
      commentId: n.id,
      entityId: id,
      replies: (n.replies ?? []).map((r) => ({
        id: r.id,
        actor: r.author.displayName,
        note: r.body,
        bodyJson: r.bodyJson,
        mentions: r.mentions,
        time: formatDateTime(r.createdAt),
      })),
      time: formatDateTime(n.createdAt),
      createdAt: n.createdAt,
    }))
    const updates: FeedEvent[] = (customerUpdates ?? []).map((c) => ({
      id: `cu-${c.id}`,
      type: "comment",
      actor: c.author.displayName,
      text: null,
      commentKind: "customer_update",
      note: c.body,
      bodyJson: c.bodyJson,
      mentions: c.mentions,
      commentId: c.id,
      entityId: id,
      replies: (c.replies ?? []).map((r) => ({
        id: r.id,
        actor: r.author.displayName,
        note: r.body,
        bodyJson: r.bodyJson,
        mentions: r.mentions,
        time: formatDateTime(r.createdAt),
      })),
      time: formatDateTime(c.createdAt),
      createdAt: c.createdAt,
    }))
    return [...notes, ...updates].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [workNotes, customerUpdates, id])

  const visibleFeedEvents = React.useMemo<FeedEvent[]>(() => {
    return filterFeedEvents(allFeedEvents, activeFilter)
  }, [allFeedEvents, activeFilter])

  const usersOptions = React.useMemo<PopoverOption[]>(() => {
    const green = accentToken("green", mode)
    const neutral = accentToken("neutral", mode)
    const list: PopoverOption[] = assignableUsers.map((u) => ({
      value: u.id,
      label: u.displayName,
      iconBg: green.bg,
      iconColor: green.text,
      icon: <PersonIcon sx={{ fontSize: 14 }} />,
    }))
    return [
      {
        value: "",
        label: "Unassigned",
        iconBg: neutral.bg,
        iconColor: neutral.text,
        icon: <PersonIcon sx={{ fontSize: 14 }} />,
      },
      ...list,
    ]
  }, [assignableUsers, mode])

  // ── Title commit handlers ──────────────────────────────────────────────────

  const handleCommitSubject = React.useCallback(
    (next: string) => handleFieldChange("subject", next),
    [handleFieldChange]
  )
  const handleCommitDescription = React.useCallback(
    (next: string) => handleFieldChange("description", next),
    [handleFieldChange]
  )

  // ── Field-popover handlers ─────────────────────────────────────────────────

  const handleSelectPriority = React.useCallback(
    (v: string) => commitDetailField("priority", v),
    [commitDetailField]
  )
  const handleSelectAssignee = React.useCallback(
    (v: string) => commitDetailField("assigneeId", v),
    [commitDetailField]
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

  const handleCloseRequest = React.useCallback(() => {
    if (!sr) return
    handleStatusChange("CLOSED")
  }, [sr, handleStatusChange])

  const handleCancelRequest = React.useCallback(() => {
    if (!sr) return
    handleStatusChange("CANCELLED")
  }, [sr, handleStatusChange])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Export as PDF",
        icon: <PictureAsPdfOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: () => {
          if (!sr) return
          void downloadRecordReport("service_request", sr.id, sr.reference).catch(() =>
            notify.error("Couldn't generate the PDF — please try again")
          )
        },
      },
      {
        label: "Copy link",
        icon: <ContentCopyIcon sx={{ fontSize: 14 }} />,
        onClick: handleCopyLink,
      },
      {
        label: "Close request",
        icon: <CloseIcon sx={{ fontSize: 14 }} />,
        onClick: handleCloseRequest,
      },
      {
        label: "Cancel request",
        icon: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: handleCancelRequest,
        danger: true,
      },
    ],
    [sr, notify, handleCopyLink, handleCloseRequest, handleCancelRequest]
  )

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!sr) return []
    const valueWrapperSx = {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      textAlign: "right",
      gap: 0.5,
    } as const
    const fields: DetailField[] = [
      {
        key: "type",
        label: "Type",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <TypeBadge kind="SR" label="Service Request" />
          </Box>
        ),
      },
      {
        key: "client",
        label: "Client",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography variant="body2" color="text.secondary">
              {sr.client.name}
            </Typography>
          </Box>
        ),
      },
      {
        key: "priority",
        label: "Priority",
        editable: true,
        currentValue: sr.priority,
        popoverOptions: priorityOptions,
        onSelect: handleSelectPriority,
        value: (
          <Box sx={valueWrapperSx}>
            <PriorityPill
              priority={sr.priority}
              label={sr.priority.charAt(0).toUpperCase() + sr.priority.slice(1)}
            />
          </Box>
        ),
      },
      {
        key: "assigneeId",
        label: "Assignee",
        editable: true,
        currentValue: sr.assignee?.id ?? "",
        popoverOptions: usersOptions,
        onSelect: handleSelectAssignee,
        value: (
          <Box sx={valueWrapperSx}>
            <AssigneeCell user={sr.assignee} mode={mode} />
          </Box>
        ),
      },
    ]

    if (sr.closureSummary) {
      fields.push({
        key: "closureSummary",
        label: "Closure",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography sx={{ fontSize: 12, color: accentToken("green", mode).text, whiteSpace: "pre-wrap" }}>
              {sr.closureSummary}
            </Typography>
          </Box>
        ),
      })
    }

    return fields
  }, [sr, usersOptions, priorityOptions, mode, handleSelectPriority, handleSelectAssignee])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!sr) return []
    return [
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
              savingNote={savingNote}
              onPostNote={handleAddNote}
            />
          </SectionPanel>
        ),
      },
    ]
  }, [
    sr,
    visibleFeedEvents,
    auditEvents,
    activeFilter,
    handleFilterChange,
    savingNote,
    handleAddNote,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!sr) return undefined
    return {
      submittedBy: <AssigneeCell user={sr.createdBy ?? null} emptyLabel="—" mode={mode} />,
      createdAt: sr.createdAt,
      updatedAt: sr.updatedAt,
    }
  }, [sr, mode])

  const rightSections = React.useMemo<RightSection[]>(() => {
    return [
      {
        id: "tasks",
        title: "Tasks",
        headerAdd: canManage
          ? { onClick: handleOpenCreateTask, tooltip: "Add task" }
          : undefined,
        content: (
          <TasksSectionContent
            tasks={linkedTasks ?? []}
            users={assignableUsers}
            canManage={canManage}
            mode={mode}
            onCreate={handleOpenCreateTask}
            onSelectTask={handleSelectTask}
            onChangeTaskStatus={updateLinkedTaskStatus}
            onChangeTaskAssignee={updateLinkedTaskAssignee}
            showAddButton={false}
          />
        ),
      },
      {
        id: "attachments",
        title: "Attachments",
        headerAdd: { onClick: () => attachRef.current?.openPicker(), tooltip: "Attach file" },
        content: (
          <AttachmentsContent
            ref={attachRef}
            attachments={sr?.attachments ?? []}
            recordType="service_request"
            recordId={sr?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["sr-detail", id] })}
            showAddButton={false}
          />
        ),
      },
      {
        id: "linked",
        title: "Linked records",
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
    sr,
    qc,
    id,
    links,
    handleAddLink,
    handleUnlink,
    linkedTasks,
    assignableUsers,
    canManage,
    handleOpenCreateTask,
    handleSelectTask,
    updateLinkedTaskStatus,
    updateLinkedTaskAssignee,
  ])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingState />
  if (!sr) return <ErrorState title="Service request not found" />

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
        recordRef={sr.reference}
        typeBadge={null}
        currentStatus={sr.status}
        statusConfig={srStatusConfig}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <EditableTitleCard
            title={sr.subject}
            description={sr.description}
            onCommitTitle={handleCommitSubject}
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
        linkedEntityType="ServiceRequest"
        linkedEntityId={sr.id}
        linkedEntityLabel={sr.reference}
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

      <LinkRecordDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        sourceType="service_request"
        sourceId={sr.id}
        onLinked={() => qc.invalidateQueries({ queryKey: ["sr-detail", id] })}
      />
    </>
  )
}
