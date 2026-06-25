import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
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
  EditableTitleCard,
  ActivityTabs,
  SlimExpandCommentBox,
  ActivityFeedItem,
  type ResolvedMention,
  type CommentDraft,
  type FeedEvent,
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
import { transitions as incidentTransitions } from "../config/transitions/incidentTransitions"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { TasksSectionContent } from "../components/TasksSectionContent"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
import type { AttachmentSummary } from "../lib/attachments"
import { LinkRecordDialog } from "../components/LinkRecordDialog"
import { deleteRecordLink, type ResolvedLink } from "../lib/linkedRecords"
import { type AuditEvent } from "../lib/auditEvents"
import { AuditHistoryList } from "../components/AuditHistoryList"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type Incident = {
  id: string
  reference: string
  title: string
  description: string
  status: string
  severity: string
  priority: string
  assigneeId: string | null
  assignee: { id: string; displayName: string } | null
  createdById?: string | null
  createdBy?: { id: string; displayName: string } | null
  links?: ResolvedLink[]
  attachments?: AttachmentSummary[]
  createdAt: string
  updatedAt: string
}

type IncidentComment = {
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
  replies?: IncidentComment[]
}

type LinkedTaskWithAssignee = LinkedTask & {
  assigneeId?: string | null
  assignee?: { id: string; displayName: string } | null
}

type EditableField = "severity" | "priority" | "assigneeId" | "title" | "description"

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.1
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  INVESTIGATING: "Investigating",
  MITIGATED: "Mitigated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  NEW: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  INVESTIGATING: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  MITIGATED: <HourglassEmptyIcon sx={{ fontSize: 14 }} />,
  RESOLVED: <CheckCircleOutlineIcon sx={{ fontSize: 14 }} />,
  CLOSED: <LockIcon sx={{ fontSize: 14 }} />,
}

