import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Chip,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty"
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
  ActivityCommentBox,
  ActivityFeedItem,
  type ResolvedMention,
  ActivityTabs,
  RecordDetailShell,
  type CommentDraft,
  SectionPanel,
  StatusPopover,
  TransitionDialog,
  filterFeedEvents,
  type ActivityFilter,
  type CentreSection,
  type DetailField,
  type FeedEvent,
  type FeedEventType,
  type MoreMenuItem,
  type PopoverOption,
  type RecordMetadata,
  type RightSection,
  type StatusConfig,
  type StatusOption,
  type Transition,
} from "../components/detail"
import { transitions as riskTransitions } from "../config/transitions/riskTransitions"
import { useAssignableUsers, type AssignableUser } from "../lib/useAssignableUsers"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { TasksSectionContent } from "../components/TasksSectionContent"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
import type { AttachmentSummary } from "../lib/attachments"
import { LinkRecordDialog } from "../components/LinkRecordDialog"
import { deleteRecordLink, type ResolvedLink } from "../lib/linkedRecords"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type Risk = {
  id: string
  reference: string
  title: string
  description: string
  likelihood: string
  impact: string
  status: string
  source: string | null
  mitigationPlan: string | null
  acceptanceNote: string | null
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

type RiskComment = {
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
  replies?: RiskComment[]
}



type LinkedTaskWithAssignee = LinkedTask & {
  assigneeId?: string | null
  assignee?: { id: string; displayName: string } | null
}

type AssessmentField = "mitigationPlan" | "acceptanceNote"

// ─────────────────────────────────────────────────────────────────────────────
// Status config — spec sections 8 + 9.5
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  IDENTIFIED: "Identified",
  ASSESSED: "Assessed",
  MITIGATING: "Mitigating",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  IDENTIFIED: <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />,
  ASSESSED: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  MITIGATING: <PlayArrowIcon sx={{ fontSize: 14 }} />,
  ACCEPTED: <HourglassEmptyIcon sx={{ fontSize: 14 }} />,
  CLOSED: <LockIcon sx={{ fontSize: 14 }} />,
}

const RISK_STATUS_CONFIG: StatusConfig = {
  options: ["IDENTIFIED", "ASSESSED", "MITIGATING", "ACCEPTED", "CLOSED"].map<StatusOption>(
    (value) => ({
      value,
      label: STATUS_LABELS[value],
      badgeClass: `b-${value.toLowerCase()}`,
      bg: statusColors(value).bg,
      iconColor: statusColors(value).text,
      icon: STATUS_ICONS[value],
      buttonIcon: STATUS_ICONS[value],
    })
  ),
}

// ─────────────────────────────────────────────────────────────────────────────
// Likelihood / Impact popover options
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL_COLOURS: Record<string, { bg: string; text: string }> = {
  LOW: { bg: "#dcfce7", text: "#15803d" },
  MEDIUM: { bg: "#fef3c7", text: "#b45309" },
  HIGH: { bg: "#fee2e2", text: "#b91c1c" },
}

const LEVEL_VALUES = ["LOW", "MEDIUM", "HIGH"] as const

const LIKELIHOOD_OPTIONS: PopoverOption[] = LEVEL_VALUES.map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
  iconBg: LEVEL_COLOURS[value].bg,
  iconColor: LEVEL_COLOURS[value].text,
  icon: <WarningAmberIcon sx={{ fontSize: 14 }} />,
}))

const IMPACT_OPTIONS: PopoverOption[] = LEVEL_VALUES.map((value) => ({
  value,
  label: value.charAt(0) + value.slice(1).toLowerCase(),
  iconBg: LEVEL_COLOURS[value].bg,
  iconColor: LEVEL_COLOURS[value].text,
  icon: <ErrorOutlineIcon sx={{ fontSize: 14 }} />,
}))

// ─────────────────────────────────────────────────────────────────────────────
// Type badge — spec section 3.3
// ─────────────────────────────────────────────────────────────────────────────

