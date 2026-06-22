import React from "react"
import { useParams, useNavigate, useLocation, Routes, Route } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Drawer, IconButton, Menu, MenuItem, Stack,
  Tab, Tabs, TextField, Tooltip, Typography
} from "@mui/material"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import AddIcon from "@mui/icons-material/Add"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import CameraAltIcon from "@mui/icons-material/CameraAlt"
import AttachFileIcon from "@mui/icons-material/AttachFile"
import ImageIcon from "@mui/icons-material/Image"
import DescriptionIcon from "@mui/icons-material/Description"
import CloudOffIcon from "@mui/icons-material/CloudOff"
import ScheduleIcon from "@mui/icons-material/Schedule"
import DownloadIcon from "@mui/icons-material/Download"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import NotesIcon from "@mui/icons-material/Notes"
import OutlinedFlagIcon from "@mui/icons-material/OutlinedFlag"
import AddTaskIcon from "@mui/icons-material/AddTask"
import MoreVertIcon from "@mui/icons-material/MoreVert"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import BoltIcon from "@mui/icons-material/Bolt"
import AcUnitIcon from "@mui/icons-material/AcUnit"
import HubIcon from "@mui/icons-material/Hub"
import LockIcon from "@mui/icons-material/Lock"
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment"
import ThermostatIcon from "@mui/icons-material/Thermostat"
import RuleFolderIcon from "@mui/icons-material/RuleFolder"
import HistoryIcon from "@mui/icons-material/History"
import CloseIcon from "@mui/icons-material/Close"
import type { SvgIconComponent } from "@mui/icons-material"
import { PhotoCaptureDialog } from "../components/checks/PhotoCaptureDialog"
import { PhotoDetailDialog, type PhotoDetailTarget } from "../components/checks/PhotoDetailDialog"
import { FlagNoteDialog } from "../components/checks/FlagNoteDialog"
import {
  Avatar, PropertiesPanel, StatusPill, ragTokens, radii, TAG_RADIUS, WorkflowStrip, type SemanticIntent
} from "../components/shared"
import { RightPanelSection, DetailNarrowProvider, DetailDrawerChromeProvider } from "../components/detail"
import { DrillNavContext, type DrillFn } from "../lib/drillNav"
import TaskDetailPage from "./TaskDetailPage"
import RiskDetailPage from "./RiskDetailPage"
import IssueDetailPage from "./IssueDetailPage"
import { LinkedRecordsContent } from "../components/LinkedRecordsContent"
import { AttachmentsContent } from "../components/AttachmentsContent"
import { EntityHistoryDialog } from "../components/EntityHistoryDialog"
import { AttachmentPreviewModal } from "../components/AttachmentPreviewModal"
import { useNotification } from "../components/NotificationProvider"
import { type AttachmentSummary, deleteAttachment, isImageType } from "../lib/attachments"
import { downloadCheckReport } from "../lib/checkReport"
import { type ResolvedLink, type LinkRecordType, typeLabel, routeForSegment } from "../lib/linkedRecords"
import { userLabel } from "../lib/userDisplay"
import { ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { checkSync } from "../lib/offline/checkQueue"
import { useCheckExecutionSync, type CheckSyncStatus } from "../lib/offline/useCheckExecutionSync"
import { useOnlineStatus } from "../lib/useOnlineStatus"

// ── Types ──────────────────────────────────────────────────────────────────
type CheckItem = {
  id: string
  label: string
  section: string | null
  guidance: string | null
  responseType: string
  isRequired: boolean
  isCritical: boolean
  isAdHoc: boolean
  response: string | null
  notes: string | null
  sortOrder: number
  reworkFlagged?: boolean | null
  reworkNote?: string | null
  followOns: {
    id: string; entityType: string; entityId: string; note: string | null
    linked?: { reference: string; title: string; status: string } | null
  }[]
  attachments?: AttachmentSummary[]
}

type Check = {
  id: string; reference: string; title: string; checkType: string
  status: string; priority: string; passRate: number | null
  scheduledAt: string | null; startedAt: string | null
  submittedAt: string | null; completedAt: string | null
  scopeNotes: string | null; engineerSummary: string | null
  reviewerNotes: string | null; cancellationReason: string | null
  createdAt: string; updatedAt: string
  site: { id: string; name: string }
  assignee: { id: string; displayName: string } | null
  reviewer: { id: string; displayName: string } | null
  template: { id: string; name: string; checkType: string; estimatedMinutes: number | null }
  items: CheckItem[]
  attachments?: AttachmentSummary[]
}

// A photo added to the evidence composer but NOT yet Saved — held locally (a File + a local
// object URL for the thumbnail) until the composer's Save flushes it through the P4a queue.
// Discard drops it (and revokes the URL).
type StagedPhoto = { key: string; file: File; url: string; caption: string }
// The unsaved evidence draft for one item: a note + any staged photos. Local until Save.
type EvidenceDraft = { note: string; photos: StagedPhoto[] }

// A follow-on chip label: prefer the server-resolved "{REF · title}" of the linked
// Task/Risk/Issue (so the reviewer/engineer recognises what was raised — "Task created · …");
// fall back to the bare entity type before the link resolves (or if it can't).
function followOnLabel(fo: { entityType: string; linked?: { reference: string; title: string; status: string } | null }): string {
  return fo.linked ? `${fo.linked.reference} · ${fo.linked.title}` : fo.entityType
}

// A follow-on (Task/Risk/Issue raised from a failed item) presented as a linked record, so it
// renders through the shared LinkedRecordsContent card (type icon + title + ref + status pill,
// clickable to the record) — consistent with linked records elsewhere, not an ad-hoc chip.
// linkId is empty: a follow-on is NOT a RecordLink and can't be unlinked here, and an empty
// linkId suppresses LinkedRecordsContent's inline unlink affordance (its "hard-relation rows:
// shown but not unlinkable" path). entityType is capitalised on the wire ("Task"); lower-case it
// to the LinkRecordType the per-type visuals + route table key on. entityId is the real record id.
function followOnAsLink(fo: CheckItem["followOns"][number]): ResolvedLink {
  const type = fo.entityType.toLowerCase() as LinkRecordType
  return {
    linkId: "",
    type,
    id: fo.entityId,
    reference: fo.linked?.reference ?? "",
    title: fo.linked?.title ?? fo.note ?? typeLabel(type),
    status: fo.linked?.status ?? "",
  }
}

// Calm absolute timestamp for the engineer-note attribution header (en-GB, the app convention).
function formatNoteTime(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_ALL = ["DRAFT", "SCHEDULED", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"]

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", SCHEDULED: "Scheduled", ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress", PENDING_REVIEW: "Pending review",
  COMPLETED: "Completed", CLOSED: "Closed", CANCELLED: "Cancelled"
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  DRAFT: "Created, not yet scheduled",
  SCHEDULED: "Date confirmed, awaiting assignment",
  ASSIGNED: "Engineer assigned and notified",
  IN_PROGRESS: "Engineer actively executing",
  PENDING_REVIEW: "Submitted, awaiting manager review",
  COMPLETED: "Reviewed and signed off"
}

// ── Helpers ────────────────────────────────────────────────────────────────
// Per-item check result -> canonical intent. EXPLICIT (not resolveIntent): an
// unanswered item is "muted" (a lighter slate than neutral), so "Pending" can never
// catch the warning keyword scan. Feeds the shared StatusPill — one colour source.
function resultIntent(response: string | null): SemanticIntent {
  if (response === "PASS") return "success"
  if (response === "FAIL") return "danger"
  if (response === "NA") return "neutral"
  return "muted"
}

function formatElapsed(startedAt: string | null): string {
  if (!startedAt) return ""
  const diff = Date.now() - new Date(startedAt).getTime()
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hrs > 0) return `${hrs}h ${mins}m elapsed`
  return `${mins}m elapsed`
}
function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
    if (Array.isArray(message)) return message.join(", ")
  }
  return fallback
}
type DetailRow = { label: string; value: string }

