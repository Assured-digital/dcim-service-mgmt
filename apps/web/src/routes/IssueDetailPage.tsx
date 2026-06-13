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
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import LockIcon from "@mui/icons-material/Lock"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import CloseIcon from "@mui/icons-material/Close"
import StorageIcon from "@mui/icons-material/Storage"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import LocationOnIcon from "@mui/icons-material/LocationOn"
import BuildIcon from "@mui/icons-material/Build"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import { statusColors, type LinkedTask } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useActivityFilter } from "../lib/useActivityFilter"
import { CreateTaskModal, TaskQuickDetailModal } from "./TasksPage"
import { useBreadcrumb } from "./Shell"
import {
  EditableTitleCard,
  useDetailNarrow,
  ActivityTabs,
  SlimExpandCommentBox,
  ActivityFeedItem,
  type FeedEvent,
  type FeedEventType,
  type ResolvedMention,
  type CommentDraft,
  SectionPanel,
  RecordDetailShell,
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
import { transitions as issueTransitions } from "../config/transitions/issueTransitions"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { TasksSectionContent } from "../components/TasksSectionContent"
import { useDrillNav } from "../lib/drillNav"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
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
  actorDisplayName?: string | null
  data?: Record<string, unknown> | null
  createdAt: string
}

type IssueComment = {
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
  replies?: IssueComment[]
}



type LinkedTaskWithAssignee = LinkedTask & {
  assigneeId?: string | null
  assignee?: { id: string; displayName: string } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.6
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
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
    bg: statusColors(value).bg,
    iconColor: statusColors(value).text,
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

export default function IssueDetailPage() {
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
        // Confirm only the title/description edits — popover-driven fields patch
        // through here too and stay silent.
        if ("title" in patch) notify.success("Title updated")
        else if ("description" in patch) notify.success("Description updated")
      } catch (e: unknown) {
        // Subject/description surface as a toast and rethrow, so EditableField
        // keeps the field editable with the draft. Popover fields stay silent.
        if ("title" in patch || "description" in patch) {
          notify.error("Couldn't save — please try again")
          throw e
        }
        setError(getApiErrorMessage(e, "Failed to save issue properties"))
      }
    },
    [id, issue, qc, notify]
  )

  const handleAddNote = React.useCallback(async (draft: CommentDraft) => {
    if (!draft.body.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Issue",
        entityId: id,
        body: draft.body,
        bodyJson: draft.bodyJson,
        mentions: draft.mentions,
      })
      qc.invalidateQueries({ queryKey: ["work-notes-issue", id] })
      qc.invalidateQueries({ queryKey: ["audit-issue", id] })
      resetFilterAfterComment()
      notify.success("Note added")
    } finally {
      setSavingNote(false)
    }
  }, [id, qc, resetFilterAfterComment, notify])

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
  // Lets the Attachments section-header "+" open the (encapsulated) file picker.
  const attachRef = React.useRef<AttachmentsHandle>(null)
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
    issue,
    visibleFeedEvents,
    activeFilter,
    handleFilterChange,
    savingNote,
    handleAddNote,
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
        id: "tasks",
        title: "Tasks",
        headerAdd: canManage
          ? { onClick: handleOpenCreateTask, tooltip: "Add task" }
          : undefined,
        content: (
          <TasksSectionContent
            tasks={linkedTasks ?? []}
            users={users}
            canManage={canManage}
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
            attachments={issue?.attachments ?? []}
            recordType="issue"
            recordId={issue?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["issue-detail", id] })}
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
    issue,
    qc,
    id,
    links,
    handleAddLink,
    handleUnlink,
    linkedTasks,
    users,
    canManage,
    handleOpenCreateTask,
    handleSelectTask,
    updateLinkedTaskStatus,
    updateLinkedTaskAssignee,
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
          <EditableTitleCard
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
