import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert,
  Box,
  Button,
  Divider,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import PersonIcon from "@mui/icons-material/Person"
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked"
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import LockIcon from "@mui/icons-material/Lock"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined"
import { downloadRecordReport } from "../lib/recordReport"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
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
import { statusColors, priorityToken, accentToken, PriorityPill, TypeBadge, AssigneeCell, type LinkedTask, type AccentKey, type ThemeMode } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useActivityFilter } from "../lib/useActivityFilter"
import { CreateTaskModal } from "./modals/CreateTaskModal"
import { TaskQuickDetailModal } from "./modals/TaskQuickDetailModal"
import {
  SlimExpandCommentBox,
  ActivityFeedItem,
  type ResolvedMention,
  type CommentDraft,
  type FeedEvent,
  ActivityTabs,
  EditableTitleCard,
  EditableField as InlineEditable,
  RecordDetailShell,
  SectionPanel,
  StatusPopover,
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
import { transitions as changeTransitions } from "../config/transitions/changeTransitions"
import { useAssignableUsers, type AssignableUser } from "../lib/useAssignableUsers"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { TasksSectionContent } from "../components/TasksSectionContent"
import { useDrillNav } from "../lib/drillNav"
import { AttachmentsContent, type AttachmentsHandle } from "../components/AttachmentsContent"
import type { AttachmentSummary } from "../lib/attachments"
import { LinkRecordDialog } from "../components/LinkRecordDialog"
import { deleteRecordLink, type ResolvedLink } from "../lib/linkedRecords"
import { userLabel } from "../lib/userDisplay"
import { type AuditEvent } from "../lib/auditEvents"
import { AuditHistoryList } from "../components/AuditHistoryList"

// ─────────────────────────────────────────────────────────────────────────────
// Types — preserve existing API shape
// ─────────────────────────────────────────────────────────────────────────────

type ChangeApproval = {
  id: string
  decision: string
  notes: string | null
  decidedAt: string
  approver: { id: string; displayName: string }
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
  assignee: { id: string; displayName: string } | null
  createdById?: string | null
  createdBy?: { id: string; displayName: string } | null
  links?: ResolvedLink[]
  attachments?: AttachmentSummary[]
  approvals: ChangeApproval[]
  createdAt: string
  updatedAt: string
}

type ChangeComment = {
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
  replies?: ChangeComment[]
}



type LinkedTaskWithAssignee = LinkedTask & {
  assigneeId?: string | null
  assignee?: { id: string; displayName: string } | null
}

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

// Built per-render with the active mode (statusColors light branch is unchanged).
function buildChangeStatusConfig(mode: ThemeMode): StatusConfig {
  return {
    options: CHANGE_STATUS_ORDER.map<StatusOption>((value) => ({
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

// priorityToken reproduces the prior PRIORITY_COLOURS values exactly in light + adds dark.
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
// Approval colours — the soft accent palette (mode-aware); light values unchanged.
// APPROVED→green, REJECTED→red, DEFERRED→amber, anything else→neutral (the prior default).
// ─────────────────────────────────────────────────────────────────────────────

const APPROVAL_ACCENT: Record<string, AccentKey> = {
  APPROVED: "green",
  REJECTED: "red",
  DEFERRED: "amber",
}

function approvalColours(decision: string, mode: ThemeMode): { bg: string; text: string } {
  return accentToken(APPROVAL_ACCENT[decision] ?? "neutral", mode)
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


function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message)) return message.join(", ")
  }
  return fallback
}


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
            commit="blur"
            ariaLabel={field.label}
            onSave={commitByKey[field.key]}
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
  const { mode } = useThemeMode()
  if (approvals.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: "text.tertiary" }}>
        No approvals recorded
      </Typography>
    )
  }
  return (
    <Box>
      {approvals.map((approval) => {
        const colours = approvalColours(approval.decision, mode)
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
                  {userLabel(approval.approver)}
                </Typography>
                <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>
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
        <Typography variant="caption" sx={{ color: "text.tertiary" }}>
          No activity to show
        </Typography>
      ) : isHistory ? (
        <AuditHistoryList events={auditEvents.slice(0, visibleCount)} recordNoun="change" />
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

export default function ChangeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { mode } = useThemeMode()
  const changeStatusConfig = React.useMemo(() => buildChangeStatusConfig(mode), [mode])
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
  const [implementationOpen, setImplementationOpen] = React.useState(true)
  const [approvalsOpen, setApprovalsOpen] = React.useState(true)

  // ── Queries (preserved exactly) ────────────────────────────────────────────

  const { data: change, isLoading } = useQuery({
    queryKey: ["change-detail", id],
    queryFn: async () => (await api.get<ChangeRequest>(`/changes/${id}`)).data,
    enabled: !!id,
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
        // Confirm only the title/description edits — implementation/popover fields
        // flow through here too and stay silent.
        if (field === "title") notify.success("Title updated")
        else if (field === "description") notify.success("Description updated")
      } catch (e: unknown) {
        // Subject/description surface as a toast and rethrow, so EditableField
        // keeps the field editable with the draft. Popover fields stay silent.
        if (field === "title" || field === "description") {
          notify.error("Couldn't save — please try again")
          throw e
        }
        setError(getApiErrorMessage(e, "Failed to save change properties"))
      }
    },
    [id, change, qc, notify]
  )

  // Commit path for the pending-confirm Details popover fields (priority/assignee).
  // Unlike handleFieldChange it does NOT swallow errors or toast — the shell awaits
  // this on ✓ and owns the success/error toast + pending state.
  const commitDetailField = React.useCallback(
    async (field: EditableField, value: string) => {
      await api.put(`/changes/${id}`, { [field]: value })
      await qc.invalidateQueries({ queryKey: ["change-detail", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
      qc.invalidateQueries({ queryKey: ["tickets"] })
    },
    [id, qc]
  )

  const handleAddNote = React.useCallback(async (draft: CommentDraft) => {
    if (!draft.body.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", {
        entityType: "ChangeRequest",
        entityId: id,
        body: draft.body,
        bodyJson: draft.bodyJson,
        mentions: draft.mentions,
      })
      qc.invalidateQueries({ queryKey: ["work-notes-change", id] })
      qc.invalidateQueries({ queryKey: ["audit-change", id] })
      resetFilterAfterComment()
      notify.success("Note added")
    } finally {
      setSavingNote(false)
    }
  }, [id, qc, resetFilterAfterComment, notify])

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
      navigate(`/service-desk/task/${taskId}`, {
        state: { fromChange: change.id, fromChangeRef: change.reference },
      })
    },
    [change, navigate]
  )


  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const handleAddLink = React.useCallback(() => setLinkDialogOpen(true), [])
  // Lets the Attachments section-header "+" open the (encapsulated) file picker.
  const attachRef = React.useRef<AttachmentsHandle>(null)
  const unlinkMutation = useMutation({
    mutationFn: (linkId: string) => deleteRecordLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["change-detail", id] }),
  })
  const handleUnlink = React.useCallback(
    (linkId: string) => unlinkMutation.mutate(linkId),
    [unlinkMutation]
  )

  const handleBack = React.useCallback(() => navigate(-1), [navigate])

  // ── Derived ────────────────────────────────────────────────────────────────

  const links = change?.links ?? []

  // Comments tab feed — work-notes only. History renders the audit stream
  // directly via AuditHistoryList.
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

  const handleCommitImplementation = React.useCallback(
    (field: ImplementationField, next: string) => handleFieldChange(field, next),
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

  const handleCancelChange = React.useCallback(() => {
    if (!change) return
    handleStatusChange("CANCELLED")
  }, [change, handleStatusChange])

  const moreMenuItems = React.useMemo<MoreMenuItem[]>(
    () => [
      {
        label: "Export as PDF",
        icon: <PictureAsPdfOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: () => {
          if (!change) return
          void downloadRecordReport("change", change.id, change.reference).catch(() =>
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
        label: "Cancel change",
        icon: <CancelOutlinedIcon sx={{ fontSize: 14 }} />,
        onClick: handleCancelChange,
        danger: true,
      },
    ],
    [change, notify, handleCopyLink, handleCancelChange]
  )

  const handleLinkSnackbarClose = React.useCallback(() => setLinkCopied(false), [])

  // ── Detail fields ──────────────────────────────────────────────────────────

  const detailFields = React.useMemo<DetailField[]>(() => {
    if (!change) return []
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
            <TypeBadge kind="CHG" label="Change" />
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
        popoverOptions: priorityOptions,
        onSelect: handleSelectPriority,
        value: (
          <Box sx={valueWrapperSx}>
            <PriorityPill
              priority={change.priority}
              label={change.priority.charAt(0).toUpperCase() + change.priority.slice(1)}
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
            <AssigneeCell user={change.assignee} mode={mode} />
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
        // A change's due date IS its scheduled end — relabelled "Due date" (rather
        // than adding a duplicate row) so Details carries the Due date row like Task.
        key: "scheduledEnd",
        label: "Due date",
        editable: false,
        value: (
          <Box sx={valueWrapperSx}>
            <Typography variant="body2" color="text.secondary">
              {change.scheduledEnd ? formatScheduledDate(change.scheduledEnd) : "N/A"}
            </Typography>
          </Box>
        ),
      },
    ]
  }, [change, mode, usersOptions, priorityOptions, handleSelectPriority, handleSelectAssignee])

  // ── Centre sections ────────────────────────────────────────────────────────

  const sections = React.useMemo<CentreSection[]>(() => {
    if (!change) return []
    return [
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
              <Typography variant="caption" sx={{ color: "text.tertiary" }}>
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
    change,
    handleCommitImplementation,
    visibleFeedEvents,
    auditEvents,
    activeFilter,
    handleFilterChange,
    savingNote,
    handleAddNote,
    implementationOpen,
    approvalsOpen,
  ])

  // ── Right sections ─────────────────────────────────────────────────────────

  const metadata = React.useMemo<RecordMetadata | undefined>(() => {
    if (!change) return undefined
    return {
      submittedBy: <AssigneeCell user={change.createdBy ?? null} emptyLabel="—" mode={mode} />,
      createdAt: change.createdAt,
      updatedAt: change.updatedAt,
    }
  }, [change, mode])

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
            mode={mode}
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
            attachments={change?.attachments ?? []}
            recordType="change"
            recordId={change?.id ?? ""}
            onChanged={() => qc.invalidateQueries({ queryKey: ["change-detail", id] })}
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
    change,
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
        typeBadge={null}
        currentStatus={change.status}
        statusConfig={changeStatusConfig}
        onStatusChange={handleStatusChange}
        moreMenuItems={moreMenuItems}
        titleCard={
          <EditableTitleCard
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
        navigateAfterCreate={false}
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

      <LinkRecordDialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        sourceType="change"
        sourceId={change.id}
        onLinked={() => qc.invalidateQueries({ queryKey: ["change-detail", id] })}
      />
    </>
  )
}