// Estimated duration -> compact label. Returns null when not derivable so callers can
// DROP the tile gracefully (the template's estimatedMinutes is optional).
function formatEst(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null
  if (min < 60) return `~${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `~${h}h ${m}m` : `~${h}h`
}

// Short scheduled-date label (en-GB, day + month) for the draft stat tile.
function formatScheduledShort(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

// Section name -> a representative icon. Sections are free-text strings (no icon/type in the
// schema), so this is a best-effort keyword match with a GENERIC fallback — never throws,
// always renders something. Purely decorative (the section summary degrades gracefully).
const SECTION_ICON_RULES: { test: RegExp; Icon: SvgIconComponent }[] = [
  { test: /power|ups|electric|pdu|battery/, Icon: BoltIcon },
  { test: /cool|hvac|aircon|air con|crac|chill/, Icon: AcUnitIcon },
  { test: /temp|environment|humidity|climate/, Icon: ThermostatIcon },
  { test: /network|lan|switch|cabl|connectiv|fibre|fiber/, Icon: HubIcon },
  { test: /security|access|door|lock|cctv|camera/, Icon: LockIcon },
  { test: /fire|suppress|smoke|alarm/, Icon: LocalFireDepartmentIcon },
]
function sectionIcon(name: string): SvgIconComponent {
  const n = name.toLowerCase()
  for (const { test, Icon } of SECTION_ICON_RULES) if (test.test(n)) return Icon
  return RuleFolderIcon
}

// Shared stat tile — the single context-number unit across the journey (draft, self-review).
// Secondary-bg surface, 0.5px border, radius-lg; 13px muted label over a 20px value. The
// value may take a semantic accent colour (e.g. green Pass / red Fail) while the chrome stays
// identical, so every tile reads as one design language.
function StatTile({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <Box sx={{ bgcolor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", p: "12px 14px" }}>
      <Typography sx={{ fontSize: 20, fontWeight: 700, color: accent ?? "#0f172a", lineHeight: 1.1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 13, color: "#64748b", mt: "4px", fontWeight: 500 }}>{label}</Typography>
    </Box>
  )
}

// ── Sync status pill (Phase 4a offline resilience) ─────────────────────────
// Honest, minimal indicator: the engineer must trust that work captured offline is
// saved on-device and will sync — the opposite of the old silent-loss trap.
function SyncStatusPill({ status, pendingCount }: { status: CheckSyncStatus; pendingCount: number }) {
  if (status === "synced") {
    return (
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#15803d", boxShadow: "0 0 0 3px rgba(21,128,61,0.15)" }} />
        <Typography sx={{ fontSize: 11.5, color: "#15803d" }}>All changes saved</Typography>
      </Stack>
    )
  }
  if (status === "syncing") {
    return (
      <Typography sx={{ fontSize: 11.5, color: "var(--color-text-secondary)" }}>
        Syncing{pendingCount > 0 ? ` ${pendingCount}` : ""}…
      </Typography>
    )
  }
  if (status === "offline") {
    return (
      <Tooltip title="Saved on this device — will sync automatically when you're back online">
        <Stack direction="row" alignItems="center" spacing={0.6}>
          <CloudOffIcon sx={{ fontSize: 14, color: "#b45309" }} />
          <Typography sx={{ fontSize: 11.5, color: "#b45309", fontWeight: 500 }}>
            Offline — {pendingCount} saved on this device
          </Typography>
        </Stack>
      </Tooltip>
    )
  }
  // pending: online but not yet confirmed (server error / mid-retry)
  return (
    <Stack direction="row" alignItems="center" spacing={0.6}>
      <ScheduleIcon sx={{ fontSize: 13, color: "#b45309" }} />
      <Typography sx={{ fontSize: 11.5, color: "#b45309" }}>{pendingCount} not yet synced…</Typography>
    </Stack>
  )
}

// ── Follow-on modal ────────────────────────────────────────────────────────
function FollowOnModal({ open, onClose, checkId, item, onSuccess }: {
  open: boolean; onClose: () => void; checkId: string; item: CheckItem; onSuccess: () => void
}) {
  const [type, setType] = React.useState<"Task" | "Risk" | "Issue">("Task")
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")
  const [severity, setSeverity] = React.useState("AMBER")
  const [likelihood, setLikelihood] = React.useState("MEDIUM")
  const [impact, setImpact] = React.useState("MEDIUM")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (open) { setTitle(item.label); setDescription(""); setType("Task"); setError("") }
  }, [open, item.label])

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true); setError("")
    try {
      await api.post(`/checks/${checkId}/items/${item.id}/follow-ons`, {
        entityType: type, title,
        description: description || undefined,
        priority: type === "Task" ? priority : undefined,
        severity: type === "Issue" ? severity : undefined,
        likelihood: type === "Risk" ? likelihood : undefined,
        impact: type === "Risk" ? impact : undefined
      })
      onClose(); onSuccess()
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to create")) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create follow-on action</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {/* Source-item banner — red "Failed: …" for the engineer's failed-item flow; neutral
              for any other response (a reviewer can raise a follow-on from a pass/N-A too). */}
          {item.response === "FAIL" ? (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fff5f5", border: "1px solid #fecaca" }}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <WarningAmberIcon sx={{ fontSize: 14, color: "#b91c1c" }} />
                <Typography variant="caption" color="#b91c1c" fontWeight={600}>Failed: {item.label}</Typography>
              </Stack>
            </Box>
          ) : (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <Typography variant="caption" sx={{ color: "#475569", fontWeight: 600 }}>From: {item.label}</Typography>
            </Box>
          )}
          <Stack direction="row" spacing={1}>
            {(["Task", "Risk", "Issue"] as const).map(t => (
              <Button key={t} size="small" variant={type === t ? "contained" : "outlined"}
                onClick={() => setType(t)} sx={{ flex: 1 }}>{t}</Button>
            ))}
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} required fullWidth />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} multiline rows={2} fullWidth />
          {type === "Task" ? (
            <TextField select label="Priority" value={priority} onChange={e => setPriority(e.target.value)} fullWidth>
              <MenuItem value="low">Low</MenuItem><MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem><MenuItem value="critical">Critical</MenuItem>
            </TextField>
          ) : null}
          {type === "Risk" ? (
            <Stack direction="row" spacing={1.5}>
              <TextField select label="Likelihood" value={likelihood} onChange={e => setLikelihood(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem><MenuItem value="MEDIUM">Medium</MenuItem><MenuItem value="HIGH">High</MenuItem>
              </TextField>
              <TextField select label="Impact" value={impact} onChange={e => setImpact(e.target.value)} fullWidth>
                <MenuItem value="LOW">Low</MenuItem><MenuItem value="MEDIUM">Medium</MenuItem><MenuItem value="HIGH">High</MenuItem>
              </TextField>
            </Stack>
          ) : null}
          {type === "Issue" ? (
            <TextField select label="Severity" value={severity} onChange={e => setSeverity(e.target.value)} fullWidth>
              <MenuItem value="GREEN">Green — low</MenuItem>
              <MenuItem value="AMBER">Amber — medium</MenuItem>
              <MenuItem value="RED">Red — high</MenuItem>
            </TextField>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim()}>
          {saving ? "Creating..." : `Create ${type.toLowerCase()}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function CheckDetailPage() {
  const { id, "*": drawerSplat = "" } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { setRecordLabel, setPageFullBleed } = useBreadcrumb()

  // Origin-aware back: a check opened from the history archive carries from:"history" in
  // router state, so Back returns to that archive view (navigate(-1) -> the history page at
  // its preserved URL params + browser scroll). Any other origin (active landing, direct
  // link) returns to the active checks landing.
  const cameFromHistory = (location.state as { from?: string } | null)?.from === "history"
  const goBack = () => (cameFromHistory ? navigate(-1) : navigate("/checks"))

  // Local record-peek drawer. A follow-on (Task/Risk/Issue) raised from a failed item opens in a
  // right-hand panel instead of navigating away — reusing the SAME contract as the Service Desk
  // navigator's depth-2 drawer (DrillNavContext + the unchanged detail pages + DetailNarrow/
  // DrawerChrome), the only other place a record peeks in. The route is checks/:id/* (App.tsx) so
  // a peek changes only the splat — this page stays mounted (no refetch / no lost draft). The
  // splat is [seg, recId] when a record is open; closing drops it back to /checks/:id.
  const [drawerSeg, drawerRecId] = drawerSplat.split("/").filter(Boolean)
  const drawerOpen = !!drawerSeg && !!drawerRecId
  const drillPush = React.useCallback<DrillFn>(
    (navType, recId) => navigate(`/checks/${id}/${navType}/${recId}`), [navigate, id])
  const closeDrawer = React.useCallback(() => navigate(`/checks/${id}`), [navigate, id])
  const [drawerHeaderSlot, setDrawerHeaderSlot] = React.useState<HTMLElement | null>(null)
  const onOpenFull = React.useCallback(
    () => navigate(routeForSegment(drawerSeg, drawerRecId)), [navigate, drawerSeg, drawerRecId])
  // No onRemoveLink: follow-ons aren't RecordLinks (linkId is ""), so the shell hides "Remove link".
  const drawerChrome = React.useMemo(
    () => ({ headerSlot: drawerHeaderSlot, onOpenFull }), [drawerHeaderSlot, onOpenFull])

  const canExecute = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])
  // Manager-tier can reschedule/reassign a pre-start check (matches the PATCH /checks/:id roles).
  const canManage = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])
  // Reviewer actions (approve / return / flag / create-task on the review surface) share the
  // same role set as the backend approve/return endpoints (no ENGINEER) — gate the review-only
  // buttons on this so an engineer viewing a PENDING_REVIEW check never sees a control that 403s.
  const canReview = canManage
  // Assignee picker source — operational-callable & client-scoped (never raw /users).
  const { data: assignableUsers } = useAssignableUsers()

  // Phase 4a: durable offline resilience for in-progress execution. The sync manager
  // persists answers/notes/photos to IndexedDB and replays them when online; the page
  // keeps its existing optimistic `drafts` layer on top (seeded from IDB on mount).
  const sync = useCheckExecutionSync(id)
  const online = useOnlineStatus()

  const [error, setError] = React.useState("")
  const [transitioning, setTransitioning] = React.useState(false)
  const [reportDownloading, setReportDownloading] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState(0) // for standard layout

  // Optimistic answers (response + notes), saved IMMEDIATELY on tap/blur through the offline
  // queue (the proven P4a path). Seeded from IDB on mount so un-synced work survives reload.
  const [drafts, setDrafts] = React.useState<Record<string, { response: string; notes: string }>>({})
  // Per-item field-evidence photos persist to object storage as `check-item` attachments;
  // offline captures queue locally (see useCheckExecutionSync) and show as pending thumbnails
  // until they upload. Thumbnails are VIEW-ONLY — tapping one opens it in the PhotoDetailDialog
  // (closer look + caption edit + deliberate, confirmed delete), so a stray tap can't destroy
  // evidence the way the old inline × could.
  const [photoDetail, setPhotoDetail] = React.useState<PhotoDetailTarget | null>(null)
  // When a photo is opened for a quick LOOK (from a closed/answered row, not the composer) we
  // suppress caption-edit/delete — editing stays behind "Edit evidence". The composer opens the
  // same dialog with this false (the default), so its edit affordances are unchanged.
  const [photoDetailViewOnly, setPhotoDetailViewOnly] = React.useState(false)
  const openPhotoView = (target: PhotoDetailTarget) => { setPhotoDetailViewOnly(true); setPhotoDetail(target) }
  // Read-only per-item photo viewer for the STANDARD (PENDING_REVIEW / COMPLETED) layout — that
  // surface stays view-only (no edit/delete), so it keeps the simpler AttachmentPreviewModal.
  const [previewAtt, setPreviewAtt] = React.useState<AttachmentSummary | null>(null)
  // Photo capture confirm beat (Stage 3): a selected/captured image is previewed here with an
  // optional caption BEFORE it joins the evidence draft. `files` holds the current batch
  // (current at [0]); `url` is a local object URL owned here (created on select, revoked on
  // attach/discard). "Add to evidence" STAGES it into the open composer (see evidenceDrafts) —
  // the composer's Save is the single P4a enqueue point.
  const [photoPreview, setPhotoPreview] = React.useState<{ itemId: string; files: File[]; url: string; caption: string } | null>(null)

  // ── Evidence composer (Save/Discard draft) ──────────────────────────────────
  // The ANSWER (Pass/Fail/N-A) is an immediate toggle — committed on tap via saveItemAnswer,
  // re-tap changes it, never lost. EVIDENCE (note + photos + captions) is a separate
  // Save/Discard composer: a local draft per item, durable only once Saved — Save flushes
  // through the P4a queue (saveItemAnswer for the note, queuePhoto per staged photo); Discard
  // reverts. Only ONE composer is open at a time; opening another with an unsaved draft prompts
  // (leavePrompt) — the answer is already committed, so only the evidence draft is ever at risk.
  const [evidenceDrafts, setEvidenceDrafts] = React.useState<Record<string, EvidenceDraft>>({})
  const [openComposer, setOpenComposer] = React.useState<string | null>(null)
  const [leavePrompt, setLeavePrompt] = React.useState<{ fromItemId: string; next: () => void } | null>(null)
  const stagedSeq = React.useRef(0) // monotonic key source for staged (not-yet-Saved) photos

  const [reviewMode, setReviewMode] = React.useState(false)
  const [sectionMenuAnchor, setSectionMenuAnchor] = React.useState<HTMLElement | null>(null)
  const photoInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({})
  const itemRefs = React.useRef<Record<string, HTMLElement | null>>({})
  const [followOnItem, setFollowOnItem] = React.useState<CheckItem | null>(null)
  // Reviewer flag-for-rework: the item being flagged (drives the note dialog) + an in-flight guard.
  const [flagItem, setFlagItem] = React.useState<CheckItem | null>(null)
  const [flagSaving, setFlagSaving] = React.useState(false)
  // Per-row ⋮ menu (review surface compact passes) — Flag/Task stay reachable on every item.
  const [rowMenu, setRowMenu] = React.useState<{ anchor: HTMLElement; item: CheckItem } | null>(null)
  const [engineerSummary, setEngineerSummary] = React.useState("")
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [reviewAction, setReviewAction] = React.useState<"approve" | "return">("approve")
  const [reviewerNotes, setReviewerNotes] = React.useState("")
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancellationReason, setCancellationReason] = React.useState("")
  const [adHocOpen, setAdHocOpen] = React.useState(false)
  const [adHocLabel, setAdHocLabel] = React.useState("")
  const [adHocSection, setAdHocSection] = React.useState("")
  const [historyOpen, setHistoryOpen] = React.useState(false)

  // Section scroll refs
  const sectionRefs = React.useRef<Record<string, HTMLElement | null>>({})
  const itemsColumnRef = React.useRef<HTMLElement | null>(null)
  const isScrollingRef = React.useRef(false)
  const scrollTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // networkMode "always" so the queryFn runs even when offline (React Query would
  // otherwise pause it) — letting us fall back to the IDB-cached check doc if the live
  // GET fails. Online, the fresh response is cached as the last-good doc.
  const { data: check, isLoading } = useQuery({
    queryKey: ["check-detail", id],
    networkMode: "always",
    queryFn: async () => {
      try {
        const data = (await api.get<Check>(`/checks/${id}`)).data
        void checkSync.cacheDoc(id!, data)
        return data
      } catch (err) {
        const cached = await checkSync.loadCachedDoc(id!)
        if (cached) return cached as Check
        throw err
      }
    },
    enabled: !!id
  })

  React.useEffect(() => { if (check) setRecordLabel(check.reference) }, [check]) // eslint-disable-line

  // The execution layout is a full-bleed fixed-viewport pane (same scroll model as
  // the standard RecordDetailShell): claim full-bleed so the Shell <main> drops its
  // padding AND its page-level scroll, leaving the items column as the single
  // content scroll. WITHOUT this, the page sat inside the padded, overflow:auto
  // <main> and the old negative-margin bleed (md -24px vs <main>'s 20px padding)
  // pushed the box ~8px wider than <main> → a desktop horizontal scrollbar. The
  // standard (non-execution) layout stays padded, so full-bleed is released whenever
  // the check isn't executing and on unmount. (Mobile <main> ignores full-bleed —
  // it keeps its own padding + scroll, which is what the xs sticky-footer flow wants.)
  // Only IN_PROGRESS is the full-bleed editable execution pane. PENDING_REVIEW is now a
  // read-only review surface on the (padded) standard layout, so full-bleed is released.
  const isExecLayout = check?.status === "IN_PROGRESS"
  React.useEffect(() => {
    setPageFullBleed(isExecLayout)
    return () => setPageFullBleed(false)
  }, [isExecLayout, setPageFullBleed])

  // Restore-on-reopen: seed the optimistic drafts from any locally-persisted answers so
  // un-synced work (after a disconnect/refresh) is still on screen. Fills only items the
  // user isn't already editing this session; merge rule is local-wins-until-drained.
  const hydratedRef = React.useRef(false)
  React.useEffect(() => {
    if (!id || hydratedRef.current) return
    let alive = true
    checkSync.loadAnswers(id).then(answers => {
      if (!alive) return
      hydratedRef.current = true
      const entries = Object.entries(answers)
      if (entries.length === 0) return
      setDrafts(prev => {
        const next = { ...prev }
        for (const [itemId, a] of entries) {
          if (!next[itemId]) next[itemId] = { response: a.response, notes: a.notes }
        }
        return next
      })
    })
    return () => { alive = false }
  }, [id])

  // Once the queue drains to empty (writes confirmed on the server), refetch so synced
  // answers/photos reflect server truth. Fires on the >0 → 0 transition only.
  const prevPendingRef = React.useRef(0)
  React.useEffect(() => {
    if (prevPendingRef.current > 0 && sync.pendingCount === 0) {
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
    }
    prevPendingRef.current = sync.pendingCount
  }, [sync.pendingCount, id, qc])

  // Surface PERMANENTLY-dropped queued writes (4xx dead-letters) for THIS check. These fail
  // silently otherwise — worst of all for evidence (a rejected photo) — and the SyncStatusPill
  // would falsely read "All changes saved" once the count drains to 0. Transient failures
  // (offline / 5xx) stay queued and the pill already shows them, so they never reach here.
  React.useEffect(() => {
    if (!id) return
    return checkSync.onDeadLetter((m) => {
      if (m.checkId !== id) return
      if (m.kind === "photo") notify.error("Couldn't upload a photo — it may be too large or an unsupported format")
      else if (m.kind === "caption") notify.error("Couldn't save a photo caption")
      else notify.error("Couldn't save an answer — please check and re-enter it")
    })
  }, [id, notify])

  // The optimistic answer for an item — the immediate draft if present, else the server value.
  function getDraft(item: CheckItem) {
    return {
      response: drafts[item.id]?.response ?? item.response ?? "",
      notes: drafts[item.id]?.notes ?? item.notes ?? "",
    }
  }

  // ── Answer (immediate) + Evidence composer (Save/Discard draft) ──────────────
  // The ANSWER commits immediately on tap (saveItemAnswer); it's never part of Save/Discard.
  // EVIDENCE (note + staged photos) is a local draft per item, durable only on Save — which
  // flushes through the existing P4a helpers. Only ONE composer is open at a time.

  // Is this item's open draft different from what's committed (note edited or a photo staged)?
  // Drives the Save button + the leave-prompt.
  function draftIsDirty(item: CheckItem): boolean {
    const d = evidenceDrafts[item.id]
    if (!d) return false
    return d.note !== getDraft(item).notes || d.photos.length > 0
  }
  // Open the composer for an item, seeding a fresh draft (note = the committed note, no staged
  // photos) unless one's already in progress.
  function openComposerFor(item: CheckItem) {
    setEvidenceDrafts(prev => (prev[item.id] ? prev : { ...prev, [item.id]: { note: getDraft(item).notes, photos: [] } }))
    setOpenComposer(item.id)
  }
  // Gate opening a composer: if a DIFFERENT item's draft is open and dirty, prompt first
  // (Save/Discard/Stay) — only the evidence draft is at risk, the answer is already committed.
  // A clean open composer just closes silently.
  function requestOpenComposer(item: CheckItem) {
    if (openComposer && openComposer !== item.id) {
      const current = check?.items.find(i => i.id === openComposer)
      if (current && draftIsDirty(current)) {
        setLeavePrompt({ fromItemId: current.id, next: () => openComposerFor(item) })
        return
      }
      discardDraft(openComposer) // clean → drop the seeded (unchanged) draft and close it
    }
    openComposerFor(item)
  }
  // Drop a draft (revoke its staged photo URLs) and close its composer. Used by Discard and the
  // clean-close path. Note: revoking a staged URL is safe pre-queue — queuePhoto uses the File.
  function discardDraft(itemId: string) {
    const d = evidenceDrafts[itemId]
    if (d) d.photos.forEach(p => URL.revokeObjectURL(p.url))
    setEvidenceDrafts(prev => { const n = { ...prev }; delete n[itemId]; return n })
    setOpenComposer(curr => (curr === itemId ? null : curr))
  }
  function setComposerNote(itemId: string, note: string) {
    setEvidenceDrafts(prev => ({ ...prev, [itemId]: { note, photos: prev[itemId]?.photos ?? [] } }))
  }
  // Save = the single P4a enqueue point for evidence: the note via saveItemAnswer, each staged
  // photo via queuePhoto (caption rides). Commit the note to the optimistic layer so the
  // collapsed row shows it, then close (discardDraft clears the draft + revokes staged URLs;
  // the captured `d` still holds the Files, which queuePhoto persists).
  async function saveEvidence(item: CheckItem) {
    const d = evidenceDrafts[item.id]
    if (!d) { setOpenComposer(curr => (curr === item.id ? null : curr)); return }
    const response = getDraft(item).response
    setDrafts(prev => ({ ...prev, [item.id]: { response, notes: d.note } }))
    discardDraft(item.id)
    await sync.saveItemAnswer(item.id, { response: response || undefined, notes: d.note || undefined })
    for (const p of d.photos) {
      await sync.queuePhoto(item.id, p.file, p.caption.trim() || undefined)
    }
  }
  // Leave-prompt resolution (opening another item with an unsaved draft).
  async function resolveLeaveSave() {
    if (!leavePrompt) return
    const item = check?.items.find(i => i.id === leavePrompt.fromItemId)
    const next = leavePrompt.next
    setLeavePrompt(null)
    if (item) await saveEvidence(item)
    next()
  }
  function resolveLeaveDiscard() {
    if (!leavePrompt) return
    const { fromItemId, next } = leavePrompt
    discardDraft(fromItemId)
    setLeavePrompt(null)
    next()
  }

  // One tap = answered + saved (immediate, never lost). Fail also opens the evidence composer —
  // framed as expected — to push the engineer to document the failure (a nudge, not a hard
  // block). Pass/N-A leave the composer alone (no auto-open; the compact row offers it on demand).
  async function handleResponse(item: CheckItem, response: string) {
    const committedNotes = getDraft(item).notes
    setDrafts(prev => ({ ...prev, [item.id]: { response, notes: committedNotes } }))
    if (response === "FAIL") requestOpenComposer(item)
    await sync.saveItemAnswer(item.id, { response, notes: committedNotes || undefined })
  }

  // Photo capture → preview → "Add to evidence" → STAGE (Stage 3). Selecting/capturing opens a
  // preview (image + optional caption); "Add to evidence" stages it into the open composer's
  // draft (local — see attachPreviewPhoto). Multiple selected files are previewed one at a time.
  // The draft is durable only on the composer's Save, which is the single P4a enqueue point.
  function handlePhotoSelect(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    openPhotoPreview(itemId, Array.from(files))
  }
  function openPhotoPreview(itemId: string, files: File[]) {
    if (files.length === 0) { setPhotoPreview(null); return }
    setPhotoPreview({ itemId, files, url: URL.createObjectURL(files[0]), caption: "" })
  }
  // Drop the current preview and advance to the next file in the batch (the effect below
  // revokes the outgoing object URL when `url` changes / on unmount).
  function advancePhotoPreview() {
    const p = photoPreview
    if (!p) return
    const rest = p.files.slice(1)
    if (rest.length === 0) { setPhotoPreview(null); return }
    setPhotoPreview({ itemId: p.itemId, files: rest, url: URL.createObjectURL(rest[0]), caption: "" })
  }
  // "Add to evidence" = the confirm beat → STAGE into the open composer's draft (NOT queued
  // yet; the composer's Save is the P4a enqueue point). Each staged photo keeps its own object
  // URL for the thumbnail. Then advance through any remaining selected files.
  function attachPreviewPhoto() {
    const p = photoPreview
    if (!p) return
    const file = p.files[0]
    const staged: StagedPhoto = {
      key: `staged-${stagedSeq.current++}`,
      file,
      url: URL.createObjectURL(file),
      caption: p.caption.trim(),
    }
    setEvidenceDrafts(prev => {
      const item = check?.items.find(i => i.id === p.itemId)
      const base = prev[p.itemId] ?? { note: item ? getDraft(item).notes : "", photos: [] }
      return { ...prev, [p.itemId]: { ...base, photos: [...base.photos, staged] } }
    })
    if (openComposer !== p.itemId) setOpenComposer(p.itemId)
    advancePhotoPreview()
  }
  // Retake discards the whole current batch and reopens the picker for that item.
  function retakePreviewPhoto() {
    const p = photoPreview
    if (!p) return
    const itemId = p.itemId
    setPhotoPreview(null)
    setTimeout(() => photoInputRefs.current[itemId]?.click(), 0)
  }
  // Object-URL lifecycle: revoke the previewed image's URL when it changes or on unmount.
  React.useEffect(() => {
    const url = photoPreview?.url
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [photoPreview?.url])

  async function removePhoto(att: AttachmentSummary) {
    try {
      await deleteAttachment(att.id)
      await qc.invalidateQueries({ queryKey: ["check-detail", id] })
      notify.success("Photo removed")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Couldn't remove the photo")) }
  }

  // Caption commit from the PhotoDetailDialog. Staged → update the draft; pending → caption
  // rides the queued upload; uploaded → queued caption-edit (PATCH on drain, offline-safe).
  function commitPhotoCaption(target: PhotoDetailTarget, caption: string) {
    if (target.source === "staged") {
      setEvidenceDrafts(prev => {
        const next = { ...prev }
        for (const itemId of Object.keys(next)) {
          const d = next[itemId]
          const idx = d.photos.findIndex(ph => ph.key === target.key)
          if (idx >= 0) {
            const photos = d.photos.slice()
            photos[idx] = { ...photos[idx], caption }
            next[itemId] = { ...d, photos }
            break
          }
        }
        return next
      })
    } else if (target.source === "pending") {
      void sync.setPendingPhotoCaption(target.seq, caption)
    } else {
      void sync.queueCaptionEdit(target.attachment.id, caption)
    }
  }
  // Delete from the PhotoDetailDialog (already confirmed there). Staged → drop from the draft
  // (revoke its URL); uploaded → delete the attachment. Pending captures aren't deletable (the
  // dialog hides Delete for them) — they upload shortly and can then be removed.
  function deletePhoto(target: PhotoDetailTarget) {
    if (target.source === "staged") {
      URL.revokeObjectURL(target.url)
      setEvidenceDrafts(prev => {
        const next = { ...prev }
        for (const itemId of Object.keys(next)) {
          const d = next[itemId]
          if (d.photos.some(ph => ph.key === target.key)) {
            next[itemId] = { ...d, photos: d.photos.filter(ph => ph.key !== target.key) }
            break
          }
        }
        return next
      })
    } else if (target.source === "uploaded") {
      void removePhoto(target.attachment)
    }
  }

  // On unmount, revoke any still-staged (unsaved) photo object URLs so they don't leak.
  const evidenceDraftsRef = React.useRef(evidenceDrafts)
  evidenceDraftsRef.current = evidenceDrafts
  React.useEffect(() => () => {
    Object.values(evidenceDraftsRef.current).forEach(d => d.photos.forEach(p => URL.revokeObjectURL(p.url)))
  }, [])

  // Light guard: warn before unloading when something un-durable is at risk — an UNSAVED
  // evidence draft (note edited / photo staged, local-only until Save), OR offline with un-synced
  // queued work. (Saved-while-online work is durable in IDB and replays on next load.)
  React.useEffect(() => {
    const anyDraftDirty = Object.entries(evidenceDrafts).some(([itemId, d]) => {
      const item = check?.items.find(i => i.id === itemId)
      const base = item ? (drafts[itemId]?.notes ?? item.notes ?? "") : ""
      return d.note !== base || d.photos.length > 0
    })
    if (!anyDraftDirty && (online || sync.pendingCount === 0)) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [online, sync.pendingCount, evidenceDrafts, drafts, check])

  async function handleStart() {
    setTransitioning(true); setError("")
    try {
      await api.post(`/checks/${id}/start`)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to start")) }
    finally { setTransitioning(false) }
  }

  // Pre-start reschedule / reassign (draft briefing page). PATCH then refetch so the date/assignee
  // + recomputed status reflect server truth; the landing query is invalidated too (it shares cache).
  const [savingMeta, setSavingMeta] = React.useState(false)
  async function patchCheck(body: { scheduledAt?: string | null; assigneeId?: string | null }) {
    setSavingMeta(true)
    try {
      await api.patch(`/checks/${id}`, body)
      await qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
      // Quiet auto-save fields — a toast is their only feedback, so confirm which one saved.
      if ("assigneeId" in body) notify.success("Assignee updated")
      else if ("scheduledAt" in body) notify.success("Scheduled date saved")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Couldn't update the check")) }
    finally { setSavingMeta(false) }
  }

  // Download the server-generated compliance PDF. Only surfaced for COMPLETED/CLOSED
  // (the backend gates the same); the report embeds evidence images via the tenant-scoped
  // download path, so this stays a plain authed request.
  async function handleDownloadReport() {
    if (!check || reportDownloading) return
    setReportDownloading(true)
    try {
      await downloadCheckReport(check.id, check.reference)
    } catch {
      notify.error("Couldn't generate the report — please try again")
    } finally {
      setReportDownloading(false)
    }
  }

  async function handleSubmit() {
    setTransitioning(true)
    try {
      await api.post(`/checks/${id}/submit`, { engineerSummary: engineerSummary || undefined })
      // Submitted ⇒ no longer executing; drop the local draft/queue state for this check.
      // (Submit is gated on a drained queue, so nothing un-synced is discarded.)
      await checkSync.clearCheck(id!)
      setReviewMode(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
      notify.success("Check submitted for review")
    } catch (e: unknown) { notify.error(getApiErrorMessage(e, "Couldn't submit the check")) }
    finally { setTransitioning(false) }
  }

  async function handleReview() {
    setTransitioning(true)
    try {
      await api.post(`/checks/${id}/${reviewAction === "approve" ? "approve" : "return"}`, {
        reviewerNotes: reviewerNotes || undefined
      })
      setReviewOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
      notify.success(reviewAction === "approve" ? "Check approved" : "Returned for rework")
    } catch (e: unknown) {
      notify.error(getApiErrorMessage(e, reviewAction === "approve" ? "Couldn't approve the check" : "Couldn't return the check"))
    } finally { setTransitioning(false) }
  }

  // Reviewer flag-for-rework — persisted immediately (durable, survives reload) so the
  // flagged state is a first-class item state, not session-only. Online-only reviewer action
  // (not queued). Only the check-detail query changes — flags don't affect any list.
  async function flagItemAction(item: CheckItem, note: string) {
    setFlagSaving(true)
    try {
      await api.post(`/checks/${id}/items/${item.id}/flag`, { reworkNote: note })
      setFlagItem(null)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      notify.success("Item flagged for rework")
    } catch (e: unknown) {
      notify.error(getApiErrorMessage(e, "Couldn't flag the item"))
    } finally { setFlagSaving(false) }
  }

  async function unflagItemAction(item: CheckItem) {
    try {
      await api.delete(`/checks/${id}/items/${item.id}/flag`)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      notify.success("Flag removed")
    } catch (e: unknown) {
      notify.error(getApiErrorMessage(e, "Couldn't remove the flag"))
    }
  }

  async function handleCancel() {
    if (!cancellationReason.trim()) return
    setTransitioning(true)
    try {
      await api.post(`/checks/${id}/cancel`, { cancellationReason })
      setCancelOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
      notify.success("Check cancelled")
    } catch (e: unknown) {
      notify.error(getApiErrorMessage(e, "Couldn't cancel the check"))
    } finally { setTransitioning(false) }
  }

  async function handleAddAdHoc() {
    if (!adHocLabel.trim()) return
    try {
      await api.post(`/checks/${id}/items`, { label: adHocLabel, section: adHocSection || undefined })
      setAdHocLabel(""); setAdHocSection(""); setAdHocOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to add item")) }
  }

  // Compute sections early so hooks can reference sectionNames safely
  const sections: Record<string, CheckItem[]> = {}
  ;(check?.items ?? []).forEach(item => {
    const key = item.section ?? "General"
    if (!sections[key]) sections[key] = []
    sections[key].push(item)
  })
  const sectionNames = Object.keys(sections)

  // Scroll an anchor to the top of whichever element is scrolling (the items column on md,
  // the page on xs). scrollIntoView resolves the right scroller automatically; the anchors
  // carry scroll-margin-top so the sticky header bars don't cover the section/item top.
  function scrollToSection(sectionName: string) {
    setActiveSection(sectionName)
    const el = sectionRefs.current[sectionName]
    if (!el) return
    isScrollingRef.current = true
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    el.scrollIntoView({ behavior: "smooth", block: "start" })
    scrollTimeoutRef.current = setTimeout(() => { isScrollingRef.current = false }, 700)
  }

  // Track the active section so the sticky header swaps as you scroll past one. Viewport-
  // relative + a capture-phase scroll listener, so it works whether the items column scrolls
  // (md) or the page scrolls (xs) — scroll events don't bubble, but capture sees inner ones.
  React.useEffect(() => {
    if (!isExecLayout || sectionNames.length <= 1) return
    let rafId: number | null = null
    const THRESHOLD = 150 // px from viewport top: clears the app bar + exec header + sticky bar

    function recompute() {
      rafId = null
      if (isScrollingRef.current) return
      let current = sectionNames[0]
      for (const name of sectionNames) {
        const el = sectionRefs.current[name]
        if (el && el.getBoundingClientRect().top <= THRESHOLD) current = name
      }
      setActiveSection(prev => (prev === current ? prev : current))
    }
    function onScroll() {
      if (rafId !== null) return
      rafId = requestAnimationFrame(recompute)
    }

    window.addEventListener("scroll", onScroll, { passive: true, capture: true })
    recompute()
    return () => {
      window.removeEventListener("scroll", onScroll, true)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [isExecLayout, sectionNames.join(",")]) // eslint-disable-line

  if (isLoading) return <LoadingState />
  if (!check) return <ErrorState title="Check not found" />

  // Effective response = the committed optimistic draft (last Saved) if present, else the
  // server value. Stats use this so counts stay correct offline before the queue drains.
  // (On non-IN_PROGRESS layouts `drafts` is empty, so this is just the server value.)
  const respOf = (i: CheckItem): string => (drafts[i.id]?.response ?? i.response ?? "") || ""
  const totalItems = check.items.length
  const answeredItems = check.items.filter(i => respOf(i) !== "").length
  const passItems = check.items.filter(i => respOf(i) === "PASS").length
  const failItems = check.items.filter(i => respOf(i) === "FAIL").length
  const naItems = check.items.filter(i => respOf(i) === "NA").length
  const pendingItems = check.items.filter(i => respOf(i) === "").length
  const failedItems = check.items.filter(i => respOf(i) === "FAIL")
  const allRequiredAnswered = check.items.filter(i => i.isRequired).every(i => respOf(i) !== "")
  // Reviewer flag-for-rework: items the reviewer marked. Drives the Return count, the Approve
  // warning, and the engineer-side visibility (briefing banner + execution markers).
  const flaggedItems = check.items.filter(i => i.reworkFlagged)
  const flaggedCount = flaggedItems.length

  const canStart = ["DRAFT", "SCHEDULED", "ASSIGNED"].includes(check.status) && canExecute
  // PENDING_REVIEW now renders the read-only review surface (standard layout) instead of
  // the editable execution UI, so the approver attests to fixed evidence — they cannot
  // alter responses/notes/photos. Only the engineer's IN_PROGRESS pass is editable.
  const isExecuting = check.status === "IN_PROGRESS"
  // Evidence is frozen once the check is signed off — the check-level attachments panel
  // goes read-only (no Attach file / no delete), mirroring the backend attachment lock.
  // (Per-item photos are already preview-only in the standard-layout checklist below.)
  const attachmentsLocked = ["COMPLETED", "CLOSED"].includes(check.status)
  // A reviewer attests to the engineer's FIXED evidence — they don't add to (or remove from)
  // the check's own attachment record. So the check-level Attachments panel is read-only on the
  // review surface (PENDING_REVIEW) too, not only once signed off (attachmentsLocked above).
  const checkAttachmentsReadOnly = attachmentsLocked || check.status === "PENDING_REVIEW"

  // Group items by section — already computed above, just re-derive for the check guard
  // (sections/sectionNames are correct since check.items is now available)

  // Section completion stats (optimistic — counts the open card's last-Saved baseline).
  function getSectionStats(items: CheckItem[]) {
    const answered = items.filter(i => respOf(i) !== "").length
    const failed = items.filter(i => respOf(i) === "FAIL").length
    return { answered, failed, total: items.length }
  }

  // ── History (on-demand timeline) ───────────────────────────────────────
  // Header button → shared EntityHistoryDialog (entityType "Check"), so status transitions and
  // item-level events share ONE on-demand stream — never an always-open inline panel. The dialog
  // fetches on open; global staleTime is 30s, so we invalidate its key on open to guarantee the
  // freshest timeline right after a flag/return/re-answer rather than a 30s-stale read.
  const openHistory = () => {
    qc.invalidateQueries({ queryKey: ["entity-history", "Check", check.id] })
    setHistoryOpen(true)
  }
  const historyButton = (
    <Tooltip title="History">
      <IconButton size="small" onClick={openHistory}
        sx={{ color: "#64748b", flexShrink: 0, "&:hover": { color: "#1d4ed8", bgcolor: "transparent" } }}>
        <HistoryIcon sx={{ fontSize: 20 }} />
      </IconButton>
    </Tooltip>
  )
  const historyDialog = (
    <EntityHistoryDialog
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      entityType="Check"
      entityId={check.id}
      title="History"
    />
  )

  // The record-peek drawer — mirrors ServiceDeskNavigator's depth-2 drawer (minus link removal).
  // Inner Routes re-scope :id to the peeked record so the UNCHANGED detail pages resolve it;
  // DetailNarrowProvider both single-columns the shell AND trips its narrow-guards so the peeked
  // record won't overwrite this page's breadcrumb / full-bleed / title. Deliberately NOT wrapped in
  // a DrillNavContext provider, so a linked row inside the drawer falls back to standalone nav —
  // the drawer is a drill dead-end (no drawer-opens-drawer), matching the navigator's depth cap.
  const drawer = (
    <Drawer
      anchor="right"
      open={drawerOpen}
      onClose={closeDrawer}
      PaperProps={{ sx: { width: { xs: "100%", sm: "50vw" }, display: "flex", flexDirection: "column" } }}
    >
      {drawerOpen && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, borderBottom: "1px solid #e2e8f0", flexShrink: 0, minHeight: 48 }}>
            <IconButton aria-label="Close" size="small" onClick={closeDrawer}>
              <CloseIcon fontSize="small" />
            </IconButton>
            <Box sx={{ flex: 1 }} />
            <Box ref={setDrawerHeaderSlot} sx={{ display: "flex", alignItems: "center" }} />
          </Box>
          <DetailNarrowProvider value={true}>
            <DetailDrawerChromeProvider value={drawerChrome}>
              <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <Routes>
                  <Route path="task/:id/*" element={<TaskDetailPage />} />
                  <Route path="risk/:id/*" element={<RiskDetailPage />} />
                  <Route path="issue/:id/*" element={<IssueDetailPage />} />
                </Routes>
              </Box>
            </DetailDrawerChromeProvider>
          </DetailNarrowProvider>
        </>
      )}
    </Drawer>
  )

  // ── Shared dialogs (rendered in both layouts) ──────────────────────────
  const dialogs = (
    <>
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{reviewAction === "approve" ? "Approve check" : "Return for rework"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {reviewAction === "return" ? (
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fef3c7", border: "1px solid #fde68a" }}>
                <Typography variant="caption" color="#92400e">
                  The check will be returned to the engineer for corrections
                  {flaggedCount > 0 ? `, with ${flaggedCount} flagged item${flaggedCount === 1 ? "" : "s"} marked for rework` : ""}.
                </Typography>
              </Box>
            ) : null}
            {/* Approve-with-flags: warn (the flagged items won't be addressed) but don't block —
                a reviewer may sign off with minor notes recorded for history. */}
            {reviewAction === "approve" && flaggedCount > 0 ? (
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fffbeb", border: "1px solid #fde68a" }}>
                <Typography variant="caption" color="#92400e">
                  {flaggedCount} item{flaggedCount === 1 ? " is" : "s are"} flagged for rework. Approving signs
                  off the check anyway — the flag{flaggedCount === 1 ? "" : "s"} stay on the record but won't be
                  sent back. Use Return for rework to send {flaggedCount === 1 ? "it" : "them"} to the engineer.
                </Typography>
              </Box>
            ) : null}
            <TextField
              label={reviewAction === "return" ? "Reason for return (required)" : "Reviewer notes (optional)"}
              multiline rows={3} fullWidth value={reviewerNotes}
              onChange={e => setReviewerNotes(e.target.value)}
              placeholder={reviewAction === "return" ? "Explain what needs to be corrected..." : "Sign-off comments..."} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOpen(false)}>Cancel</Button>
          <Button variant="contained" color={reviewAction === "return" ? "warning" : "primary"}
            disabled={transitioning || (reviewAction === "return" && !reviewerNotes.trim())}
            onClick={handleReview}>
            {transitioning ? "Saving..." : reviewAction === "approve" ? "Approve" : "Return for rework"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cancel check</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Cancellation reason (required)" multiline rows={2} fullWidth
              value={cancellationReason} onChange={e => setCancellationReason(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>Back</Button>
          <Button variant="contained" color="error"
            disabled={!cancellationReason.trim() || transitioning} onClick={handleCancel}>
            Confirm cancellation
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={adHocOpen} onClose={() => setAdHocOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add checklist item</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Item label" value={adHocLabel}
              onChange={e => setAdHocLabel(e.target.value)} required fullWidth />
            <TextField label="Section (optional)" value={adHocSection}
              onChange={e => setAdHocSection(e.target.value)} fullWidth
              select={sectionNames.length > 0}>
              {sectionNames.length > 0 ? (
                [<MenuItem key="" value="">No section</MenuItem>,
                ...sectionNames.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)]
              ) : null}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdHocOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddAdHoc} disabled={!adHocLabel.trim()}>Add item</Button>
        </DialogActions>
      </Dialog>

      {/* Leaving an item with an unsaved evidence draft (opening another's composer). The answer
          is already committed — only the note/photo draft is at risk. */}
      <Dialog open={!!leavePrompt} onClose={() => setLeavePrompt(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard unsaved note?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            You have unsaved evidence (a note or photo) on this item. Your answer is already saved —
            only this evidence draft is unsaved.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeavePrompt(null)}>Stay</Button>
          <Button color="inherit" onClick={resolveLeaveDiscard}>Discard</Button>
          <Button variant="contained" disableElevation onClick={() => void resolveLeaveSave()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Image detail — caption edit + deliberate (confirmed) delete for any evidence photo. */}
      <PhotoDetailDialog
        open={!!photoDetail}
        target={photoDetail}
        canEdit={canExecute && !photoDetailViewOnly}
        onClose={() => { setPhotoDetail(null); setPhotoDetailViewOnly(false) }}
        onCaptionCommit={commitPhotoCaption}
        onDelete={deletePhoto}
      />

      {followOnItem ? (
        <FollowOnModal open={!!followOnItem} onClose={() => setFollowOnItem(null)}
          checkId={check.id} item={followOnItem}
          onSuccess={() => {
            setFollowOnItem(null)
            qc.invalidateQueries({ queryKey: ["check-detail", id] })
            qc.invalidateQueries({ queryKey: ["tasks"] })
            qc.invalidateQueries({ queryKey: ["risks"] })
            qc.invalidateQueries({ queryKey: ["issues"] })
          }} />
      ) : null}

      {/* Reviewer flag-for-rework note (required) — flagging persists immediately. */}
      <FlagNoteDialog
        open={!!flagItem}
        itemLabel={flagItem?.label ?? ""}
        saving={flagSaving}
        onClose={() => setFlagItem(null)}
        onSave={(note) => { if (flagItem) void flagItemAction(flagItem, note) }}
      />

      {historyDialog}
    </>
  )

  // ── Item card (execution surface) ──────────────────────────────────────────
  // Pass/Fail/N-A is ALWAYS visible and commits on tap (immediate toggle, never lost). EVIDENCE
  // (note + photos) is a separate Save/Discard composer: same on pass and fail; Fail auto-opens
  // it framed as expected; Pass/N-A offer it on demand from the compact row. Thumbnails are
  // view-only — tap one to open the PhotoDetailDialog (caption + deliberate delete).
  function renderItemCard(item: CheckItem, idx: number) {
    const draft = getDraft(item)
    const response = draft.response
    const isFail = response === "FAIL"
    const isPass = response === "PASS"
    const isNA = response === "NA"
    const isUnansweredRequired = item.isRequired && !response
    const accent = item.reworkFlagged ? "#f59e0b"
      : isUnansweredRequired ? "#f59e0b"
      : isPass ? "#15803d" : isFail ? "#b91c1c" : isNA ? "#94a3b8" : "#e2e8f0"
    const composerOpen = openComposer === item.id
    const ev = evidenceDrafts[item.id]
    const stagedPhotos = ev?.photos ?? []
    const uploaded = item.attachments ?? []
    const pending = sync.photosByItem[item.id] ?? []
    const photoCount = uploaded.length + pending.length + stagedPhotos.length
    const hasNote = draft.notes.trim().length > 0
    const needsEvidence = isFail && !hasNote && photoCount === 0
    const answered = response !== ""
    const dirty = draftIsDirty(item)
    const num = String(idx + 1).padStart(2, "0")

    const respBtn = (value: string, label: string, on: boolean, onCol: string, onBg: string, onText: string) => (
      <Button size="small" disabled={!canExecute} onClick={() => handleResponse(item, value)}
        sx={{
          flex: { xs: 1, md: "0 1 auto" }, minWidth: { xs: 0, md: 78 },
          fontSize: { xs: 14, md: 12 }, fontWeight: 600, borderRadius: "6px",
          border: "1.5px solid", py: { xs: "11px", md: "7px" },
          borderColor: on ? onCol : "#e2e8f0", bgcolor: on ? onBg : "#ffffff", color: on ? onText : "#64748b",
          "&.Mui-disabled": { color: on ? onText : "#cbd5e1", borderColor: on ? onCol : "#eef2f6" },
          "&:hover": { bgcolor: on ? onBg : "#f8fafc", borderColor: onCol, color: onText },
        }}>
        {label}
      </Button>
    )

    // A single view-only evidence thumbnail (52px tile). Tapping opens the PhotoDetailDialog;
    // there is NO inline × or caption — deleting/captioning is deliberate, inside the opened image.
    const photoThumb = (opts: { key: string; onClick: () => void; img?: string; icon?: React.ReactNode; dashed?: boolean; badge?: React.ReactNode }) => (
      <Box key={opts.key} onClick={opts.onClick}
        sx={{
          position: "relative", width: 52, height: 52, borderRadius: `${radii.md}px`, overflow: "hidden",
          border: opts.dashed ? "1px dashed #cbd5e1" : "1px solid #e2e8f0", bgcolor: "#f8fafc", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          transition: "border-color 0.1s", "&:hover": { borderColor: "#94a3b8" },
        }}>
        {opts.img
          ? <img src={opts.img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : opts.icon}
        {opts.badge}
      </Box>
    )

    return (
      <Box key={item.id}
        ref={(el: HTMLDivElement | null) => { itemRefs.current[item.id] = el }}
        sx={{
          bgcolor: "#ffffff", border: "1px solid #e2e8f0",
          borderLeft: (response || isUnansweredRequired) ? `3px solid ${accent}` : "1px solid #e2e8f0",
          borderRadius: "8px", p: "14px 16px", mb: "8px", transition: "border-color 0.15s",
        }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: "#94a3b8", mt: "3px", flexShrink: 0, minWidth: 22, fontFamily: "monospace" }}>
            {num}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Label + badges (squared-off TAG_RADIUS, not fully-rounded pills) */}
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: "6px", flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "#0f172a", flex: 1, lineHeight: 1.4 }}>
                {item.label}
              </Typography>
              {item.isRequired ? <Chip size="small" label="Required" sx={{ height: 18, fontSize: 10, borderRadius: `${TAG_RADIUS}px`, bgcolor: "#fef3c7", color: "#92400e" }} /> : null}
              {item.isCritical ? <Chip size="small" label="Critical" sx={{ height: 18, fontSize: 10, borderRadius: `${TAG_RADIUS}px`, bgcolor: "#fee2e2", color: "#b91c1c" }} /> : null}
              {item.isAdHoc ? <Chip size="small" label="Ad hoc" sx={{ height: 18, fontSize: 10, borderRadius: `${TAG_RADIUS}px`, bgcolor: "#f0f9ff", color: "#0369a1" }} /> : null}
            </Stack>
            {/* Reviewer flag-for-rework — surfaced to the engineer while they rework (the other
                half of the flag flow). Amber, with the reviewer's note so they know exactly why. */}
            {item.reworkFlagged ? (
              <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: "8px", px: "10px", py: "7px", bgcolor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px" }}>
                <OutlinedFlagIcon sx={{ fontSize: 15, color: "#d97706", mt: "1px", flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
                  <Box component="span" sx={{ fontWeight: 700 }}>Reviewer flagged</Box>
                  {item.reworkNote ? ` · ${item.reworkNote}` : ""}
                </Typography>
              </Stack>
            ) : null}

            {item.guidance ? (
              <Typography sx={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, mb: "10px" }}>{item.guidance}</Typography>
            ) : null}

            {/* Response — ALWAYS visible; the filled button is the answer state, so re-answering
                is one tap and an answer never "vanishes" on selection */}
            <Stack direction="row" spacing={0.75}>
              {respBtn("PASS", "✓ Pass", isPass, "#15803d", "#dcfce7", "#15803d")}
              {respBtn("FAIL", "✕ Fail", isFail, "#b91c1c", "#fee2e2", "#b91c1c")}
              {item.responseType !== "PASS_FAIL" ? respBtn("NA", "N/A", isNA, "#64748b", "#f1f5f9", "#475569") : null}
            </Stack>

            {/* Evidence composer (Save/Discard) when open; else the compact answered row. */}
            {composerOpen ? (
              <Box sx={{ borderTop: "1px dashed #e2e8f0", pt: "12px", mt: "12px" }}>
                {/* Fail framing — evidence is expected, not optional (a nudge, not a hard block) */}
                {needsEvidence ? (
                  <Box sx={{ mb: "10px", px: "10px", py: "7px", bgcolor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px" }}>
                    <Typography sx={{ fontSize: 11.5, color: "#92400e" }}>A note and photo are expected for failed items.</Typography>
                  </Box>
                ) : null}

                {/* Note draft (comment-box styling) — local until Save */}
                <Box sx={{ mb: "10px" }}>
                  <Box sx={{
                    borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "#fff",
                    px: 1.25, py: 0.5, transition: "border-color 120ms ease",
                    "&:focus-within": { borderColor: "primary.main" },
                  }}>
                    <TextField
                      variant="standard" fullWidth multiline minRows={2} autoFocus={!draft.notes}
                      placeholder={isFail ? "Describe the issue…" : "Add a note…"}
                      value={ev?.note ?? ""}
                      disabled={!canExecute}
                      onChange={e => setComposerNote(item.id, e.target.value)}
                      InputProps={{ disableUnderline: true }}
                      sx={{ "& .MuiInputBase-input": { fontSize: { xs: 16, md: 13 }, lineHeight: 1.5 } }}
                    />
                  </Box>
                </Box>

                {/* Photos — view-only thumbnails (tap to open) + an Add tile */}
                <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <input
                    type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }}
                    ref={el => { photoInputRefs.current[item.id] = el }}
                    onChange={e => { void handlePhotoSelect(item.id, e.target.files); e.target.value = "" }}
                  />

                  {/* Uploaded evidence (icon placeholder; real bytes shown in the detail dialog) */}
                  {uploaded.map(att => photoThumb({
                    key: att.id,
                    onClick: () => setPhotoDetail({ source: "uploaded", attachment: att }),
                    icon: isImageType(att.contentType)
                      ? <ImageIcon sx={{ fontSize: 22, color: "#64748b" }} />
                      : <DescriptionIcon sx={{ fontSize: 22, color: "#64748b" }} />,
                    badge: <CheckCircleIcon sx={{ position: "absolute", bottom: 1, right: 1, fontSize: 15, color: "#15803d", bgcolor: "#fff", borderRadius: "50%" }} />,
                  }))}

                  {/* Queued (offline) captures — pending upload */}
                  {pending.map(p => photoThumb({
                    key: `p-${p.seq}`,
                    onClick: () => setPhotoDetail({ source: "pending", seq: p.seq, url: p.url, filename: p.filename, caption: p.caption ?? "" }),
                    img: p.url, dashed: true,
                    badge: (
                      <Box sx={{ position: "absolute", bottom: 0, right: 0, bgcolor: "rgba(15,23,42,0.65)", color: "#fff", px: "3px", py: "1px", display: "flex", alignItems: "center" }}>
                        <ScheduleIcon sx={{ fontSize: 11 }} />
                      </Box>
                    ),
                  }))}

                  {/* Staged (this composer session, not yet Saved) */}
                  {stagedPhotos.map(p => photoThumb({
                    key: p.key,
                    onClick: () => setPhotoDetail({ source: "staged", key: p.key, url: p.url, filename: p.file.name, caption: p.caption }),
                    img: p.url,
                    badge: <Box sx={{ position: "absolute", top: 3, left: 3, width: 7, height: 7, borderRadius: "50%", bgcolor: "#2563eb" }} />,
                  }))}

                  {/* Add photo (opens camera/picker → capture beat → stages into this draft) */}
                  {canExecute ? (
                    <Box onClick={() => photoInputRefs.current[item.id]?.click()} sx={{
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px",
                      width: 52, height: 52, borderRadius: `${radii.md}px`, border: "1px dashed #cbd5e1", color: "#64748b",
                      cursor: "pointer", flexShrink: 0, transition: "all 0.1s",
                      "&:hover": { borderColor: "#94a3b8", color: "#0f172a", bgcolor: "#f8fafc" },
                    }}>
                      <CameraAltIcon sx={{ fontSize: 18 }} />
                      <Typography sx={{ fontSize: 9, fontWeight: 500, lineHeight: 1 }}>{photoCount > 0 ? "More" : "Add"}</Typography>
                    </Box>
                  ) : null}
                </Box>

                {/* Save / Discard — the single evidence commit (no per-element Done buttons).
                    Discard backs out (and reverts); Save flushes note + staged photos through P4a. */}
                {canExecute ? (
                  <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: "12px" }}>
                    <Button size="small" onClick={() => discardDraft(item.id)} sx={{ fontSize: 12, color: "#64748b" }}>
                      Discard
                    </Button>
                    <Button size="small" variant="contained" disableElevation disabled={!dirty} onClick={() => void saveEvidence(item)}
                      sx={{ fontSize: 12, px: "16px" }}>
                      Save
                    </Button>
                  </Stack>
                ) : null}
              </Box>
            ) : answered ? (
              /* Answered + composer closed. Evidence shows as view-only thumbnails (tap to preview
                 WITHOUT opening the composer — editing stays behind "Edit evidence"); below, a
                 left-grouped affordance line joins present fragments with "·" — the separator only
                 ever renders BETWEEN two present fragments, so there is no orphan leading "·". */
              <Box sx={{ mt: "10px" }}>
                {needsEvidence ? (
                  <Typography sx={{ fontSize: 11.5, color: "#b45309", fontWeight: 500, mb: "8px" }}>Note &amp; photo expected</Typography>
                ) : null}
                {uploaded.length > 0 || pending.length > 0 ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", mb: "8px" }}>
                    {uploaded.map(att => photoThumb({
                      key: att.id,
                      onClick: () => openPhotoView({ source: "uploaded", attachment: att }),
                      icon: isImageType(att.contentType)
                        ? <ImageIcon sx={{ fontSize: 22, color: "#64748b" }} />
                        : <DescriptionIcon sx={{ fontSize: 22, color: "#64748b" }} />,
                      badge: <CheckCircleIcon sx={{ position: "absolute", bottom: 1, right: 1, fontSize: 15, color: "#15803d", bgcolor: "#fff", borderRadius: "50%" }} />,
                    }))}
                    {pending.map(p => photoThumb({
                      key: `p-${p.seq}`,
                      onClick: () => openPhotoView({ source: "pending", seq: p.seq, url: p.url, filename: p.filename, caption: p.caption ?? "" }),
                      img: p.url, dashed: true,
                      badge: (
                        <Box sx={{ position: "absolute", bottom: 0, right: 0, bgcolor: "rgba(15,23,42,0.65)", color: "#fff", px: "3px", py: "1px", display: "flex", alignItems: "center" }}>
                          <ScheduleIcon sx={{ fontSize: 11 }} />
                        </Box>
                      ),
                    }))}
                  </Box>
                ) : null}
                {(() => {
                  // Build the present fragments in order, then interleave a "·" only between them.
                  const frags: React.ReactNode[] = []
                  if (hasNote) frags.push(
                    <Stack key="note" direction="row" alignItems="center" spacing={0.4}>
                      <NotesIcon sx={{ fontSize: 15, color: "#94a3b8" }} />
                      <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>Note</Typography>
                    </Stack>
                  )
                  if (item.followOns.length > 0) frags.push(
                    <Chip key="fo" size="small" label={`${item.followOns.length} follow-on${item.followOns.length === 1 ? "" : "s"}`}
                      sx={{ height: 18, fontSize: 10, borderRadius: `${TAG_RADIUS}px`, bgcolor: "#e0f2fe", color: "#0369a1" }} />
                  )
                  if (canExecute) frags.push(
                    <Button key="edit" size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: 14 }} />} onClick={() => requestOpenComposer(item)}
                      sx={{ fontSize: 11.5, color: needsEvidence ? "#b45309" : "#64748b", minWidth: 0 }}>
                      {hasNote || photoCount > 0 ? "Edit evidence" : "Add note or photo"}
                    </Button>
                  )
                  if (frags.length === 0) return null
                  return (
                    <Stack direction="row" alignItems="center" sx={{ flexWrap: "wrap", rowGap: "4px" }}>
                      {frags.map((node, i) => (
                        <React.Fragment key={i}>
                          {i > 0 ? <Box component="span" sx={{ mx: "8px", color: "#cbd5e1", fontSize: 12 }}>·</Box> : null}
                          {node}
                        </React.Fragment>
                      ))}
                    </Stack>
                  )
                })()}
              </Box>
            ) : null}

            {/* Follow-on prompt for failed items */}
            {isFail && canExecute ? (
              <Box sx={{ mt: "12px", p: "10px 12px", bgcolor: "#fef9e7", border: "1px solid #fcd34d", borderRadius: "6px" }}>
                {item.followOns.length > 0 ? (
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    {item.followOns.map(fo => (
                      <Chip key={fo.id} size="small" label={followOnLabel(fo)} sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10, borderRadius: `${TAG_RADIUS}px`, maxWidth: "100%" }} />
                    ))}
                    <Button size="small" onClick={() => setFollowOnItem(item)} sx={{ fontSize: 11, color: "#92400e", ml: "auto" }}>Add another</Button>
                  </Stack>
                ) : (
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography sx={{ fontSize: 12, color: "#92400e" }}>⚠ This item failed — create a follow-on action?</Typography>
                    <Button size="small" onClick={() => setFollowOnItem(item)}
                      sx={{ fontSize: 11, bgcolor: "#f59e0b", color: "#fff", px: "10px", py: "4px", borderRadius: "4px", "&:hover": { bgcolor: "#d97706" } }}>
                      Create
                    </Button>
                  </Stack>
                )}
              </Box>
            ) : null}
          </Box>
        </Stack>
      </Box>
    )
  }

  // ── EXECUTION LAYOUT (IN_PROGRESS only) ────────────────────────────────
  // The engineer's working surface: full-width rich cards (one-at-a-time edit), a sticky
  // per-section progress header (replacing the old left rail), lightweight section collapse,
  // and a self-review screen gating submit. Read-only review/completed render below.
  if (isExecuting) {
    const passPercent = totalItems > 0 ? (passItems / totalItems) * 100 : 0
    const failPercent = totalItems > 0 ? (failItems / totalItems) * 100 : 0
    const naPercent = totalItems > 0 ? (naItems / totalItems) * 100 : 0
    const remainingRequired = check.items.filter(i => i.isRequired && respOf(i) === "")
    const canSubmit = allRequiredAnswered && sync.pendingCount === 0
    const showSticky = sectionNames.length > 1
    const stickyName = activeSection ?? sectionNames[0] ?? ""
    const stickyStats = stickyName ? getSectionStats(sections[stickyName] ?? []) : { answered: 0, failed: 0, total: 0 }
    const detailRows = [
      { label: "Site", value: check.site.name },
      { label: "Template", value: check.template.name },
      check.scheduledAt ? { label: "Scheduled", value: new Date(check.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) } : null,
      check.startedAt ? { label: "Elapsed", value: formatElapsed(check.startedAt) } : null,
      check.assignee ? { label: "Engineer", value: userLabel(check.assignee) } : null,
      check.passRate !== null ? { label: "Pass rate", value: `${check.passRate}%` } : null,
    ].filter((row): row is DetailRow => row !== null)
    // Live pass rate — mirrors the server's calcPassRate (PASS / (PASS+FAIL); N/A excluded;
    // null when nothing answered; 100 when every answered item is N/A) so the tile reads the
    // same as the report/history figure.
    const livePassRate = answeredItems === 0
      ? null
      : (passItems + failItems) === 0 ? 100 : Math.round((passItems / (passItems + failItems)) * 100)
    const statTiles: { label: string; value: React.ReactNode; accent?: string }[] = [
      { label: "Pass", value: passItems, accent: "#15803d" },
      { label: "Fail", value: failItems, accent: "#b91c1c" },
      { label: "N/A", value: naItems, accent: "#475569" },
      { label: "Pass rate", value: livePassRate === null ? "—" : `${livePassRate}%`, accent: livePassRate === null ? "#94a3b8" : "#1d4ed8" },
    ]
    // Self-review "Needs attention" set — the actionable items, fixed IN-PLACE on the review
    // screen (no jump-back). Reviewer-flagged-for-rework (the engineer must address what was
    // returned) + required-but-unanswered (hard-blocks submit) + failed-without-evidence (the
    // soft nudge). Computed from optimistic state (respOf/drafts/photosByItem) so an item drops
    // out of the zone the instant it's resolved, before the queue drains.
    const needsAttention = check.items.filter(i => {
      if (i.reworkFlagged) return true
      const r = respOf(i)
      if (i.isRequired && r === "") return true
      if (r === "FAIL") {
        const note = (drafts[i.id]?.notes ?? i.notes ?? "").trim()
        const photos = (i.attachments?.length ?? 0) + (sync.photosByItem[i.id]?.length ?? 0)
        return !note && photos === 0
      }
      return false
    })

    return (
      <DrillNavContext.Provider value={drillPush}>
      <Box sx={{
        // md+: full-bleed pane (Shell <main> is p:0 + overflow:hidden + flex column), so we
        // fill with flex:1 and scroll internally. xs: <main> keeps 12px padding + is the
        // scroller, so we bleed -12px edge-to-edge and pin the action bar with sticky.
        mx: { xs: "-12px", md: 0 },
        mt: { xs: "-12px", md: 0 },
        mb: { xs: "-12px", md: 0 },
        flex: { md: 1 }, minHeight: { md: 0 },
        display: "flex", flexDirection: "column",
        overflow: { xs: "visible", md: "hidden" },
        bgcolor: "var(--color-background-tertiary)"
      }}>
        {/* ── Exec header (decluttered: title + key indicators + actions; ref/status
            live in the breadcrumb + Details, not here) ─────────────────── */}
        <Box sx={{ bgcolor: "var(--color-background-primary)", borderBottom: "1px solid var(--color-border-primary)", px: { xs: "16px", md: "28px" }, pt: "14px", pb: "12px", flexShrink: 0 }}>
          <Stack direction="row" alignItems="flex-start" spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: { xs: 17, md: 20 }, fontWeight: 500, color: "#0f172a", lineHeight: 1.3 }}>
                {check.title}
              </Typography>
              <Typography sx={{ fontSize: 13, color: "#64748b", mt: "3px" }}>
                {check.site.name} · {userLabel(check.assignee)}
              </Typography>
              {check.scopeNotes ? (
                <Typography sx={{ fontSize: 12.5, color: "#94a3b8", mt: "2px" }}>{check.scopeNotes}</Typography>
              ) : null}
            </Box>
            {/* Status indicator cluster + primary action (md+) */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0, pt: "2px" }}>
              <SyncStatusPill status={sync.status} pendingCount={sync.pendingCount} />
              {historyButton}
              {canExecute && !reviewMode ? (
                /* Always visible so "finish" is discoverable, but disabled until every required
                   item is answered (same gate as the self-review readiness banner). When blocked,
                   the tooltip surfaces HOW close they are — the remaining required count — rather
                   than restating the label. Wrapped in a span so the tooltip still fires while the
                   button is disabled (a disabled MUI button swallows pointer events). */
                <Tooltip title={!allRequiredAnswered ? `${remainingRequired.length} required item${remainingRequired.length === 1 ? "" : "s"} remaining` : ""}>
                  <Box component="span" sx={{ display: { xs: "none", md: "inline-flex" } }}>
                    <Button variant="contained" size="small" disableElevation
                      disabled={!allRequiredAnswered}
                      endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                      onClick={() => setReviewMode(true)}
                      sx={{ fontSize: 12, py: "7px" }}>
                      Review &amp; submit
                    </Button>
                  </Box>
                </Tooltip>
              ) : null}
            </Stack>
          </Stack>

          {/* Progress bar */}
          {totalItems > 0 ? (
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: "12px" }}>
              <Box sx={{ flex: 1, height: 7, bgcolor: "#f1f5f9", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                <Box sx={{ width: `${passPercent}%`, bgcolor: "#15803d", height: "100%", transition: "width 0.3s" }} />
                <Box sx={{ width: `${failPercent}%`, bgcolor: "#b91c1c", height: "100%", transition: "width 0.3s" }} />
                <Box sx={{ width: `${naPercent}%`, bgcolor: "#94a3b8", height: "100%", transition: "width 0.3s" }} />
              </Box>
              <Stack direction="row" spacing={2} sx={{ flexShrink: 0, display: { xs: "none", sm: "flex" } }}>
                {[
                  { dot: "#15803d", label: "Pass", value: passItems },
                  { dot: "#b91c1c", label: "Fail", value: failItems },
                  { dot: "#94a3b8", label: "N/A", value: naItems },
                  { dot: "#cbd5e1", label: "Pending", value: pendingItems }
                ].filter(r => r.value > 0 || r.label === "Pending").map(r => (
                  <Stack key={r.label} direction="row" alignItems="center" spacing={0.5}>
                    <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: r.dot, border: r.label === "Pending" ? "1px solid #94a3b8" : undefined }} />
                    <Typography sx={{ fontSize: 11.5, color: "#64748b" }}>
                      <strong style={{ color: "#0f172a" }}>{r.value}</strong> {r.label}
                    </Typography>
                  </Stack>
                ))}
                <Typography sx={{ fontSize: 11.5, color: "#64748b" }}>·</Typography>
                <Typography sx={{ fontSize: 11.5, color: "#64748b" }}>
                  <strong style={{ color: "#0f172a" }}>{answeredItems}/{totalItems}</strong> answered
                </Typography>
              </Stack>
              <Typography sx={{ fontSize: 11.5, color: "#64748b", flexShrink: 0, display: { xs: "block", sm: "none" } }}>
                <strong style={{ color: "#0f172a" }}>{answeredItems}/{totalItems}</strong>
              </Typography>
            </Stack>
          ) : null}

          {error ? <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert> : null}
        </Box>

        {reviewMode ? (
          /* ── SELF-REVIEW / SUBMIT SCREEN ─────────────────────────────── */
          <Box sx={{ flex: 1, overflowY: { xs: "visible", md: "auto" }, p: { xs: "16px 12px 24px", md: "24px 28px" }, minWidth: 0 }}>
            <Box sx={{ maxWidth: 760, mx: "auto" }}>
              <Button startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />} onClick={() => setReviewMode(false)}
                sx={{ fontSize: 12.5, color: "#64748b", mb: "12px", px: "6px" }}>
                Checklist
              </Button>
              <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#0f172a", mb: "16px" }}>Review &amp; submit</Typography>

              {/* ── Zone 1: Needs attention — fix it HERE (the editable execution card, not a
                  jump-back). Each item drops out the instant it's resolved. ─────────── */}
              {needsAttention.length > 0 ? (
                <Box sx={{ mb: "24px" }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: "6px" }}>
                    <WarningAmberIcon sx={{ fontSize: 16, color: "#b45309" }} />
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a" }}>
                      Needs attention ({needsAttention.length})
                    </Typography>
                  </Stack>
                  <Typography sx={{ fontSize: 12, color: "#64748b", mb: "12px" }}>
                    Answer, add a note or photo, or change the response right here — items clear as you resolve them.
                  </Typography>
                  {needsAttention.map((item, idx) => renderItemCard(item, idx))}
                </Box>
              ) : (
                <Box sx={{ mb: "24px", display: "flex", alignItems: "center", gap: 1, bgcolor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", px: "14px", py: "12px" }}>
                  <CheckCircleIcon sx={{ fontSize: 18, color: "#15803d" }} />
                  <Typography sx={{ fontSize: 13, color: "#15803d", fontWeight: 500 }}>Nothing needs attention — every required item is answered and each failure has evidence.</Typography>
                </Box>
              )}

              {/* ── Zone 2: Full checklist review — read-only final scan of every item ── */}
              <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "8px" }}>
                Full checklist review
              </Typography>
              <Box sx={{ mb: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {sectionNames.map(sectionName => (
                  <Box key={sectionName} sx={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                    {sectionNames.length > 1 ? (
                      <Box sx={{ bgcolor: "#f8fafc", px: "12px", py: "8px", borderBottom: "1px solid #e2e8f0" }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "#475569" }}>{sectionName}</Typography>
                      </Box>
                    ) : null}
                    <Stack divider={<Divider />}>
                      {sections[sectionName].map(item => {
                        const r = respOf(item)
                        const note = (drafts[item.id]?.notes ?? item.notes ?? "").trim()
                        const photos = (item.attachments?.length ?? 0) + (sync.photosByItem[item.id]?.length ?? 0)
                        return (
                          <Stack key={item.id} direction="row" alignItems="center" spacing={1} sx={{ px: "12px", py: "9px", bgcolor: "#fff" }}>
                            <StatusPill intent={resultIntent(r || null)}
                              label={r === "NA" ? "N/A" : r === "PASS" ? "Pass" : r === "FAIL" ? "Fail" : "—"} size="sm" />
                            <Typography sx={{ fontSize: 12.5, color: "#0f172a", flex: 1, minWidth: 0, lineHeight: 1.4 }}>{item.label}</Typography>
                            {note ? <Tooltip title="Has a note"><NotesIcon sx={{ fontSize: 14, color: "#94a3b8" }} /></Tooltip> : null}
                            {photos > 0 ? (
                              <Stack direction="row" alignItems="center" spacing={0.3}>
                                <CameraAltIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                                <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{photos}</Typography>
                              </Stack>
                            ) : null}
                          </Stack>
                        )
                      })}
                    </Stack>
                  </Box>
                ))}
              </Box>

              {/* ── Zone 3: Submit ──────────────────────────────────────────── */}
              {/* Stat tiles — shared design-language tile (secondary bg, accented value) */}
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: "10px", mb: "20px" }}>
                {statTiles.map(t => (
                  <StatTile key={t.label} label={t.label} value={t.value} accent={t.accent} />
                ))}
              </Box>

              {/* Readiness banner — gates submit on all required items answered */}
              {remainingRequired.length > 0 ? (
                <Box sx={{ mb: "20px", display: "flex", alignItems: "center", gap: 1, bgcolor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", px: "14px", py: "12px" }}>
                  <WarningAmberIcon sx={{ fontSize: 18, color: "#b45309" }} />
                  <Typography sx={{ fontSize: 13, color: "#92400e", fontWeight: 500 }}>
                    {remainingRequired.length} required item{remainingRequired.length === 1 ? "" : "s"} still to answer before you can submit.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ mb: "20px", display: "flex", alignItems: "center", gap: 1, bgcolor: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", px: "14px", py: "12px" }}>
                  <CheckCircleIcon sx={{ fontSize: 18, color: "#15803d" }} />
                  <Typography sx={{ fontSize: 13, color: "#15803d", fontWeight: 500 }}>All required items answered — ready to submit.</Typography>
                </Box>
              )}

              {/* Details */}
              <Box sx={{ mb: "20px", border: "1px solid #e2e8f0", borderRadius: "10px", p: "12px 16px" }}>
                {detailRows.map((row, i) => (
                  <Box key={row.label} sx={{ display: "flex", justifyContent: "space-between", py: "6px", fontSize: 12, borderBottom: i < detailRows.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <Typography sx={{ fontSize: 12, color: "#64748b" }}>{row.label}</Typography>
                    <Typography sx={{ fontSize: 12, color: "#0f172a", textAlign: "right", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.value}</Typography>
                  </Box>
                ))}
              </Box>

              {/* Engineer summary */}
              <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "8px" }}>
                Engineer summary (optional)
              </Typography>
              <TextField multiline minRows={3} fullWidth value={engineerSummary}
                onChange={e => setEngineerSummary(e.target.value)}
                placeholder="Overall observations from the visit…"
                sx={{ mb: "20px", "& .MuiInputBase-root": { fontSize: { xs: 16, md: 13 } } }} />

              {/* Submit (md+; xs uses the sticky bar below) */}
              <Box sx={{ display: { xs: "none", md: "block" } }}>
                {!allRequiredAnswered ? (
                  <Typography sx={{ fontSize: 12, color: "#92400e", mb: "8px" }}>
                    Answer the remaining {remainingRequired.length} required item{remainingRequired.length === 1 ? "" : "s"} to submit.
                  </Typography>
                ) : sync.pendingCount > 0 ? (
                  <Typography sx={{ fontSize: 12, color: "#92400e", mb: "8px" }}>
                    {sync.pendingCount} change(s) still syncing — submit once saved.
                  </Typography>
                ) : null}
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <Button variant="contained" disableElevation disabled={!canSubmit || transitioning}
                    onClick={handleSubmit} endIcon={<ArrowForwardIcon sx={{ fontSize: 16 }} />}
                    sx={{ fontSize: 13, py: "10px", px: "20px" }}>
                    {transitioning ? "Submitting…" : "Submit for review"}
                  </Button>
                  <Typography sx={{ fontSize: 11.5, color: "#94a3b8", mt: "8px" }}>
                    Sends for review and locks your answers.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        ) : (
          /* ── CHECKLIST BODY (full width) ─────────────────────────────── */
          <>
            {/* Sticky section header — current section + progress + jump menu */}
            {showSticky ? (
              <Box sx={{
                position: { xs: "sticky", md: "static" }, top: 0, zIndex: 5, flexShrink: 0,
                bgcolor: "#ffffff", borderBottom: "1px solid #e2e8f0",
                px: { xs: "16px", md: "28px" }, py: "9px",
                display: "flex", alignItems: "center", gap: 1,
              }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {stickyName}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>
                    {stickyStats.answered} of {stickyStats.total} answered
                    {stickyStats.failed > 0 ? ` · ${stickyStats.failed} fail` : ""}
                  </Typography>
                </Box>
                <Button size="small" endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 16 }} />}
                  onClick={e => setSectionMenuAnchor(e.currentTarget)}
                  sx={{ fontSize: 11.5, color: "#64748b", flexShrink: 0 }}>
                  Jump to section
                </Button>
                <Menu anchorEl={sectionMenuAnchor} open={!!sectionMenuAnchor} onClose={() => setSectionMenuAnchor(null)}>
                  {sectionNames.map(name => {
                    const s = getSectionStats(sections[name])
                    return (
                      <MenuItem key={name} selected={name === stickyName}
                        onClick={() => { setSectionMenuAnchor(null); scrollToSection(name) }}
                        sx={{ fontSize: 13, gap: 2, justifyContent: "space-between" }}>
                        <span>{name}</span>
                        <Typography component="span" sx={{ fontSize: 11, color: s.failed > 0 ? "#b91c1c" : "#94a3b8" }}>
                          {s.answered}/{s.total}{s.failed > 0 ? ` · ${s.failed} fail` : ""}
                        </Typography>
                      </MenuItem>
                    )
                  })}
                </Menu>
              </Box>
            ) : null}

            {/* Items column */}
            <Box ref={itemsColumnRef} sx={{ flex: 1, overflowY: { xs: "visible", md: "auto" }, p: { xs: "16px 12px", md: "20px 28px" }, minWidth: 0 }}>
              <Box sx={{ maxWidth: 900, mx: "auto" }}>
                {totalItems === 0 ? (
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <Typography variant="body2" color="text.secondary">No checklist items. This check was created without a template.</Typography>
                  </Box>
                ) : null}

                {sectionNames.map(sectionName => {
                  const items = sections[sectionName]
                  const stats = getSectionStats(items)
                  return (
                    <Box key={sectionName} ref={(el: HTMLDivElement | null) => { sectionRefs.current[sectionName] = el }}
                      sx={{ mb: "8px", scrollMarginTop: { xs: "120px", md: "16px" } }}>
                      {/* Section header — label + progress. Sections stay expanded as you work;
                          wayfinding is the sticky header + jump-to-section menu (no auto-collapse). */}
                      {showSticky ? (
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: "4px", py: "6px", mb: "8px" }}>
                          <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", flex: 1 }}>
                            {sectionName} · {stats.answered}/{stats.total}{stats.failed > 0 ? ` · ${stats.failed} fail` : ""}
                          </Typography>
                        </Stack>
                      ) : null}
                      <Box sx={{ mb: "12px" }}>
                        {items.map((item, idx) => renderItemCard(item, idx))}
                      </Box>
                    </Box>
                  )
                })}

                {/* Completion hint */}
                {!allRequiredAnswered ? (
                  <Box sx={{ p: "12px 14px", borderRadius: "8px", bgcolor: "#fffbeb", border: "1px solid #fde68a" }}>
                    <Typography sx={{ fontSize: 12, color: "#92400e" }}>
                      {remainingRequired.length} required item(s) still need a response before this check can be submitted.
                    </Typography>
                  </Box>
                ) : null}

                {/* Add ad-hoc item */}
                {canExecute ? (
                  <Box onClick={() => setAdHocOpen(true)} sx={{
                    mt: "8px", mb: { xs: "96px", md: "8px" },
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    p: "11px 16px", width: "100%",
                    border: "1.5px dashed #cbd5e1", borderRadius: "8px",
                    color: "#64748b", fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                    bgcolor: "transparent", transition: "all 0.1s",
                    "&:hover": { borderColor: "primary.main", color: "primary.main", bgcolor: "#f8fafc" }
                  }}>
                    <AddIcon sx={{ fontSize: 15 }} />
                    Add ad-hoc item
                  </Box>
                ) : null}
              </Box>
            </Box>
          </>
        )}

        {/* ── Sticky action bar (xs only) — Review&submit, or submit from the review screen */}
        {canExecute ? (
          <Box sx={{
            display: { xs: "flex", md: "none" },
            position: "sticky", bottom: 0, zIndex: 6, flexShrink: 0,
            bgcolor: "#ffffff", borderTop: "1px solid #e2e8f0",
            p: "12px", gap: 1, alignItems: "center",
            boxShadow: "0 -2px 8px rgba(15,23,42,0.06)",
          }}>
            {reviewMode ? (
              <Stack spacing={0.5} sx={{ width: "100%" }}>
                {!allRequiredAnswered ? (
                  <Typography sx={{ fontSize: 11.5, color: "#92400e", textAlign: "center" }}>
                    Answer {remainingRequired.length} required item{remainingRequired.length === 1 ? "" : "s"} to submit
                  </Typography>
                ) : sync.pendingCount > 0 ? (
                  <Typography sx={{ fontSize: 11.5, color: "#92400e", textAlign: "center" }}>
                    {sync.pendingCount} change(s) still syncing…
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                    Sends for review and locks your answers.
                  </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
                  <Button variant="outlined" onClick={() => setReviewMode(false)} sx={{ py: "11px", fontSize: 14, flexShrink: 0 }}>
                    Back
                  </Button>
                  <Button fullWidth variant="contained" disabled={!canSubmit || transitioning} onClick={handleSubmit} sx={{ py: "11px", fontSize: 14 }}>
                    {transitioning ? "Submitting…" : "Submit"}
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack spacing={0.5} sx={{ width: "100%" }}>
                {!allRequiredAnswered ? (
                  <Typography sx={{ fontSize: 11.5, color: "#92400e", textAlign: "center" }}>
                    {remainingRequired.length} required item(s) remaining
                  </Typography>
                ) : sync.pendingCount > 0 ? (
                  <Typography sx={{ fontSize: 11.5, color: "#92400e", textAlign: "center" }}>
                    {sync.pendingCount} change(s) still to sync…
                  </Typography>
                ) : null}
                <Button fullWidth variant="contained" size="large"
                  disabled={!allRequiredAnswered}
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 18 }} />}
                  onClick={() => setReviewMode(true)}
                  sx={{ py: "12px", fontSize: 15 }}>
                  Review &amp; submit
                </Button>
              </Stack>
            )}
          </Box>
        ) : null}

        {dialogs}
        <PhotoCaptureDialog
          open={!!photoPreview}
          url={photoPreview?.url ?? null}
          caption={photoPreview?.caption ?? ""}
          onCaptionChange={(value) => setPhotoPreview(prev => (prev ? { ...prev, caption: value } : prev))}
          onRetake={retakePreviewPhoto}
          onDiscard={advancePhotoPreview}
          onAttach={attachPreviewPhoto}
          recommended={(() => {
            const it = photoPreview ? check.items.find(i => i.id === photoPreview.itemId) : null
            return it ? respOf(it) === "FAIL" : false
          })()}
        />
      </Box>
      {drawer}
      </DrillNavContext.Provider>
    )
  }

  const propertiesRows: { label: string; value: React.ReactNode }[] = [
    { label: "Reference", value: <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{check.reference}</Typography> },
    { label: "Status", value: <StatusPill value={check.status} label={STATUS_LABELS[check.status]} size="sm" /> },
    { label: "Site", value: <Typography variant="caption" fontWeight={600}>{check.site.name}</Typography> },
    { label: "Template", value: <Typography variant="caption">{check.template.name}</Typography> },
    { label: "Assignee", value: <Typography variant="caption">{userLabel(check.assignee)}</Typography> },
  ]
  if (check.passRate !== null) {
    // Pass rate is a RAG metric, not a record status — keep it on the quiet RAG palette
    // so the deepened status colours stay the loud exception.
    const passRag = check.passRate >= 80 ? ragTokens.GREEN : check.passRate >= 60 ? ragTokens.AMBER : ragTokens.RED
    propertiesRows.push({
      label: "Pass rate",
      value: <Chip size="small" sx={{ bgcolor: passRag.bg, color: passRag.text, fontWeight: 700 }} label={`${check.passRate}%`} />
    })
  }
  if (failedItems.length > 0) {
    propertiesRows.push({
      label: "Failed items",
      value: <Typography variant="caption" sx={{ color: "#b91c1c", fontWeight: 700 }}>{failedItems.length}</Typography>
    })
  }
  if (check.scheduledAt) {
    propertiesRows.push({ label: "Scheduled", value: <Typography variant="caption">{new Date(check.scheduledAt).toLocaleDateString("en-GB")}</Typography> })
  }
  if (check.startedAt) {
    propertiesRows.push({ label: "Started", value: <Typography variant="caption">{new Date(check.startedAt).toLocaleDateString("en-GB")}</Typography> })
  }
  if (check.completedAt) {
    propertiesRows.push({ label: "Completed", value: <Typography variant="caption">{new Date(check.completedAt).toLocaleDateString("en-GB")}</Typography> })
  }
  propertiesRows.push({ label: "Created", value: <Typography variant="caption">{new Date(check.createdAt).toLocaleDateString("en-GB")}</Typography> })

  // ── DRAFT / PRE-START PAGE (engineer journey — focused context) ─────────
  // For pre-start states (DRAFT/SCHEDULED/ASSIGNED) the engineer gets a decluttered
  // briefing — what the visit covers + a single Start action — NOT the inert full
  // checklist. Gated on canStart (pre-start ∧ execute role), so non-execute viewers
  // (e.g. CLIENT_VIEWER) fall through to the unchanged read-only standard layout below.
  if (canStart) {
    const est = formatEst(check.template.estimatedMinutes)
    const draftTiles: { label: string; value: React.ReactNode }[] = [
      { label: "Items", value: totalItems },
      { label: "Sections", value: sectionNames.length },
      // Managers edit the date inline below, so the read-only Scheduled tile is theirs-only dropped.
      ...(canManage ? [] : [{ label: "Scheduled", value: formatScheduledShort(check.scheduledAt) }]),
      ...(est ? [{ label: "Est. time", value: est }] : []),
    ]
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", pb: "24px" }}>
        {/* Header — origin-aware back arrow + title on ONE line (consistent with the review
            surface), then status + site/assignee; Start on the right. */}
        <Stack direction="row" alignItems="flex-start" spacing={1.5} sx={{ mb: "22px" }}>
          <Tooltip title={cameFromHistory ? "Back to history" : "Back to checks"}>
            <IconButton onClick={goBack} size="small"
              sx={{ color: "#64748b", mt: "2px", flexShrink: 0, "&:hover": { color: "#1d4ed8", bgcolor: "transparent" } }}>
              <ArrowBackIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 }}>
              {check.title}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: "8px", flexWrap: "wrap", rowGap: "6px" }}>
              <StatusPill value={check.status} label={STATUS_LABELS[check.status] ?? check.status} size="sm" />
              {/* Managers edit the assignee below, so the subtitle drops it to avoid duplication. */}
              <Typography sx={{ fontSize: 13.5, color: "#64748b" }}>
                {canManage ? check.site.name : `${check.site.name} · ${userLabel(check.assignee)}`}
              </Typography>
            </Stack>
          </Box>
          {historyButton}
          <Button variant="contained" disableElevation size="small" onClick={handleStart} disabled={transitioning}
            sx={{ flexShrink: 0, fontSize: 13, py: "9px", px: "18px" }}>
            {transitioning ? "Starting…" : "Start check"}
          </Button>
        </Stack>
        {historyDialog}

        {/* Editable schedule + assignee (manager-tier) — a date with no date set can be fixed here;
            both auto-save (PATCH /checks/:id) and the picker is the assignable set, never raw /users. */}
        {canManage ? (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: "12px", mb: "22px" }}>
            <TextField
              type="date"
              label="Scheduled date"
              size="small"
              InputLabelProps={{ shrink: true }}
              value={check.scheduledAt ? check.scheduledAt.slice(0, 10) : ""}
              onChange={e => patchCheck({ scheduledAt: e.target.value || null })}
              disabled={savingMeta}
              fullWidth
            />
            <TextField
              select
              label="Assigned engineer"
              size="small"
              value={check.assignee?.id ?? ""}
              onChange={e => patchCheck({ assigneeId: e.target.value || null })}
              disabled={savingMeta}
              fullWidth
            >
              <MenuItem value="">Unassigned</MenuItem>
              {(assignableUsers ?? []).map(u => (
                <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>
              ))}
            </TextField>
          </Box>
        ) : null}

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        {/* Returned-for-rework summary — the first thing the engineer sees after a reviewer
            sends the check back. The briefing has no item list, so the flagged items (+ the
            reviewer's per-item notes) are surfaced here, alongside any overall return note.
            Once the engineer starts, each flagged item is also marked in its execution card. */}
        {flaggedCount > 0 ? (
          <Box sx={{ mb: "22px", p: "14px", bgcolor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "12px" }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: "8px" }}>
              <OutlinedFlagIcon sx={{ fontSize: 18, color: "#d97706" }} />
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: "#92400e" }}>
                Returned for rework · {flaggedCount} item{flaggedCount === 1 ? "" : "s"} flagged
              </Typography>
            </Stack>
            {check.reviewerNotes ? (
              <Typography sx={{ fontSize: 13, color: "#92400e", mb: "10px", lineHeight: 1.5 }}>
                {check.reviewerNotes}
              </Typography>
            ) : null}
            <Stack spacing={0.75}>
              {flaggedItems.map(fi => (
                <Box key={fi.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#d97706", mt: "7px", flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 13, color: "#0f172a", lineHeight: 1.45 }}>
                    <Box component="span" sx={{ fontWeight: 600 }}>{fi.label}</Box>
                    {fi.reworkNote ? <Box component="span" sx={{ color: "#92400e" }}>{` — ${fi.reworkNote}`}</Box> : null}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        ) : null}

        {/* Context stat tiles (Est. time dropped gracefully when the template has none) */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: `repeat(${draftTiles.length}, 1fr)` }, gap: "10px", mb: "26px" }}>
          {draftTiles.map(t => <StatTile key={t.label} label={t.label} value={t.value} />)}
        </Box>

        {/* What this check covers — section summary (icons are a best-effort heuristic) */}
        <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>
          What this check covers
        </Typography>
        <Stack spacing={1} sx={{ mb: "24px" }}>
          {sectionNames.map(name => {
            const Icon = sectionIcon(name)
            const count = sections[name].length
            return (
              <Box key={name} sx={{ display: "flex", alignItems: "center", gap: 1.5, bgcolor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", px: "14px", py: "12px" }}>
                <Box sx={{ width: 34, height: 34, borderRadius: "8px", bgcolor: "#eef2ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon sx={{ fontSize: 18, color: "#1d4ed8" }} />
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 500, color: "#0f172a", flex: 1, minWidth: 0 }}>{name}</Typography>
                <Typography sx={{ fontSize: 13, color: "#64748b", flexShrink: 0 }}>{count} item{count === 1 ? "" : "s"}</Typography>
              </Box>
            )
          })}
        </Stack>

        {/* Offline reassurance */}
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1, bgcolor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", px: "14px", py: "12px" }}>
          <InfoOutlinedIcon sx={{ fontSize: 17, color: "#94a3b8", mt: "1px", flexShrink: 0 }} />
          <Typography sx={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
            Your answers save automatically as you go. You can pause and resume any time — even offline.
          </Typography>
        </Box>
      </Box>
    )
  }

  // ── Read-only checklist item (review / completed surfaces) ──────────────────
  // Exception-based hierarchy: passes (and N/A) recede to a compact one-line row — a small
  // result pill + the question + quiet evidence indicators (note / photo count / follow-ons).
  // Fails (and reviewer-flagged items) auto-expand: heavier weight (left accent), with the
  // note + photo evidence inline (no click needed) since that's what gets scrutinised. On the
  // REVIEW surface (PENDING_REVIEW + reviewer) the per-item Flag / Task actions stay reachable
  // on EVERY item — inline on expanded items, via a per-row ⋮ menu on compact passes (so a pass
  // can still be flagged). COMPLETED passes reviewing=false ⇒ read-only, no actions.
  function renderReviewItem(item: CheckItem, reviewing: boolean) {
    const resp = item.response
    const flagged = !!item.reworkFlagged
    const isFail = resp === "FAIL"
    const hasNote = !!item.notes?.trim()
    // The per-item note is the engineer's field comment — attribute it to the check's
    // assignee (the executor) with a calm submitted-at timestamp. Display only (NOT the
    // threaded comment system) — see the attributed-comment block below.
    const noteAuthor = userLabel(check?.assignee, "Engineer")
    const noteTime = formatNoteTime(check?.submittedAt ?? null)
    const photos = item.attachments ?? []
    const respLabel = resp === "NA" ? "N/A" : resp === "PASS" ? "Pass" : resp === "FAIL" ? "Fail" : "Pending"
    // A pass/NA item with evidence of its own (note, photo, or a raised follow-on) also expands, so
    // that content is revealed inline rather than hidden behind a dead indicator glyph. Fails and
    // flagged items expand as before; a content-less pass/NA stays compact.
    const hasContent = hasNote || photos.length > 0 || item.followOns.length > 0
    const expanded = isFail || flagged || hasContent

    if (!expanded) {
      // Compact pass / N/A row — glanceable, low weight.
      return (
        <Box key={item.id} sx={{ px: "12px", py: "9px", bgcolor: "#fff", display: "flex", alignItems: "center", gap: 1 }}>
          <StatusPill intent={resultIntent(resp)} label={respLabel} size="sm" />
          <Typography sx={{ fontSize: 12.5, color: "#0f172a", flex: 1, minWidth: 0, lineHeight: 1.4 }}>{item.label}</Typography>
          {hasNote ? <Tooltip title="Has a note"><NotesIcon sx={{ fontSize: 14, color: "#94a3b8" }} /></Tooltip> : null}
          {photos.length > 0 ? (
            <Stack direction="row" alignItems="center" spacing={0.3}>
              <CameraAltIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
              <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{photos.length}</Typography>
            </Stack>
          ) : null}
          {item.followOns.length > 0 ? (
            <Tooltip title={`${item.followOns.length} follow-on${item.followOns.length === 1 ? "" : "s"}`}>
              <Stack direction="row" alignItems="center" spacing={0.3}>
                <AddTaskIcon sx={{ fontSize: 14, color: "#94a3b8" }} />
                <Typography sx={{ fontSize: 11, color: "#94a3b8" }}>{item.followOns.length}</Typography>
              </Stack>
            </Tooltip>
          ) : null}
          {reviewing ? (
            <Tooltip title="Item actions">
              <IconButton size="small" onClick={e => setRowMenu({ anchor: e.currentTarget, item })}
                sx={{ ml: "2px", color: "#94a3b8", "&:hover": { color: "#475569" } }}>
                <MoreVertIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Box>
      )
    }

    // Expanded item — evidence inline. Three visual tiers: flagged (amber) and fail (red) keep
    // their attention-grabbing treatment; a pass/NA revealed only because it carries content gets
    // a calm, neutral tier (white, thin slate rule) so a clean pass never reads as a problem.
    const accent = flagged ? "#f59e0b" : isFail ? "#b91c1c" : "#e2e8f0"
    const bg = flagged ? "#fffdf7" : isFail ? "#fffafa" : "#fff"
    const showFooterActions = reviewing
    return (
      <Box key={item.id} sx={{ bgcolor: bg, borderLeft: `3px solid ${accent}` }}>
        {/* Flagged-for-rework strip — amber, above the question so it's unmissable (unchanged). */}
        {flagged ? (
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ px: "14px", py: "8px", bgcolor: "#fffbeb", borderBottom: "1px solid #fde68a" }}>
            <OutlinedFlagIcon sx={{ fontSize: 15, color: "#d97706", mt: "1px", flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12, color: "#92400e", lineHeight: 1.45 }}>
              <Box component="span" sx={{ fontWeight: 700 }}>Flagged for rework</Box>
              {item.reworkNote ? ` · ${item.reworkNote}` : ""}
            </Typography>
          </Stack>
        ) : null}
        <Box sx={{ px: "14px", py: "12px" }}>
          {/* Header zone — result pill + question, top-aligned. */}
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <StatusPill intent={resultIntent(resp)} label={respLabel} size="sm" />
            <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0, color: "#0f172a", lineHeight: 1.45 }}>
              {item.label}
            </Typography>
          </Stack>
          {/* Note zone — engineer note as an attributed comment: shared Avatar + name + muted
              "noted · {time}", then the note as plain text indented under the name. No input-style
              box. Display only (NOT the threaded comment system) — the simple per-item note field. */}
          {hasNote ? (
            <Box sx={{ display: "flex", gap: 1, mt: "10px" }}>
              <Avatar name={noteAuthor} size="sm" variant="engineer" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="baseline" flexWrap="wrap">
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>{noteAuthor}</Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{noteTime ? `noted · ${noteTime}` : "noted"}</Typography>
                </Stack>
                <Typography sx={{ mt: 0.25, fontSize: 12.5, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{item.notes}</Typography>
              </Box>
            </Box>
          ) : null}
          {/* Evidence + linked-task zone — two labelled sub-columns (stack on xs). Collapses
              entirely when there's neither photo evidence nor a follow-on, so no empty band. */}
          {photos.length > 0 || item.followOns.length > 0 ? (
            <>
              <Divider sx={{ my: "12px" }} />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
                {photos.length > 0 ? (
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "text.secondary", mb: "8px" }}>Evidence</Typography>
                    {/* Read-only captioned cards; click the thumbnail to preview the auth'd blob via
                        the shared modal (the execution UI owns editing). */}
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: "10px", flexWrap: "wrap" }}>
                      {photos.map(att => (
                        <Box key={att.id} sx={{ display: "flex", flexDirection: "column", gap: "4px", width: 116 }}>
                          <Tooltip title={att.filename}>
                            <Box onClick={() => setPreviewAtt(att)} sx={{
                              width: 48, height: 48, borderRadius: "4px", border: "1px solid #e2e8f0",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              bgcolor: "#f8fafc", cursor: "pointer", "&:hover": { borderColor: "#cbd5e1" }
                            }}>
                              {isImageType(att.contentType)
                                ? <ImageIcon sx={{ fontSize: 20, color: "#64748b" }} />
                                : <DescriptionIcon sx={{ fontSize: 20, color: "#64748b" }} />}
                            </Box>
                          </Tooltip>
                          {att.caption ? (
                            <Typography sx={{ fontSize: 11, color: "#334155", lineHeight: 1.3, wordBreak: "break-word" }}>{att.caption}</Typography>
                          ) : (
                            <Typography sx={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.3, wordBreak: "break-word" }}>
                              {att.filename} · {new Date(att.uploadedAt).toLocaleDateString("en-GB")}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ) : null}
                {item.followOns.length > 0 ? (
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "text.secondary", mb: "4px" }}>Linked task</Typography>
                    {/* Follow-on (Task/Risk/Issue raised from this item) → shared LinkedRecordsContent
                        card. With the page's DrillNavContext provider in scope it opens the record in
                        the right-hand peek drawer (not a navigation), reusing the Service Desk drill path. */}
                    <LinkedRecordsContent
                      links={item.followOns.map(followOnAsLink)}
                      showAddButton={false}
                      onAddLink={() => {}}
                      onUnlink={() => {}}
                    />
                  </Box>
                ) : null}
              </Stack>
            </>
          ) : null}
          {/* Actions zone — subtle tertiary-tinted footer flush to the card edges (negative margins
              cancel the content gutter); the top border is the zone divider. Reviewer-only
              (PENDING_REVIEW). Behaviour unchanged — Flag feeds Return-gating, Task creates a linked task. */}
          {showFooterActions ? (
            <Stack direction="row" spacing={1} justifyContent="flex-end"
              sx={{ mx: "-14px", mb: "-12px", mt: "12px", px: "14px", py: "8px",
                    bgcolor: "rgba(15, 23, 42, 0.02)", borderTop: "1px solid", borderColor: "divider" }}>
              {flagged ? (
                <Button size="small" startIcon={<OutlinedFlagIcon sx={{ fontSize: 16 }} />} onClick={() => unflagItemAction(item)}
                  sx={{ fontSize: 11.5, color: "#92400e", textTransform: "none" }}>Unflag</Button>
              ) : (
                <Button size="small" startIcon={<OutlinedFlagIcon sx={{ fontSize: 16 }} />} onClick={() => setFlagItem(item)}
                  sx={{ fontSize: 11.5, color: "#b45309", textTransform: "none" }}>Flag for rework</Button>
              )}
              <Button size="small" startIcon={<AddTaskIcon sx={{ fontSize: 16 }} />} onClick={() => setFollowOnItem(item)}
                sx={{ fontSize: 11.5, color: "#1d4ed8", textTransform: "none" }}>Task</Button>
            </Stack>
          ) : null}
        </Box>
      </Box>
    )
  }

  // ── STANDARD LAYOUT (all other statuses) ──────────────────────────────
  return (
    <DrillNavContext.Provider value={drillPush}>
    <Box>
      {/* Record header — title + Start only. The ref lives in the breadcrumb and the
          Details panel; Site/Template are Details rows (no duplicated subtitle here). */}
      <Box sx={{ mb: "16px" }}>
        {/* Back arrow + title on ONE line (origin-aware destination on the tooltip) — the
            dedicated back row is reclaimed, matching the denser header density elsewhere. */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
          <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            {check.status === "PENDING_REVIEW" ? (
              /* Review surface — make the neutral exit unmistakable and clearly distinct from the
                 warning-coloured "Return for rework" in the side-card: keep the back arrow but
                 surface it as a labelled text control. */
              <Button onClick={goBack} size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 18 }} />}
                sx={{ color: "#64748b", textTransform: "none", fontSize: 13, fontWeight: 500, flexShrink: 0, mt: "-3px", px: "6px",
                      "&:hover": { color: "#1d4ed8", bgcolor: "transparent" } }}>
                {cameFromHistory ? "Back to history" : "Back to Field Work"}
              </Button>
            ) : (
              <Tooltip title={cameFromHistory ? "Back to history" : "Back to checks"}>
                <IconButton onClick={goBack} size="small"
                  sx={{ color: "#64748b", mt: "1px", flexShrink: 0, "&:hover": { color: "#1d4ed8", bgcolor: "transparent" } }}>
                  <ArrowBackIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
            <Typography variant="h5" fontWeight={700} sx={{ color: "#0f172a", lineHeight: 1.25, minWidth: 0 }}>
              {check.title}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
            {historyButton}
            {canStart ? (
              <Button variant="contained" size="small" onClick={handleStart} disabled={transitioning}>
                Start check
              </Button>
            ) : null}
            {/* Finalised checks only — the shareable evidence PDF. Mirrors the history
                page's row download; the backend gates COMPLETED/CLOSED. */}
            {["COMPLETED", "CLOSED"].includes(check.status) ? (
              <Button
                variant="outlined" size="small"
                startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                onClick={handleDownloadReport} disabled={reportDownloading}
              >
                {reportDownloading ? "Preparing…" : "Download report"}
              </Button>
            ) : null}
          </Stack>
        </Stack>
      </Box>

      {/* Workflow strip */}
      <WorkflowStrip
        stages={STATUS_ALL.map(s => ({ id: s, label: STATUS_LABELS[s], description: STATUS_DESCRIPTIONS[s] }))}
        currentStage={check.status}
        mb={2}
      />

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

      {/* Two-column layout */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 260px" }, gap: 3, alignItems: "start" }}>

        {/* Left — read-only checklist */}
        <Card>
          <Box sx={{ borderBottom: "1px solid #e2e8f0" }}>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}
              sx={{ px: 2, minHeight: 44, "& .MuiTabs-indicator": { backgroundColor: "primary.main" } }} textColor="inherit">
              <Tab label={`Checklist (${totalItems})`} sx={{ fontSize: 13, minHeight: 44 }} />
              {failedItems.length > 0 ? (
                <Tab label={`Failed (${failedItems.length})`} sx={{ fontSize: 13, minHeight: 44 }} />
              ) : null}
              {check.engineerSummary || check.reviewerNotes ? (
                <Tab label="Summary" sx={{ fontSize: 13, minHeight: 44 }} />
              ) : null}
            </Tabs>
          </Box>
          <CardContent>
            {activeTab === 0 ? (
              totalItems === 0 ? (
                <Box sx={{ py: 3, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">No checklist items.</Typography>
                </Box>
              ) : (
                <Stack spacing={2}>
                  {sectionNames.map(sectionName => {
                    const items = sections[sectionName]
                    const reviewing = check.status === "PENDING_REVIEW" && canReview
                    const secFailed = items.filter(i => i.response === "FAIL").length
                    const secAnswered = items.filter(i => i.response).length
                    return (
                      // One bordered container per section; passes are a quiet divided list,
                      // fails/flagged break out as heavier accented rows within it.
                      <Box key={sectionName} sx={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
                        {sectionNames.length > 1 ? (
                          <Box sx={{ bgcolor: "#f8fafc", px: "12px", py: "8px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: "#475569", flex: 1, minWidth: 0 }}>
                              {sectionName}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: secFailed > 0 ? "#b91c1c" : "#94a3b8", flexShrink: 0 }}>
                              {secAnswered}/{items.length}{secFailed > 0 ? ` · ${secFailed} fail` : ""}
                            </Typography>
                          </Box>
                        ) : null}
                        <Stack divider={<Divider />}>
                          {items.map(item => renderReviewItem(item, reviewing))}
                        </Stack>
                      </Box>
                    )
                  })}
                </Stack>
              )
            ) : null}

            {activeTab === 1 ? (
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  Failed items from this check. Create follow-on actions for any requiring remediation.
                </Typography>
                {failedItems.map(item => (
                  <Box key={item.id} sx={{ p: 1.5, borderRadius: 1.5, border: "1px solid #fecaca", bgcolor: "#fff5f5" }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                          <StatusPill intent="danger" label="FAIL" size="sm" />
                          <Typography variant="body2" fontWeight={600}>{item.label}</Typography>
                        </Stack>
                        {item.notes ? <Typography variant="caption" color="text.secondary">{item.notes}</Typography> : null}
                        {item.followOns.length > 0 ? (
                          <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                            {item.followOns.map(fo => (
                              <Chip key={fo.id} size="small" label={followOnLabel(fo)} sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10, maxWidth: "100%" }} />
                            ))}
                          </Stack>
                        ) : null}
                      </Box>
                      {canExecute && !["COMPLETED", "CLOSED"].includes(check.status) ? (
                        <Button size="small" variant="outlined" color="error" onClick={() => setFollowOnItem(item)} sx={{ ml: 1.5, flexShrink: 0 }}>
                          Create follow-on
                        </Button>
                      ) : null}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            ) : null}

            {activeTab === 2 ? (
              <Stack spacing={2}>
                {check.engineerSummary ? (
                  <Box>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#94a3b8", mb: 0.75 }}>ENGINEER SUMMARY</Typography>
                    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{check.engineerSummary}</Typography>
                    </Box>
                  </Box>
                ) : null}
                {check.reviewerNotes ? (
                  <Box>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#94a3b8", mb: 0.75 }}>REVIEWER NOTES</Typography>
                    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "#fffbeb", border: "1px solid #fde68a" }}>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{check.reviewerNotes}</Typography>
                    </Box>
                  </Box>
                ) : null}
              </Stack>
            ) : null}
          </CardContent>
        </Card>

        {/* Right column */}
        <Stack spacing={2}>
          {/* Review rail — PENDING_REVIEW only. The reviewer acts on the read-only
              checklist + per-item photos (left) and the engineer summary below; editing
              is disabled (the surface is read-only) so they attest to fixed evidence.
              Reuses the shared review dialog via setReviewAction / setReviewOpen. */}
          {check.status === "PENDING_REVIEW" && canReview ? (
            <Card>
              <CardContent>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#94a3b8", mb: 1.5 }}>REVIEW</Typography>
                <Stack spacing={1}>
                  <Button fullWidth variant="contained" size="small"
                    onClick={() => { setReviewAction("approve"); setReviewOpen(true) }}
                    sx={{ fontSize: 12, py: "10px" }}>
                    Approve check
                  </Button>
                  {/* Return is gated on the flagged-count (the single source of truth that also
                      drives the "· N flagged" label), mirroring the Submit gate: a return must
                      carry at least one flagged item. Visible-but-disabled with an informative
                      hint, never hidden. Approve stays always-enabled (it needs no flags). */}
                  <Button fullWidth variant="outlined" size="small" color="warning"
                    disabled={flaggedCount === 0}
                    onClick={() => { setReviewAction("return"); setReviewOpen(true) }}
                    sx={{ fontSize: 12 }}>
                    {flaggedCount > 0 ? `Return for rework · ${flaggedCount} flagged` : "Return for rework"}
                  </Button>
                  {flaggedCount === 0 ? (
                    <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>
                      Flag an item to return.
                    </Typography>
                  ) : null}
                </Stack>
                {check.engineerSummary ? (
                  <Box sx={{ mt: 2 }}>
                    <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#94a3b8", mb: 0.75 }}>ENGINEER SUMMARY</Typography>
                    <Typography sx={{ fontSize: 12, color: "#334155", bgcolor: "#f8fafc", p: "10px", borderRadius: "6px", whiteSpace: "pre-wrap", lineHeight: 1.6, border: "1px solid #e2e8f0" }}>
                      {check.engineerSummary}
                    </Typography>
                  </Box>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <PropertiesPanel
            title="Details"
            rows={propertiesRows}
          />

          {totalItems > 0 ? (
            <Card>
              <CardContent sx={{ pb: "12px !important" }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#94a3b8", mb: 1.5 }}>PROGRESS</Typography>
                <Box sx={{ height: 6, borderRadius: 3, bgcolor: "#f1f5f9", overflow: "hidden", display: "flex", mb: 1 }}>
                  <Box sx={{ width: `${(passItems / totalItems) * 100}%`, bgcolor: "#15803d", height: "100%", transition: "width 0.3s" }} />
                  <Box sx={{ width: `${(failItems / totalItems) * 100}%`, bgcolor: "#b91c1c", height: "100%", transition: "width 0.3s" }} />
                  <Box sx={{ width: `${(naItems / totalItems) * 100}%`, bgcolor: "#94a3b8", height: "100%", transition: "width 0.3s" }} />
                </Box>
                <Stack spacing={0.5}>
                  {[
                    { label: "Pass", value: passItems, color: "#15803d" },
                    { label: "Fail", value: failItems, color: "#b91c1c" },
                    { label: "N/A", value: naItems, color: "#64748b" },
                    { label: "Pending", value: pendingItems, color: "#94a3b8" }
                  ].filter(r => r.value > 0).map(row => (
                    <Stack key={row.label} direction="row" justifyContent="space-between">
                      <Typography variant="caption" sx={{ color: row.color, fontWeight: 600 }}>{row.label}</Typography>
                      <Typography variant="caption" sx={{ color: row.color, fontWeight: 700 }}>{row.value}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <RightPanelSection
              title="Attachments"
              icon={<AttachFileIcon sx={{ fontSize: 12 }} />}
            >
              <AttachmentsContent
                attachments={check?.attachments ?? []}
                recordType="check"
                recordId={check?.id ?? ""}
                readOnly={checkAttachmentsReadOnly}
                onChanged={() => qc.invalidateQueries({ queryKey: ["check-detail", id] })}
              />
            </RightPanelSection>
          </Card>
        </Stack>
      </Box>

      {/* Mobile sticky review bar — keeps Approve/Return reachable on phones without
          scrolling past the full checklist (the right-rail Review card sits below the
          checklist on xs). Mirrors the execution layout's sticky action bar. */}
      {check.status === "PENDING_REVIEW" && canReview ? (
        <Box sx={{
          display: { xs: "block", md: "none" },
          position: "sticky", bottom: 0, zIndex: 2,
          bgcolor: "#ffffff", borderTop: "1px solid #e2e8f0",
          mx: "-12px", mt: 2, px: "12px", py: "12px",
          boxShadow: "0 -2px 8px rgba(15,23,42,0.06)",
        }}>
          {flaggedCount === 0 ? (
            <Typography sx={{ fontSize: 11.5, color: "#94a3b8", textAlign: "center", mb: "8px" }}>
              Flag an item to return.
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
            <Button fullWidth variant="outlined" color="warning"
              disabled={flaggedCount === 0}
              onClick={() => { setReviewAction("return"); setReviewOpen(true) }}
              sx={{ py: "11px", fontSize: 14 }}>
              {flaggedCount > 0 ? `Return · ${flaggedCount}` : "Return"}
            </Button>
            <Button fullWidth variant="contained"
              onClick={() => { setReviewAction("approve"); setReviewOpen(true) }}
              sx={{ py: "11px", fontSize: 14 }}>
              Approve
            </Button>
          </Stack>
        </Box>
      ) : null}

      {/* Per-row actions (review surface compact passes) — Flag/Task on any item, incl. a pass. */}
      <Menu anchorEl={rowMenu?.anchor ?? null} open={!!rowMenu} onClose={() => setRowMenu(null)}>
        {rowMenu?.item.reworkFlagged ? (
          <MenuItem onClick={() => { const it = rowMenu.item; setRowMenu(null); void unflagItemAction(it) }} sx={{ fontSize: 13 }}>
            <OutlinedFlagIcon sx={{ fontSize: 16, mr: 1, color: "#92400e" }} /> Unflag
          </MenuItem>
        ) : (
          <MenuItem onClick={() => { const it = rowMenu!.item; setRowMenu(null); setFlagItem(it) }} sx={{ fontSize: 13 }}>
            <OutlinedFlagIcon sx={{ fontSize: 16, mr: 1, color: "#b45309" }} /> Flag for rework
          </MenuItem>
        )}
        <MenuItem onClick={() => { const it = rowMenu!.item; setRowMenu(null); setFollowOnItem(it) }} sx={{ fontSize: 13 }}>
          <AddTaskIcon sx={{ fontSize: 16, mr: 1, color: "#1d4ed8" }} /> Create task
        </MenuItem>
      </Menu>

      {dialogs}
      <AttachmentPreviewModal open={!!previewAtt} attachment={previewAtt} onClose={() => setPreviewAtt(null)} />
    </Box>
    {drawer}
    </DrillNavContext.Provider>
  )
}