const RISK_TYPE_BADGE = (
  <Box
    component="span"
    sx={{
      fontSize: 10,
      fontWeight: 500,
      bgcolor: "#faeeda",
      color: "#854f0b",
      px: 1,
      py: 0.25,
      borderRadius: 1,
      letterSpacing: "0.04em",
    }}
  >
    RSK
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
  CREATED: "Risk logged",
  UPDATED: "Updated risk",
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
// Assessment section (spec 9.5)
// ─────────────────────────────────────────────────────────────────────────────

interface AssessmentSectionContentProps {
  mitigationPlan: string
  acceptanceNote: string
  onCommit: (field: AssessmentField, value: string) => void
}

const ASSESSMENT_FIELDS: { key: AssessmentField; label: string; placeholder: string }[] = [
  { key: "mitigationPlan", label: "Mitigation plan", placeholder: "Describe mitigation steps" },
  { key: "acceptanceNote", label: "Acceptance note", placeholder: "Explain why this risk is being accepted" },
]

const AssessmentSectionContent = React.memo(function AssessmentSectionContent({
  mitigationPlan,
  acceptanceNote,
  onCommit,
}: AssessmentSectionContentProps) {
  const valueByKey: Record<AssessmentField, string> = React.useMemo(
    () => ({ mitigationPlan, acceptanceNote }),
    [mitigationPlan, acceptanceNote]
  )

  const commitByKey: Record<AssessmentField, (next: string) => void> = React.useMemo(
    () => ({
      mitigationPlan: (next) => onCommit("mitigationPlan", next),
      acceptanceNote: (next) => onCommit("acceptanceNote", next),
    }),
    [onCommit]
  )

  return (
    <Box>
      {ASSESSMENT_FIELDS.map((field, idx) => (
        <Box
          key={field.key}
          sx={{ mb: idx === ASSESSMENT_FIELDS.length - 1 ? 0 : 1.5 }}
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
        <ActivityCommentBox saving={savingNote} onPost={onPostNote} />
      ) : null}

      {events.length === 0 ? (
        <Typography variant="caption" sx={{ color: "text.tertiary" }}>
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

export default function RiskDetailPage() {
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
  const [assessmentOpen, setAssessmentOpen] = React.useState(true)

  // ── Queries (preserved exactly) ────────────────────────────────────────────

  const { data: risk, isLoading } = useQuery({
    queryKey: ["risk-detail", id],
    queryFn: async () => (await api.get<Risk>(`/risks/${id}`)).data,
    enabled: !!id,
  })

  const { data: linkedTasks } = useQuery({
    queryKey: ["linked-tasks-risk", id],
    queryFn: async () =>
      (
        await api.get<LinkedTaskWithAssignee[]>("/tasks", {
          params: { linkedEntityType: "Risk", linkedEntityId: id },
        })
      ).data,
    enabled: !!id,
  })

  const { data: users = [] } = useAssignableUsers()

  const { data: auditEvents } = useQuery({
    queryKey: ["audit-risk", id],
    queryFn: async () =>
      (await api.get<AuditEvent[]>(`/audit-events/entity/Risk/${id}`)).data,
    enabled: !!id,
  })

  const { data: workNotes } = useQuery({
    queryKey: ["work-notes-risk", id],
    queryFn: async () =>
      (await api.get<RiskComment[]>(`/comments/Risk/${id}/work-notes`)).data,
    enabled: !!id,
  })


  // ── Mutations (preserved exactly) ──────────────────────────────────────────

  const handlePutField = React.useCallback(
    async (patch: Record<string, string>) => {
      if (!risk) return
      setError("")
      try {
        await api.put(`/risks/${id}`, patch)
        qc.invalidateQueries({ queryKey: ["risk-detail", id] })
        qc.invalidateQueries({ queryKey: ["audit-risk", id] })
        qc.invalidateQueries({ queryKey: ["risks"] })
        // Confirm only the title/description edits — popover/assessment fields patch
        // through here too and stay silent.
        if ("title" in patch) notify.success("Title updated")
        else if ("description" in patch) notify.success("Description updated")
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, "Failed to save risk properties"))
      }
    },
    [id, risk, qc, notify]
  )

  const handleSaveAcceptanceNote = React.useCallback(
    async (next: string) => {
      if (!risk) return
      setError("")
      try {
        await api.post(`/risks/${id}/status`, {
          status: risk.status,
          acceptanceNote: next,
        })
        qc.invalidateQueries({ queryKey: ["risk-detail", id] })
        qc.invalidateQueries({ queryKey: ["audit-risk", id] })
      } catch (e: unknown) {
        setError(getApiErrorMessage(e, "Failed to save acceptance note"))
      }
    },
    [id, risk, qc]
  )

  const handleAddNote = React.useCallback(async (draft: CommentDraft) => {
    if (!draft.body.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "Risk",
        entityId: id,
        body: draft.body,
        bodyJson: draft.bodyJson,
        mentions: draft.mentions,
      })
      qc.invalidateQueries({ queryKey: ["work-notes-risk", id] })
      qc.invalidateQueries({ queryKey: ["audit-risk", id] })
      resetFilterAfterComment()
      notify.success("Note added")
    } finally {
      setSavingNote(false)
    }
  }, [id, qc, resetFilterAfterComment, notify])

  const statusMutation = useMutation({
    mutationFn: async ({
      to,
      acceptanceNote,
    }: {
      to: string
      acceptanceNote?: string
    }) => api.post(`/risks/${id}/status`, { status: to, acceptanceNote }),
    onSuccess: () => {
      setError("")
      qc.invalidateQueries({ queryKey: ["risk-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-risk", id] })
      qc.invalidateQueries({ queryKey: ["work-notes-risk", id] })
      qc.invalidateQueries({ queryKey: ["risks"] })
    },
    onError: (e: unknown) => {
      setError(getApiErrorMessage(e, "Failed to update status"))
    },
  })

  const handleStatusChange = React.useCallback(
    (to: string) => {
      if (!risk) return
      const transition = riskTransitions.find(
        (t) => t.from === risk.status && t.to === to
      )
      if (transition?.requiresDialog) {
        setTransitionTarget(transition)
      } else {
        statusMutation.mutate({ to })
      }
    },
    [risk, statusMutation]
  )

  const handleTransitionConfirm = React.useCallback(
    (data: Record<string, string>) => {
      if (!transitionTarget) return
      const acceptanceNote =
        transitionTarget.to === "ACCEPTED"
          ? data.rationale ?? data.plan ?? undefined
          : undefined
      statusMutation.mutate({
        to: transitionTarget.to,
        acceptanceNote,
      })
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
      qc.invalidateQueries({ queryKey: ["linked-tasks-risk", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskStatus = React.useCallback(
    async (taskId: string, status: string) => {
      await api.post(`/tasks/${taskId}/status`, { status })
      qc.invalidateQueries({ queryKey: ["linked-tasks-risk", id] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    },
    [id, qc]
  )

  const updateLinkedTaskAssignee = React.useCallback(
    async (taskId: string, assigneeId: string) => {
      await api.put(`/tasks/${taskId}`, { assigneeId: assigneeId || null })
      qc.invalidateQueries({ queryKey: ["linked-tasks-risk", id] })
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
    () => qc.invalidateQueries({ queryKey: ["linked-tasks-risk", id] }),
    [id, qc]
  )

  const handleOpenFullTask = React.useCallback(
    (taskId: string) => {
      if (!risk) return
      navigate(`/tasks/${taskId}`, {
        state: { fromRisk: risk.id, fromRiskRef: risk.reference },
      })
    },
    [risk, navigate]
  )


  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const handleAddLink = React.useCallback(() => setLinkDialogOpen(true), [])
  // Lets the Attachments section-header "+" open the (encapsulated) file picker.
  const attachRef = React.useRef<AttachmentsHandle>(null)
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => deleteRecordLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risk-detail", id] }),
  })
  const handleUnlink = React.useCallback(
    (linkId: string) => unlinkMutation.mutate(linkId),
    [unlinkMutation]
  )

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Derived ────────────────────────────────────────────────────────────────

  const links = risk?.links ?? []

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

  const handleCommitAssessment = React.useCallback(
    (field: AssessmentField, next: string) => {
      if (field === "mitigationPlan") {
        handlePutField({ mitigationPlan: next })
      } else {
        handleSaveAcceptanceNote(next)
      }
    },
    [handlePutField, handleSaveAcceptanceNote]
  )

  // ── Field-popover handlers ─────────────────────────────────────────────────

  const handleSelectLikelihood = React.useCallback(
    (v: string) => handlePutField({ likelihood: v }),
    [handlePutField]
  )
  const handleSelectImpact = React.useCallback(
    (v: string) => handlePutField({ impact: v }),
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

  const handleCloseRisk = React.useCallback(() => {
    if (!risk) return
    handleStatusChange("CLOSED")
  }, [risk, handleStatusChange])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Copy link",
        icon: <ContentCopyIcon sx={{ fontSize: 14 }} />,
        onClick: handleCopyLink,
      },
      {
        label: "Close risk",
        icon: <CloseIcon sx={{ fontSize: 14 }} />,
        onClick: handleCloseRisk,
      },
    ],
    [handleCopyLink, handleCloseRisk]
  )

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!risk) return []
    const likelihoodColours = LEVEL_COLOURS[risk.likelihood] ?? LEVEL_COLOURS.MEDIUM
    const impactColours = LEVEL_COLOURS[risk.impact] ?? LEVEL_COLOURS.MEDIUM
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
              Risk
            </Typography>
          </Box>
        ),
      },
      {
        key: "likelihood",
        label: "Likelihood",
        editable: true,
        currentValue: risk.likelihood,
        popoverOptions: LIKELIHOOD_OPTIONS,
        onSelect: handleSelectLikelihood,
        value: (
          <Box sx={valueWrapperSx}>
            <Chip
              size="small"
              label={risk.likelihood}
              sx={{
                bgcolor: likelihoodColours.bg,
                color: likelihoodColours.text,
                fontWeight: 600,
                fontSize: 11,
                height: 20,
              }}
            />
          </Box>
        ),
      },
      {
        key: "impact",
        label: "Impact",
        editable: true,
        currentValue: risk.impact,
        popoverOptions: IMPACT_OPTIONS,
        onSelect: handleSelectImpact,
        value: (
          <Box sx={valueWrapperSx}>
            <Chip
              size="small"
              label={risk.impact}
              sx={{
                bgcolor: impactColours.bg,
                color: impactColours.text,
                fontWeight: 600,
                fontSize: 11,
                height: 20,
              }}
            />
          </Box>
        ),
      },
    ]
  }, [risk, handleSelectLikelihood, handleSelectImpact])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!risk) return []
    return [
      {
        id: "assessment",
        title: "",
        flush: true,
        content: (
          <Box sx={{ mb: 0 }}>
            <Divider sx={{ my: 2.5 }} />
            <Box
              onClick={() => setAssessmentOpen((o) => !o)}
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
                  transform: assessmentOpen ? "none" : "rotate(-90deg)",
                  transition: "transform .15s",
                }}
              />
              <Typography variant="caption" fontWeight={500} color="text.secondary">
                Assessment
              </Typography>
            </Box>
            {assessmentOpen && (
              <AssessmentSectionContent
                mitigationPlan={risk.mitigationPlan ?? ""}
                acceptanceNote={risk.acceptanceNote ?? ""}
                onCommit={handleCommitAssessment}
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
              savingNote={savingNote}
              onPostNote={handleAddNote}
            />
          </SectionPanel>
        ),
      },
    ]
  }, [
    risk,
    handleCommitAssessment,
    visibleFeedEvents,
    activeFilter,
    handleFilterChange,
    savingNote,
    handleAddNote,
    assessmentOpen,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!risk) return undefined
    return {
      submittedBy: null,
      createdAt: risk.createdAt,
      updatedAt: risk.updatedAt,
    }
  }, [risk])

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
            attachments={risk?.attachments ?? []}
            recordType="risk"
            recordId={risk?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["risk-detail", id] })}
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
    risk,
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
  if (!risk) return <ErrorState title="Risk not found" />

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
        recordRef={risk.reference}
        typeBadge={RISK_TYPE_BADGE}
        currentStatus={risk.status}
        statusConfig={RISK_STATUS_CONFIG}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <EditableTitleCard
            title={risk.title}
            description={risk.description}
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
        linkedEntityType="Risk"
        linkedEntityId={risk.id}
        linkedEntityLabel={risk.reference}
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
        sourceType="risk"
        sourceId={risk.id}
        onLinked={() => qc.invalidateQueries({ queryKey: ["risk-detail", id] })}
      />
    </>
  )
}
