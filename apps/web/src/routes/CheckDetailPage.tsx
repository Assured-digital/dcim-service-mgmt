import React from "react"
import { useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, Menu, MenuItem, Stack,
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
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import NotesIcon from "@mui/icons-material/Notes"
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
import type { SvgIconComponent } from "@mui/icons-material"
import { PhotoCaptureDialog } from "../components/checks/PhotoCaptureDialog"
import {
  PropertiesPanel, StatusPill, ragTokens, WorkflowStrip, type SemanticIntent
} from "../components/shared"
import { RightPanelSection } from "../components/detail"
import { AttachmentsContent } from "../components/AttachmentsContent"
import { AttachmentPreviewModal } from "../components/AttachmentPreviewModal"
import { type AttachmentSummary, deleteAttachment, isImageType } from "../lib/attachments"
import { downloadCheckReport } from "../lib/checkReport"
import { ErrorState, LoadingState } from "../components/PageState"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
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
  followOns: { id: string; entityType: string; entityId: string; note: string | null }[]
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
          <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fff5f5", border: "1px solid #fecaca" }}>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <WarningAmberIcon sx={{ fontSize: 14, color: "#b91c1c" }} />
              <Typography variant="caption" color="#b91c1c" fontWeight={600}>Failed: {item.label}</Typography>
            </Stack>
          </Box>
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
  const { id } = useParams()
  const qc = useQueryClient()
  const { setRecordLabel, setPageFullBleed } = useBreadcrumb()

  const canExecute = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

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
  // Per-item field-evidence photos persist to object storage as `check-item`
  // attachments; offline captures queue locally (see useCheckExecutionSync) and show
  // as pending thumbnails until they upload.
  const [previewAtt, setPreviewAtt] = React.useState<AttachmentSummary | null>(null)
  // Photo capture confirm beat (Stage 3): a selected/captured image is previewed here with an
  // optional caption BEFORE anything is committed. `files` holds the current batch (current at
  // [0]); `url` is a local object URL owned here (created on select, revoked on attach/discard),
  // so the preview is pure UI and works fully offline — Attach is the existing P4a enqueue point.
  const [photoPreview, setPhotoPreview] = React.useState<{ itemId: string; files: File[]; url: string; caption: string } | null>(null)
  const [photoAttaching, setPhotoAttaching] = React.useState(false)
  // In-flight caption edits keyed by attachment id (persisted) or `pending:<seq>` (queued
  // capture). Held until committed on blur so typing doesn't write per keystroke.
  const [captionDrafts, setCaptionDrafts] = React.useState<Record<string, string>>({})

  // ── Inline answering UI state ───────────────────────────────────────────────
  // openNotes = item ids whose note composer is revealed (on-demand "Add note", or
  // auto-revealed when an item is marked Fail). Answers themselves are immediate — there is
  // no per-card edit/Save mode.
  const [openNotes, setOpenNotes] = React.useState<Set<string>>(new Set())
  // The Pass/Fail/N-A buttons are always visible; only the secondary note/photo detail tucks.
  // An item id in `editingItems` has its detail strip open. (Fail forces it open so the failure
  // gets documented; Pass/N-A tuck to a compact row for a tighter, faster list.)
  const [editingItems, setEditingItems] = React.useState<Set<string>>(new Set())
  const [reviewMode, setReviewMode] = React.useState(false)
  // Sections that all-answered but the user manually re-expanded (collapse is purely visual).
  const [expandedComplete, setExpandedComplete] = React.useState<Set<string>>(new Set())
  const [sectionMenuAnchor, setSectionMenuAnchor] = React.useState<HTMLElement | null>(null)
  const photoInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({})
  const itemRefs = React.useRef<Record<string, HTMLElement | null>>({})
  const [followOnItem, setFollowOnItem] = React.useState<CheckItem | null>(null)
  const [engineerSummary, setEngineerSummary] = React.useState("")
  const [reviewOpen, setReviewOpen] = React.useState(false)
  const [reviewAction, setReviewAction] = React.useState<"approve" | "return">("approve")
  const [reviewerNotes, setReviewerNotes] = React.useState("")
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [cancellationReason, setCancellationReason] = React.useState("")
  const [adHocOpen, setAdHocOpen] = React.useState(false)
  const [adHocLabel, setAdHocLabel] = React.useState("")
  const [adHocSection, setAdHocSection] = React.useState("")

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

  // The optimistic answer for an item — the immediate draft if present, else the server value.
  function getDraft(item: CheckItem) {
    return {
      response: drafts[item.id]?.response ?? item.response ?? "",
      notes: drafts[item.id]?.notes ?? item.notes ?? "",
    }
  }

  // ── Inline answering (immediate save through the offline queue) ──────────────
  // Answers/notes/photos write IMMEDIATELY via the existing P4a helpers (optimistic IDB +
  // queued drain) — no per-card edit/Save mode. The refetch happens once the queue drains
  // (the pendingCount effect above).
  function openNote(id: string) { setOpenNotes(prev => new Set(prev).add(id)) }
  function closeNote(id: string) {
    setOpenNotes(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function startEdit(id: string) { setEditingItems(prev => new Set(prev).add(id)) }
  function stopEdit(id: string) {
    setEditingItems(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  // One tap = answered + saved. Fail → open the detail strip and reveal the note composer to
  // push the engineer to document the failure (a nudge, not a hard block); Pass/N-A → tuck the
  // detail to a compact row so the list stays tight (buttons stay visible either way).
  async function handleResponse(item: CheckItem, response: string) {
    const currentNotes = getDraft(item).notes
    setDrafts(prev => ({ ...prev, [item.id]: { response, notes: currentNotes } }))
    if (response === "FAIL") { openNote(item.id); startEdit(item.id) }
    else stopEdit(item.id)
    await sync.saveItemAnswer(item.id, { response, notes: currentNotes || undefined })
  }

  function setNote(item: CheckItem, notes: string) {
    setDrafts(prev => ({ ...prev, [item.id]: { response: getDraft(item).response, notes } }))
  }
  async function handleNotesBlur(item: CheckItem) {
    const d = getDraft(item)
    if (!d.response && !d.notes.trim()) return
    await sync.saveItemAnswer(item.id, { response: d.response || undefined, notes: d.notes || undefined })
  }

  // Photo capture → preview → confirm → attach (Stage 3). Selecting/capturing opens a preview
  // (image + optional caption) — NOTHING is committed until the engineer taps Attach. Multiple
  // selected files are previewed one at a time. The actual durable enqueue is unchanged (the
  // proven P4a path): a capture is never lost if signal drops mid-visit, and pending captures
  // show as thumbnails until their upload drains.
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
  // Attach = the confirm beat → existing P4a enqueue (caption rides the upload). Then advance.
  async function attachPreviewPhoto() {
    const p = photoPreview
    if (!p) return
    setPhotoAttaching(true)
    try {
      await sync.queuePhoto(p.itemId, p.files[0], p.caption.trim() || undefined)
    } finally {
      setPhotoAttaching(false)
      advancePhotoPreview()
    }
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
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to remove photo")) }
  }

  // Caption value to show: the in-flight draft if the user has touched this input, else the
  // persisted (attachment) / queued (pending) value.
  function captionValue(key: string, fallback: string): string {
    return key in captionDrafts ? captionDrafts[key] : fallback
  }
  // Commit a caption on blur. Persisted attachment → queued caption-edit (PATCH on drain,
  // offline-safe); pending capture → caption stored on the queued photo (rides the upload).
  // Both no-op when unchanged.
  async function commitAttCaption(att: AttachmentSummary) {
    if (!(att.id in captionDrafts)) return
    const next = captionDrafts[att.id]
    if ((att.caption ?? "") !== next) await sync.queueCaptionEdit(att.id, next)
  }
  async function commitPendingCaption(seq: number, current: string) {
    const key = `pending:${seq}`
    if (!(key in captionDrafts)) return
    const next = captionDrafts[key]
    if ((current ?? "") !== next) await sync.setPendingPhotoCaption(seq, next)
  }

  // Light guard: warn before unloading only if offline with un-synced work (online work is
  // durable in IDB and replays on next load, so no warning needed there).
  React.useEffect(() => {
    if (online || sync.pendingCount === 0) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [online, sync.pendingCount])

  async function handleStart() {
    setTransitioning(true); setError("")
    try {
      await api.post(`/checks/${id}/start`)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed to start")) }
    finally { setTransitioning(false) }
  }

  // Download the server-generated compliance PDF. Only surfaced for COMPLETED/CLOSED
  // (the backend gates the same); the report embeds evidence images via the tenant-scoped
  // download path, so this stays a plain authed request.
  async function handleDownloadReport() {
    if (!check || reportDownloading) return
    setReportDownloading(true); setError("")
    try {
      await downloadCheckReport(check.id, check.reference)
    } catch {
      setError("Couldn't generate the report. Please try again.")
    } finally {
      setReportDownloading(false)
    }
  }

  async function handleSubmit() {
    setTransitioning(true); setError("")
    try {
      await api.post(`/checks/${id}/submit`, { engineerSummary: engineerSummary || undefined })
      // Submitted ⇒ no longer executing; drop the local draft/queue state for this check.
      // (Submit is gated on a drained queue, so nothing un-synced is discarded.)
      await checkSync.clearCheck(id!)
      setReviewMode(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed")) }
    finally { setTransitioning(false) }
  }

  async function handleReview() {
    setTransitioning(true); setError("")
    try {
      await api.post(`/checks/${id}/${reviewAction === "approve" ? "approve" : "return"}`, {
        reviewerNotes: reviewerNotes || undefined
      })
      setReviewOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
    } catch (e: unknown) { setError(getApiErrorMessage(e, "Failed")) }
    finally { setTransitioning(false) }
  }

  async function handleCancel() {
    if (!cancellationReason.trim()) return
    setTransitioning(true)
    try {
      await api.post(`/checks/${id}/cancel`, { cancellationReason })
      setCancelOpen(false)
      qc.invalidateQueries({ queryKey: ["check-detail", id] })
      qc.invalidateQueries({ queryKey: ["checks"] })
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

  const canStart = ["DRAFT", "SCHEDULED", "ASSIGNED"].includes(check.status) && canExecute
  // PENDING_REVIEW now renders the read-only review surface (standard layout) instead of
  // the editable execution UI, so the approver attests to fixed evidence — they cannot
  // alter responses/notes/photos. Only the engineer's IN_PROGRESS pass is editable.
  const isExecuting = check.status === "IN_PROGRESS"
  // Evidence is frozen once the check is signed off — the check-level attachments panel
  // goes read-only (no Attach file / no delete), mirroring the backend attachment lock.
  // (Per-item photos are already preview-only in the standard-layout checklist below.)
  const attachmentsLocked = ["COMPLETED", "CLOSED"].includes(check.status)

  // Group items by section — already computed above, just re-derive for the check guard
  // (sections/sectionNames are correct since check.items is now available)

  // Section completion stats (optimistic — counts the open card's last-Saved baseline).
  function getSectionStats(items: CheckItem[]) {
    const answered = items.filter(i => respOf(i) !== "").length
    const failed = items.filter(i => respOf(i) === "FAIL").length
    return { answered, failed, total: items.length }
  }

  // ── Shared dialogs (rendered in both layouts) ──────────────────────────
  const dialogs = (
    <>
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{reviewAction === "approve" ? "Approve check" : "Return for rework"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {reviewAction === "return" ? (
              <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "#fef3c7", border: "1px solid #fde68a" }}>
                <Typography variant="caption" color="#92400e">The check will be returned to the engineer for corrections.</Typography>
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
    </>
  )

  // ── Item card (execution surface — inline, immediate) ──────────────────────
  // Pass/Fail/N-A is ALWAYS visible and saves on tap (one action, no open-card step). Notes
  // and photos expand on demand once answered; marking Fail auto-reveals the note composer +
  // a gentle evidence nudge. Every write goes straight through the offline queue (P4a).
  function renderItemCard(item: CheckItem, idx: number) {
    const draft = getDraft(item)
    const response = draft.response
    const isFail = response === "FAIL"
    const isPass = response === "PASS"
    const isNA = response === "NA"
    const isUnansweredRequired = item.isRequired && !response
    const accent = isUnansweredRequired ? "#f59e0b"
      : isPass ? "#15803d" : isFail ? "#b91c1c" : isNA ? "#94a3b8" : "#e2e8f0"
    const noteOpen = openNotes.has(item.id)
    const photoCount = (item.attachments?.length ?? 0) + (sync.photosByItem[item.id]?.length ?? 0)
    const hasNote = draft.notes.trim().length > 0
    const needsEvidence = isFail && !hasNote && photoCount === 0
    const answered = response !== ""
    // The Pass/Fail/N-A buttons are ALWAYS visible (the filled button is the answer state, so
    // re-answering is one tap). Only the secondary note/photo detail tucks away: it's open while
    // unanswered-then-failed or while the engineer is editing. Fail forces it open AND keeps it
    // open (even after "Done") so an undocumented failure keeps its evidence nudge.
    const detailOpen = !!response && (isFail || editingItems.has(item.id))
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
            {/* Label + badges */}
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: "6px", flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "#0f172a", flex: 1, lineHeight: 1.4 }}>
                {item.label}
              </Typography>
              {item.isRequired ? <Chip size="small" label="Required" sx={{ height: 18, fontSize: 10, bgcolor: "#fef3c7", color: "#92400e" }} /> : null}
              {item.isCritical ? <Chip size="small" label="Critical" sx={{ height: 18, fontSize: 10, bgcolor: "#fee2e2", color: "#b91c1c" }} /> : null}
              {item.isAdHoc ? <Chip size="small" label="Ad hoc" sx={{ height: 18, fontSize: 10, bgcolor: "#f0f9ff", color: "#0369a1" }} /> : null}
            </Stack>

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

            {/* Secondary detail — the evidence strip when open (Fail auto-opens it), else a compact
                tucked row for answered Pass/N-A. Unanswered shows nothing but the buttons. */}
            {detailOpen ? (
              <Box sx={{ borderTop: "1px dashed #e2e8f0", pt: "10px", mt: "12px" }}>
                {/* Fail nudge — gentle, not a hard block; clears once a note or photo exists */}
                {needsEvidence ? (
                  <Box sx={{ mb: "10px", px: "10px", py: "7px", bgcolor: "#fffbeb", border: "1px solid #fde68a", borderRadius: "6px" }}>
                    <Typography sx={{ fontSize: 11.5, color: "#92400e" }}>Add a note or photo for this failure.</Typography>
                  </Box>
                ) : null}

                {/* Existing note — click to edit */}
                {draft.notes && !noteOpen ? (
                  <Box onClick={canExecute ? () => openNote(item.id) : undefined}
                    sx={{ mb: "10px", cursor: canExecute ? "text" : "default", bgcolor: "#f8fafc", borderRadius: "6px", px: "10px", py: "7px", border: "1px solid #e2e8f0", "&:hover": canExecute ? { borderColor: "#cbd5e1" } : {} }}>
                    <Typography sx={{ fontSize: 12, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{draft.notes}</Typography>
                  </Box>
                ) : null}

                {/* Note composer (comment-box styling) — saves on blur */}
                {noteOpen ? (
                  <Box sx={{ mb: "10px" }}>
                    <Box sx={{
                      borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "#fff",
                      px: 1.25, py: 0.5, transition: "border-color 120ms ease",
                      "&:focus-within": { borderColor: "primary.main" },
                    }}>
                      <TextField
                        variant="standard" fullWidth multiline minRows={2} autoFocus={!draft.notes}
                        placeholder={isFail ? "Describe the issue…" : "Add a note…"}
                        value={draft.notes}
                        onChange={e => setNote(item, e.target.value)}
                        onBlur={() => handleNotesBlur(item)}
                        InputProps={{ disableUnderline: true }}
                        sx={{ "& .MuiInputBase-input": { fontSize: { xs: 16, md: 13 }, lineHeight: 1.5 } }}
                      />
                    </Box>
                    <Stack direction="row" justifyContent="flex-end" sx={{ mt: "6px" }}>
                      <Button size="small" variant="text" onClick={() => { void handleNotesBlur(item); closeNote(item.id) }} sx={{ fontSize: 11, color: "#64748b" }}>
                        Done
                      </Button>
                    </Stack>
                  </Box>
                ) : null}

                {/* Photos + on-demand controls — capture saves immediately */}
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
                  <input
                    type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }}
                    ref={el => { photoInputRefs.current[item.id] = el }}
                    onChange={e => { void handlePhotoSelect(item.id, e.target.files); e.target.value = "" }}
                  />

                  {/* Persisted (uploaded) evidence — caption editable until lock */}
                  {(item.attachments ?? []).map((att) => (
                    <Box key={att.id} sx={{ display: "flex", flexDirection: "column", gap: "4px", width: 116 }}>
                      <Tooltip title={att.filename}>
                        <Box sx={{ position: "relative", width: 48, height: 48 }}>
                          <Box onClick={() => setPreviewAtt(att)} sx={{
                            width: 48, height: 48, borderRadius: "4px", border: "1px solid #e2e8f0",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            bgcolor: "#f8fafc", cursor: "pointer", "&:hover": { borderColor: "#cbd5e1" },
                          }}>
                            {isImageType(att.contentType)
                              ? <ImageIcon sx={{ fontSize: 20, color: "#64748b" }} />
                              : <DescriptionIcon sx={{ fontSize: 20, color: "#64748b" }} />}
                          </Box>
                          {canExecute ? (
                            <Box onClick={() => removePhoto(att)} sx={{
                              position: "absolute", top: -4, right: -4,
                              width: { xs: 18, md: 14 }, height: { xs: 18, md: 14 }, borderRadius: "50%",
                              bgcolor: "#475569", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: { xs: 11, md: 9 }, cursor: "pointer", fontWeight: 700, "&:hover": { bgcolor: "#0f172a" },
                            }}>×</Box>
                          ) : null}
                          {/* Attached confirmation — uploaded evidence (vs the pending clock badge) */}
                          <CheckCircleIcon sx={{ position: "absolute", bottom: -4, right: -4, fontSize: 15, color: "#15803d", bgcolor: "#fff", borderRadius: "50%" }} />
                        </Box>
                      </Tooltip>
                      <TextField
                        variant="standard" placeholder="Caption — optional"
                        value={captionValue(att.id, att.caption ?? "")}
                        onChange={e => setCaptionDrafts(prev => ({ ...prev, [att.id]: e.target.value }))}
                        onBlur={() => commitAttCaption(att)}
                        inputProps={{ maxLength: 280 }}
                        sx={{ "& .MuiInput-input": { fontSize: { xs: 16, md: 11 }, py: "1px", color: "#0f172a" } }}
                      />
                    </Box>
                  ))}

                  {/* Queued (offline) captures — caption rides the upload */}
                  {(sync.photosByItem[item.id] ?? []).map((p) => (
                    <Box key={p.seq} sx={{ display: "flex", flexDirection: "column", gap: "4px", width: 116 }}>
                      <Tooltip title={`${p.filename} — saved on this device, will upload when online`}>
                        <Box sx={{ position: "relative", width: 48, height: 48, borderRadius: "4px", overflow: "hidden", border: "1px dashed #cbd5e1", opacity: 0.85 }}>
                          <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          <Box sx={{ position: "absolute", bottom: 0, right: 0, bgcolor: "rgba(15,23,42,0.65)", color: "#fff", px: "2px", py: "1px", display: "flex", alignItems: "center" }}>
                            <ScheduleIcon sx={{ fontSize: 10 }} />
                          </Box>
                        </Box>
                      </Tooltip>
                      <TextField
                        variant="standard" placeholder="Caption — optional"
                        value={captionValue(`pending:${p.seq}`, p.caption ?? "")}
                        onChange={e => setCaptionDrafts(prev => ({ ...prev, [`pending:${p.seq}`]: e.target.value }))}
                        onBlur={() => commitPendingCaption(p.seq, p.caption ?? "")}
                        inputProps={{ maxLength: 280 }}
                        sx={{ "& .MuiInput-input": { fontSize: { xs: 16, md: 11 }, py: "1px", color: "#0f172a" } }}
                      />
                    </Box>
                  ))}

                  {/* Add photo (opens camera/picker) */}
                  {canExecute ? (
                    <Box onClick={() => photoInputRefs.current[item.id]?.click()} sx={{
                      display: "flex", alignItems: "center", gap: "5px",
                      px: "10px", py: { xs: "9px", md: "5px" }, borderRadius: "5px",
                      border: "1px solid #e2e8f0", color: "#64748b",
                      fontSize: { xs: 13, md: 11.5 }, cursor: "pointer", fontWeight: 500, transition: "all 0.1s",
                      "&:hover": { bgcolor: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" },
                    }}>
                      <CameraAltIcon sx={{ fontSize: { xs: 15, md: 13 } }} />
                      {photoCount > 0 ? "Add more" : "Add photo"}
                    </Box>
                  ) : null}

                  {/* Add note (reveals composer) — only when there's no note yet */}
                  {canExecute && !draft.notes && !noteOpen ? (
                    <Box onClick={() => openNote(item.id)} sx={{
                      display: "flex", alignItems: "center", gap: "5px",
                      px: "10px", py: { xs: "9px", md: "5px" }, borderRadius: "5px",
                      border: "1px solid #e2e8f0", color: "#64748b",
                      fontSize: { xs: 13, md: 11.5 }, cursor: "pointer", fontWeight: 500, transition: "all 0.1s",
                      "&:hover": { bgcolor: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" },
                    }}>
                      <AddIcon sx={{ fontSize: { xs: 15, md: 13 } }} />
                      Add note{isFail ? " (recommended)" : ""}
                    </Box>
                  ) : null}
                </Box>

                {/* Done — collapse this answered item back to its pill */}
                {canExecute ? (
                  <Stack direction="row" justifyContent="flex-end" sx={{ mt: "10px" }}>
                    <Button size="small" onClick={() => { void handleNotesBlur(item); closeNote(item.id); stopEdit(item.id) }}
                      sx={{ fontSize: 11.5, color: "#1d4ed8", fontWeight: 600 }}>
                      Done
                    </Button>
                  </Stack>
                ) : null}
              </Box>
            ) : answered ? (
              /* Answered Pass/N-A — the buttons stay above; only the detail tucks to this compact
                 row (evidence indicators + a quiet affordance to re-open/add note or photo) */
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: "10px", flexWrap: "wrap", rowGap: "6px" }}>
                {hasNote ? (
                  <Tooltip title="Has a note"><NotesIcon sx={{ fontSize: 15, color: "#94a3b8" }} /></Tooltip>
                ) : null}
                {photoCount > 0 ? (
                  <Stack direction="row" alignItems="center" spacing={0.3}>
                    <CameraAltIcon sx={{ fontSize: 15, color: "#94a3b8" }} />
                    <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>{photoCount}</Typography>
                  </Stack>
                ) : null}
                {item.followOns.length > 0 ? (
                  <Chip size="small" label={`${item.followOns.length} follow-on${item.followOns.length === 1 ? "" : "s"}`}
                    sx={{ height: 18, fontSize: 10, bgcolor: "#e0f2fe", color: "#0369a1" }} />
                ) : null}
                <Box sx={{ flex: 1 }} />
                {canExecute ? (
                  <Button size="small" startIcon={<EditOutlinedIcon sx={{ fontSize: 14 }} />} onClick={() => startEdit(item.id)}
                    sx={{ fontSize: 11.5, color: "#64748b" }}>
                    {hasNote || photoCount > 0 ? "Edit evidence" : "Add note or photo"}
                  </Button>
                ) : null}
              </Stack>
            ) : null}

            {/* Follow-on prompt for failed items (detail open — always true for a Fail) */}
            {isFail && canExecute && detailOpen ? (
              <Box sx={{ mt: "12px", p: "10px 12px", bgcolor: "#fef9e7", border: "1px solid #fcd34d", borderRadius: "6px" }}>
                {item.followOns.length > 0 ? (
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    {item.followOns.map(fo => (
                      <Chip key={fo.id} size="small" label={fo.entityType} sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10 }} />
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
      check.assignee ? { label: "Engineer", value: check.assignee.displayName } : null,
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
    // screen (no jump-back). Required-but-unanswered (hard-blocks submit) + failed-without-evidence
    // (the soft nudge). Computed from optimistic state (respOf/drafts/photosByItem) so an item
    // drops out of the zone the instant it's resolved, before the queue drains.
    const needsAttention = check.items.filter(i => {
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
                {check.site.name} · {check.assignee?.displayName ?? "Unassigned"}
              </Typography>
              {check.scopeNotes ? (
                <Typography sx={{ fontSize: 12.5, color: "#94a3b8", mt: "2px" }}>{check.scopeNotes}</Typography>
              ) : null}
            </Box>
            {/* Status indicator cluster + primary action (md+) */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0, pt: "2px" }}>
              <SyncStatusPill status={sync.status} pendingCount={sync.pendingCount} />
              {canExecute && !reviewMode ? (
                <Button variant="contained" size="small" disableElevation
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />}
                  onClick={() => setReviewMode(true)}
                  sx={{ display: { xs: "none", md: "inline-flex" }, fontSize: 12, py: "7px" }}>
                  Review &amp; submit
                </Button>
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
                  const complete = stats.total > 0 && stats.answered === stats.total
                  const collapsed = showSticky && complete && !expandedComplete.has(sectionName)
                  const toggle = () => setExpandedComplete(prev => {
                    const n = new Set(prev)
                    if (n.has(sectionName)) n.delete(sectionName); else n.add(sectionName)
                    return n
                  })
                  return (
                    <Box key={sectionName} ref={(el: HTMLDivElement | null) => { sectionRefs.current[sectionName] = el }}
                      sx={{ mb: "8px", scrollMarginTop: { xs: "120px", md: "16px" } }}>
                      {/* Section header — slim Complete bar when done, else label (+ collapse toggle) */}
                      {showSticky ? (
                        collapsed ? (
                          <Box onClick={toggle} sx={{
                            display: "flex", alignItems: "center", gap: 1, cursor: "pointer",
                            px: "12px", py: "9px", mb: "8px", borderRadius: "8px",
                            bgcolor: stats.failed > 0 ? "#fff5f5" : "#f0fdf4",
                            border: `1px solid ${stats.failed > 0 ? "#fecaca" : "#bbf7d0"}`,
                            "&:hover": { borderColor: stats.failed > 0 ? "#fca5a5" : "#86efac" },
                          }}>
                            <CheckCircleIcon sx={{ fontSize: 15, color: stats.failed > 0 ? "#b91c1c" : "#15803d" }} />
                            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: "#0f172a", flex: 1, minWidth: 0 }}>
                              {sectionName}
                            </Typography>
                            <Typography sx={{ fontSize: 11.5, color: stats.failed > 0 ? "#b91c1c" : "#15803d", fontWeight: 500 }}>
                              {stats.failed > 0 ? `Complete · ${stats.failed} fail` : "Complete"} · {stats.answered}/{stats.total}
                            </Typography>
                            <ExpandMoreIcon sx={{ fontSize: 18, color: "#94a3b8" }} />
                          </Box>
                        ) : (
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: "4px", py: "6px", mb: "8px" }}>
                            <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", flex: 1 }}>
                              {sectionName} · {stats.answered}/{stats.total}{stats.failed > 0 ? ` · ${stats.failed} fail` : ""}
                            </Typography>
                            {complete ? (
                              <Button size="small" onClick={toggle} sx={{ fontSize: 11, color: "#64748b", minWidth: 0, py: 0 }}>Collapse</Button>
                            ) : null}
                          </Stack>
                        )
                      ) : null}
                      {!collapsed ? (
                        <Box sx={{ mb: "12px" }}>
                          {items.map((item, idx) => renderItemCard(item, idx))}
                        </Box>
                      ) : null}
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
        <AttachmentPreviewModal open={!!previewAtt} attachment={previewAtt} onClose={() => setPreviewAtt(null)} />
        <PhotoCaptureDialog
          open={!!photoPreview}
          url={photoPreview?.url ?? null}
          caption={photoPreview?.caption ?? ""}
          onCaptionChange={(value) => setPhotoPreview(prev => (prev ? { ...prev, caption: value } : prev))}
          onRetake={retakePreviewPhoto}
          onDiscard={advancePhotoPreview}
          onAttach={attachPreviewPhoto}
          attaching={photoAttaching}
          recommended={(() => {
            const it = photoPreview ? check.items.find(i => i.id === photoPreview.itemId) : null
            return it ? respOf(it) === "FAIL" : false
          })()}
        />
      </Box>
    )
  }

  const propertiesRows: { label: string; value: React.ReactNode }[] = [
    { label: "Reference", value: <Typography variant="caption" sx={{ fontFamily: "monospace", fontWeight: 600 }}>{check.reference}</Typography> },
    { label: "Status", value: <StatusPill value={check.status} label={STATUS_LABELS[check.status]} size="sm" /> },
    { label: "Site", value: <Typography variant="caption" fontWeight={600}>{check.site.name}</Typography> },
    { label: "Template", value: <Typography variant="caption">{check.template.name}</Typography> },
    { label: "Assignee", value: <Typography variant="caption">{check.assignee?.displayName ?? "Unassigned"}</Typography> },
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
      { label: "Scheduled", value: formatScheduledShort(check.scheduledAt) },
      ...(est ? [{ label: "Est. time", value: est }] : []),
    ]
    return (
      <Box sx={{ maxWidth: 720, mx: "auto", pb: "24px" }}>
        {/* Header — title + site/assignee + status chip + Start (ref lives in the breadcrumb) */}
        <Stack direction="row" alignItems="flex-start" spacing={2} sx={{ mb: "22px" }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: { xs: 20, md: 24 }, fontWeight: 700, color: "#0f172a", lineHeight: 1.25 }}>
              {check.title}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: "8px", flexWrap: "wrap", rowGap: "6px" }}>
              <StatusPill value={check.status} label={STATUS_LABELS[check.status] ?? check.status} size="sm" />
              <Typography sx={{ fontSize: 13.5, color: "#64748b" }}>
                {check.site.name} · {check.assignee?.displayName ?? "Unassigned"}
              </Typography>
            </Stack>
          </Box>
          <Button variant="contained" disableElevation size="small" onClick={handleStart} disabled={transitioning}
            sx={{ flexShrink: 0, fontSize: 13, py: "9px", px: "18px" }}>
            {transitioning ? "Starting…" : "Start check"}
          </Button>
        </Stack>

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

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

  // ── STANDARD LAYOUT (all other statuses) ──────────────────────────────
  return (
    <Box>
      {/* Record header — title + Start only. The ref lives in the breadcrumb and the
          Details panel; Site/Template are Details rows (no duplicated subtitle here). */}
      <Box sx={{ mb: "16px" }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
            <Typography variant="h5" fontWeight={700} sx={{ color: "#0f172a", lineHeight: 1.25 }}>
              {check.title}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
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
                  {sectionNames.map(sectionName => (
                    <Box key={sectionName}>
                      {sectionNames.length > 1 ? (
                        <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#94a3b8", mb: 1, mt: 0.5 }}>
                          {sectionName.toUpperCase()} — {sections[sectionName].filter(i => i.response).length}/{sections[sectionName].length}
                        </Typography>
                      ) : null}
                      <Stack spacing={0.75}>
                        {sections[sectionName].map((item, idx) => (
                          <Box key={item.id} sx={{
                            p: "12px 14px", borderRadius: 1.5, border: "1px solid",
                            borderColor: item.response === "PASS" ? "#d1fae5" : item.response === "FAIL" ? "#fecaca" : "#e2e8f0",
                            bgcolor: item.response === "PASS" ? "#f0fdf4" : item.response === "FAIL" ? "#fff5f5" : "#ffffff"
                          }}>
                            <Stack direction="row" spacing={1.5} alignItems="flex-start">
                              <Typography sx={{ fontSize: 11, fontWeight: 500, color: "#94a3b8", mt: "2px", flexShrink: 0, minWidth: 22, fontFamily: "monospace" }}>
                                {String(idx + 1).padStart(2, "0")}
                              </Typography>
                              <Box sx={{ flex: 1 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>{item.label}</Typography>
                                  <StatusPill
                                    intent={resultIntent(item.response)}
                                    label={item.response ?? "Pending"}
                                    size="sm"
                                  />
                                </Stack>
                                {item.notes ? (
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: "4px", display: "block" }}>{item.notes}</Typography>
                                ) : null}
                                {item.followOns.length > 0 ? (
                                  <Stack direction="row" spacing={0.5} sx={{ mt: "6px" }}>
                                    {item.followOns.map(fo => (
                                      <Chip key={fo.id} size="small" label={fo.entityType} sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10, height: 18 }} />
                                    ))}
                                  </Stack>
                                ) : null}
                                {/* Per-item field-evidence — read-only captioned cards; click the
                                    thumbnail to preview the auth'd blob via the shared modal. The
                                    caption (when set) labels the evidence; otherwise fall back to
                                    filename + capture date. No editing here (the execution UI owns it).
                                    Without this the captured evidence is invisible once a check leaves
                                    the execution screen. */}
                                {(item.attachments ?? []).length > 0 ? (
                                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: "10px", flexWrap: "wrap", mt: "8px" }}>
                                    {(item.attachments ?? []).map((att) => (
                                      <Box key={att.id} sx={{ display: "flex", flexDirection: "column", gap: "4px", width: 116 }}>
                                        <Tooltip title={att.filename}>
                                          <Box onClick={() => setPreviewAtt(att)} sx={{
                                            width: 48, height: 48, borderRadius: "4px", border: "1px solid #e2e8f0",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            bgcolor: "#f8fafc", cursor: "pointer",
                                            "&:hover": { borderColor: "#cbd5e1" }
                                          }}>
                                            {isImageType(att.contentType)
                                              ? <ImageIcon sx={{ fontSize: 20, color: "#64748b" }} />
                                              : <DescriptionIcon sx={{ fontSize: 20, color: "#64748b" }} />}
                                          </Box>
                                        </Tooltip>
                                        {att.caption ? (
                                          <Typography sx={{ fontSize: 11, color: "#334155", lineHeight: 1.3, wordBreak: "break-word" }}>
                                            {att.caption}
                                          </Typography>
                                        ) : (
                                          <Typography sx={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.3, wordBreak: "break-word" }}>
                                            {att.filename} · {new Date(att.uploadedAt).toLocaleDateString("en-GB")}
                                          </Typography>
                                        )}
                                      </Box>
                                    ))}
                                  </Box>
                                ) : null}
                              </Box>
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  ))}
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
                              <Chip key={fo.id} size="small" label={fo.entityType} sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10 }} />
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
          {check.status === "PENDING_REVIEW" ? (
            <Card>
              <CardContent>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: "#94a3b8", mb: 1.5 }}>REVIEW</Typography>
                <Stack spacing={1}>
                  <Button fullWidth variant="contained" size="small"
                    onClick={() => { setReviewAction("approve"); setReviewOpen(true) }}
                    sx={{ fontSize: 12, py: "10px" }}>
                    Approve check
                  </Button>
                  <Button fullWidth variant="outlined" size="small" color="warning"
                    onClick={() => { setReviewAction("return"); setReviewOpen(true) }}
                    sx={{ fontSize: 12 }}>
                    Return for rework
                  </Button>
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
                readOnly={attachmentsLocked}
                onChanged={() => qc.invalidateQueries({ queryKey: ["check-detail", id] })}
              />
            </RightPanelSection>
          </Card>
        </Stack>
      </Box>

      {/* Mobile sticky review bar — keeps Approve/Return reachable on phones without
          scrolling past the full checklist (the right-rail Review card sits below the
          checklist on xs). Mirrors the execution layout's sticky action bar. */}
      {check.status === "PENDING_REVIEW" ? (
        <Box sx={{
          display: { xs: "flex", md: "none" },
          position: "sticky", bottom: 0, zIndex: 2,
          bgcolor: "#ffffff", borderTop: "1px solid #e2e8f0",
          mx: "-12px", mt: 2, px: "12px", py: "12px",
          boxShadow: "0 -2px 8px rgba(15,23,42,0.06)",
        }}>
          <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
            <Button fullWidth variant="outlined" color="warning"
              onClick={() => { setReviewAction("return"); setReviewOpen(true) }}
              sx={{ py: "11px", fontSize: 14 }}>
              Return
            </Button>
            <Button fullWidth variant="contained"
              onClick={() => { setReviewAction("approve"); setReviewOpen(true) }}
              sx={{ py: "11px", fontSize: 14 }}>
              Approve
            </Button>
          </Stack>
        </Box>
      ) : null}

      {dialogs}
      <AttachmentPreviewModal open={!!previewAtt} attachment={previewAtt} onClose={() => setPreviewAtt(null)} />
    </Box>
  )
}