// Built per-render with the active mode (statusColors light branch is unchanged).
function buildIncidentStatusConfig(mode: ThemeMode): StatusConfig {
  return {
    options: ["NEW", "INVESTIGATING", "MITIGATED", "RESOLVED", "CLOSED"].map<StatusOption>((value) => ({
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
// Severity / Priority popover options
// ─────────────────────────────────────────────────────────────────────────────

// Severity + priority share the 4-step priorityToken ramp; its light values equal
// the prior SEVERITY_COLOURS / PRIORITY_COLOURS exactly, and it adds the dark ramp.
function buildSeverityOptions(mode: ThemeMode): PopoverOption[] {
  return ["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((value) => {
    const tok = priorityToken(value, mode)
    return {
      value,
      label: value.charAt(0) + value.slice(1).toLowerCase(),
      iconBg: tok.bg,
      iconColor: tok.text,
      icon: <WarningAmberIcon sx={{ fontSize: 14 }} />,
    }
  })
}

const PRIORITY_VALUES = ["low", "medium", "high", "critical"]

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

  // History ("all") renders the audit stream directly via the shared humaniser;
  // the Comments tab keeps the FeedEvent path.
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
        <AuditHistoryList
          events={auditEvents.slice(0, visibleCount)}
          recordNoun="incident"
        />
      ) : (
        visibleEvents.map((event, idx) => (
          <ActivityFeedItem
            key={event.id}
            event={event}
            isLast={idx === visibleEvents.length - 1}
            mode={mode}
          />
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

export default function IncidentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { mode } = useThemeMode()
  const incidentStatusConfig = React.useMemo(() => buildIncidentStatusConfig(mode), [mode])
  const severityOptions = React.useMemo(() => buildSeverityOptions(mode), [mode])
  const priorityOptions = React.useMemo(() => buildPriorityOptions(mode), [mode])

  const canManage = hasAnyRole([
    ...ORG_SUPER_ROLES,
    ROLES.SERVICE_MANAGER,
    ROLES.SERVICE_DESK_ANALYST,
    ROLES.ENGINEER,
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

  const { data: incident, isLoading } = useQuery({
    queryKey: ["incident-detail", id],
    queryFn: async () => (await api.get<Incident>(`/incidents/${id}`)).data,
    enabled: !!id,
  })

  // Assignee-picker source (operational-callable; scoped to the active client).
  const { data: assignableUsers = [] } = useAssignableUsers()

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-incident", id],
    queryFn: async () =>
      (
        await api.get<LinkedTaskWithAssignee[]>("/tasks", {
          params: { linkedEntityType: "Incident", linkedEntityId: id },
        })
      ).data,
    enabled: !!id,
  })

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-incident", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/Incident/${id}`)).data,
    enabled: !!id,
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-incident", id],
    queryFn: async () =>
      (await api.get<IncidentComment[]>(`/comments/Incident/${id}/work-notes`)).data,
    enabled: !!id,
  })

  // ── Mutations (preserved exactly) ──────────────────────────────────────────

  const handleFieldChange = React.useCallback(
    async (field: EditableField, value: string) => {
      if (!incident) return
      setError("")
      try {
        await api.put(`/incidents/${id}`, { [field]: value })
        qc.invalidateQueries({ queryKey: ["incident-detail", id] })
        qc.invalidateQueries({ queryKey: ["audit-incident", id] })
        qc.invalidateQueries({ queryKey: ["tickets"] })
        // Confirm only the title/description edits — popover-driven fields (severity
        // /priority/assignee) flow through here too and stay silent.
        if (field === "title") notify.success("Title updated")
        else if (field === "description") notify.success("Description updated")
      } catch (e: unknown) {
        // Subject/description surface as a toast and rethrow, so EditableField
        // keeps the field editable with the draft. Popover fields stay silent.
        if (field === "title" || field === "description") {
          notify.error("Couldn't save — please try again")
          throw e
        }
        setError(getApiErrorMessage(e, "Failed to save incident properties"))
      }
    },
    [id, incident, qc, notify]
  )

  // Commit path for the pending-confirm Details popover fields (severity/priority/
  // assignee). Unlike handleFieldChange it does NOT swallow errors or toast — the
  // shell awaits this on ✓ and owns the success/error toast + pending state. The
  // primary detail invalidation is awaited so the row shows the committed value
  // before the pending state clears (no flash).
  const commitDetailField = React.useCallback(
    async (field: EditableField, value: string) => {
      await api.put(`/incidents/${id}`, { [field]: value })
      await qc.invalidateQueries({ queryKey: ["incident-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-incident", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    [id, qc]
  )

  const handleAddNote = React.useCallback(async (draft: CommentDraft) => {
    if (!draft.body.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Incident",
        entityId: id,
        body: draft.body,
        bodyJson: draft.bodyJson,
        mentions: draft.mentions,
      })
      qc.invalidateQueries({ queryKey: ["work-notes-incident", id] })
      qc.invalidateQueries({ queryKey: ["audit-incident", id] })
      resetFilterAfterComment()
      notify.success("Note added")
    } finally {
      setSavingNote(false)
    }
  }, [id, qc, resetFilterAfterComment, notify])

  const statusMutation = useMutation({
    mutationFn: async ({ to, comment }: { to: string; comment?: string }) =>
      api.post(`/incidents/${id}/status`, { status: to, comment }),
    onSuccess: () => {
      setError("")
      qc.invalidateQueries({ queryKey: ["incident-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-incident", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-incident", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    onError: (e: unknown) => {
      setError(getApiErrorMessage(e, "Failed to update status"))
    },
  })

  const handleStatusChange = React.useCallback(
    (to: string) => {
      if (!incident) return
      const transition = incidentTransitions.find(
        (t) => t.from === incident.status && t.to === to
      )
      if (transition?.requiresDialog) {
        setTransitionTarget(transition)
      } else {
        statusMutation.mutate({ to })
      }
    },
    [incident, statusMutation]
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
      qc.invalidateQueries({ queryKey: ["linked-tasks-incident", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskStatus = React.useCallback(
    async (taskId: string, status: string) => {
      await api.post(`/tasks/${taskId}/status`, { status })
      qc.invalidateQueries({ queryKey: ["linked-tasks-incident", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskAssignee = React.useCallback(
    async (taskId: string, assigneeId: string) => {
      await api.put(`/tasks/${taskId}`, { assigneeId: assigneeId || null })
      qc.invalidateQueries({ queryKey: ["linked-tasks-incident", id] })
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
    () => qc.invalidateQueries({ queryKey: ["linked-tasks-incident", id] }),
    [id, qc]
  )

  const handleOpenFullTask = React.useCallback(
    (taskId: string) => {
      if (!incident) return
      navigate(`/tasks/${taskId}`, {
        state: { fromIncident: incident.id, fromIncidentRef: incident.reference },
      })
    },
    [incident, navigate]
  )

  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const handleAddLink = React.useCallback(() => setLinkDialogOpen(true), [])
  // Lets the Attachments section-header "+" open the (encapsulated) file picker.
  const attachRef = React.useRef<AttachmentsHandle>(null)
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => deleteRecordLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident-detail", id] }),
  })
  const handleUnlink = React.useCallback(
    (linkId: string) => unlinkMutation.mutate(linkId),
    [unlinkMutation]
  )

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Derived ────────────────────────────────────────────────────────────────

  const links = incident?.links ?? []

  // Comments tab feed — work-notes only. (History no longer routes through FeedEvents;
  // it renders the audit stream directly via AuditHistoryList.)
  const allFeedEvents = React.useMemo<FeedEvent[]>(() => {
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
    return notes.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [workNotes, id])

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

  const handleCommitTitle = React.useCallback(
    (next: string) => handleFieldChange("title", next),
    [handleFieldChange]
  )
  const handleCommitDescription = React.useCallback(
    (next: string) => handleFieldChange("description", next),
    [handleFieldChange]
  )

  // ── Field-popover handlers ─────────────────────────────────────────────────

  const handleSelectSeverity = React.useCallback(
    (v: string) => commitDetailField("severity", v),
    [commitDetailField]
  )
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

  const handleCloseIncident = React.useCallback(() => {
    if (!incident) return
    handleStatusChange("CLOSED")
  }, [incident, handleStatusChange])

  const handleCancelIncident = React.useCallback(() => {
    if (!incident) return
    handleStatusChange("CLOSED")
  }, [incident, handleStatusChange])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Export as PDF",
        icon: <PictureAsPdfOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: () => {
          if (!incident) return
          void downloadRecordReport("incident", incident.id, incident.reference).catch(() =>
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
        label: "Close incident",
        icon: <CloseIcon sx={{ fontSize: 14 }} />,
        onClick: handleCloseIncident,
      },
      {
        label: "Cancel incident",
        icon: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: handleCancelIncident,
        danger: true,
      },
    ],
    [incident, notify, handleCopyLink, handleCloseIncident, handleCancelIncident]
  )

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!incident) return []
    const severityColours = priorityToken(incident.severity, mode)
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
            <TypeBadge kind="INC" label="Incident" />
          </Box>
        ),
      },
      {
        key: "severity",
        label: "Severity",
        editable: true,
        currentValue: incident.severity,
        popoverOptions: severityOptions,
        onSelect: handleSelectSeverity,
        value: (
          <Box sx={valueWrapperSx}>
            <Chip
              size="small"
              label={incident.severity}
              sx={{
                bgcolor: severityColours?.bg ?? "action.hover",
                color: severityColours?.text ?? "text.secondary",
                fontWeight: 600,
                fontSize: 11,
                height: 20,
              }}
            />
          </Box>
        ),
      },
      {
        key: "priority",
        label: "Priority",
        editable: true,
        currentValue: incident.priority,
        popoverOptions: priorityOptions,
        onSelect: handleSelectPriority,
        value: (
          <Box sx={valueWrapperSx}>
            <PriorityPill
              priority={incident.priority}
              label={incident.priority.charAt(0).toUpperCase() + incident.priority.slice(1)}
            />
          </Box>
        ),
      },
      {
        key: "assigneeId",
        label: "Assignee",
        editable: true,
        currentValue: incident.assigneeId ?? "",
        popoverOptions: usersOptions,
        onSelect: handleSelectAssignee,
        value: (
          <Box sx={valueWrapperSx}>
            <AssigneeCell user={incident.assignee} mode={mode} />
          </Box>
        ),
      },
    ]
  }, [
    incident,
    mode,
    usersOptions,
    severityOptions,
    priorityOptions,
    handleSelectSeverity,
    handleSelectPriority,
    handleSelectAssignee,
  ])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!incident) return []
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
    incident,
    visibleFeedEvents,
    auditEvents,
    activeFilter,
    handleFilterChange,
    savingNote,
    handleAddNote,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!incident) return undefined
    return {
      submittedBy: <AssigneeCell user={incident.createdBy ?? null} emptyLabel="—" mode={mode} />,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    }
  }, [incident, mode])

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
            attachments={incident?.attachments ?? []}
            recordType="incident"
            recordId={incident?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["incident-detail", id] })}
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
    incident,
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
  if (!incident) return <ErrorState title="Incident not found" />

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
        recordRef={incident.reference}
        typeBadge={null}
        currentStatus={incident.status}
        statusConfig={incidentStatusConfig}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <EditableTitleCard
            title={incident.title}
            description={incident.description}
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
        linkedEntityType="Incident"
        linkedEntityId={incident.id}
        linkedEntityLabel={incident.reference}
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
        sourceType="incident"
        sourceId={incident.id}
        onLinked={() => qc.invalidateQueries({ queryKey: ["incident-detail", id] })}
      />
    </>
  )
}
