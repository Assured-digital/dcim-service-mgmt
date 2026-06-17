import React from "react"
import { useParams } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack,
  Tab, Tabs, TextField, Tooltip, Typography
} from "@mui/material"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import AddIcon from "@mui/icons-material/Add"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import CameraAltIcon from "@mui/icons-material/CameraAlt"
import AttachFileIcon from "@mui/icons-material/AttachFile"
import ImageIcon from "@mui/icons-material/Image"
import DescriptionIcon from "@mui/icons-material/Description"
import CloudOffIcon from "@mui/icons-material/CloudOff"
import ScheduleIcon from "@mui/icons-material/Schedule"
import DownloadIcon from "@mui/icons-material/Download"
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
  const [copied, setCopied] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState(0) // for standard layout

  const [drafts, setDrafts] = React.useState<Record<string, { response: string; notes: string; notesOpen?: boolean }>>({})
  // Per-item field-evidence photos persist to object storage as `check-item`
  // attachments; offline captures queue locally (see useCheckExecutionSync) and show
  // as pending thumbnails until they upload.
  const [previewAtt, setPreviewAtt] = React.useState<AttachmentSummary | null>(null)
  // Local caption edits keyed by a stable id: an attachment id for persisted photos,
  // `pending:<seq>` for not-yet-uploaded captures. Held until committed (on blur) so
  // typing doesn't fire a write per keystroke. Falls back to the server/queued value.
  const [captionDrafts, setCaptionDrafts] = React.useState<Record<string, string>>({})
  const photoInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({})
  const [followOnItem, setFollowOnItem] = React.useState<CheckItem | null>(null)
  const [submitOpen, setSubmitOpen] = React.useState(false)
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

  // Light guard: warn before unloading only if offline with un-synced work (online work
  // is durable in IDB and replays on next load, so no warning needed there).
  React.useEffect(() => {
    if (online || sync.pendingCount === 0) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [online, sync.pendingCount])

  function getDraft(item: CheckItem) {
    return {
      response: drafts[item.id]?.response ?? item.response ?? "",
      notes: drafts[item.id]?.notes ?? item.notes ?? "",
      notesOpen: drafts[item.id]?.notesOpen ?? false
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Writes are optimistic + durable: persisted to IndexedDB and queued for replay
  // (survive disconnect/refresh), then synced immediately when online. The refetch
  // happens once the queue drains (the pendingCount effect above), not inline here.
  async function handleResponseClick(item: CheckItem, response: string) {
    const currentNotes = getDraft(item).notes
    const currentNotesOpen = getDraft(item).notesOpen
    setDrafts(prev => ({ ...prev, [item.id]: { response, notes: currentNotes, notesOpen: currentNotesOpen } }))
    await sync.saveItemAnswer(item.id, { response, notes: currentNotes || undefined })
  }

  async function handleNotesBlur(item: CheckItem, notes: string) {
    const currentResponse = getDraft(item).response
    if (!currentResponse && !notes.trim()) return
    await sync.saveItemAnswer(item.id, {
      response: currentResponse || undefined,
      notes: notes || undefined,
    })
  }

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
      setSubmitOpen(false)
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

  // Queue each selected photo durably (IndexedDB) and upload when online — a capture is
  // never lost if signal drops mid-visit. Queued photos show as pending thumbnails and
  // appear as `check-item` attachments once their upload drains.
  async function handlePhotoSelect(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    for (const file of Array.from(files)) {
      await sync.queuePhoto(itemId, file)
    }
  }

  async function removePhoto(att: AttachmentSummary) {
    try {
      await deleteAttachment(att.id)
      await qc.invalidateQueries({ queryKey: ["check-detail", id] })
    } catch (e: unknown) {
      setError(getApiErrorMessage(e, "Failed to remove photo"))
    }
  }

  // Caption value to show: the in-flight draft if the user has touched this input, else
  // the server (persisted) / queued (pending) value.
  function captionValue(key: string, fallback: string): string {
    return key in captionDrafts ? captionDrafts[key] : fallback
  }

  // Commit a caption on blur. Persisted attachment → queued caption-edit (PATCH on drain,
  // offline-safe); pending capture → caption stored on the queued photo (rides the upload).
  // Both no-op when unchanged. The drain's pendingCount→0 effect refetches persisted edits.
  async function commitAttCaption(att: AttachmentSummary) {
    const key = att.id
    if (!(key in captionDrafts)) return
    const next = captionDrafts[key]
    if ((att.caption ?? "") !== next) await sync.queueCaptionEdit(att.id, next)
  }
  async function commitPendingCaption(seq: number, current: string) {
    const key = `pending:${seq}`
    if (!(key in captionDrafts)) return
    const next = captionDrafts[key]
    if ((current ?? "") !== next) await sync.setPendingPhotoCaption(seq, next)
  }

  // Compute sections early so hooks can reference sectionNames safely
  const sections: Record<string, CheckItem[]> = {}
  ;(check?.items ?? []).forEach(item => {
    const key = item.section ?? "General"
    if (!sections[key]) sections[key] = []
    sections[key].push(item)
  })
  const sectionNames = Object.keys(sections)

  function scrollToSection(sectionName: string) {
    setActiveSection(sectionName)
    const el = sectionRefs.current[sectionName]
    const container = itemsColumnRef.current
    if (el && container) {
      // Suppress the scroll listener while we're doing programmatic scrolling
      isScrollingRef.current = true
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const targetScrollTop = container.scrollTop + (elRect.top - containerRect.top) - 16
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: "smooth" })

      // Re-enable listener after smooth scroll finishes (~600ms is enough for any section)
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false
      }, 700)
    }
  }

  // Track active section as user manually scrolls — throttled with rAF
  React.useEffect(() => {
    const container = itemsColumnRef.current
    if (!container || sectionNames.length <= 1) return
    let rafId: number | null = null

    function onScroll() {
      if (isScrollingRef.current) return // skip during programmatic scroll
      if (rafId !== null) return         // already queued
      rafId = requestAnimationFrame(() => {
        rafId = null
        const containerRect = container!.getBoundingClientRect()
        let current = sectionNames[0]
        for (const name of sectionNames) {
          const el = sectionRefs.current[name]
          if (el) {
            const elRect = el.getBoundingClientRect()
            if (elRect.top - containerRect.top <= 32) current = name
          }
        }
        setActiveSection(prev => prev === current ? prev : current)
      })
    }

    container.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      container.removeEventListener("scroll", onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [sectionNames.join(",")]) // eslint-disable-line

  function copyRef() {
    if (!check) return
    navigator.clipboard.writeText(check.reference)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  if (isLoading) return <LoadingState />
  if (!check) return <ErrorState title="Check not found" />

  const totalItems = check.items.length
  const answeredItems = check.items.filter(i => i.response !== null).length
  const passItems = check.items.filter(i => i.response === "PASS").length
  const failItems = check.items.filter(i => i.response === "FAIL").length
  const naItems = check.items.filter(i => i.response === "NA").length
  const pendingItems = check.items.filter(i => !i.response).length
  const failedItems = check.items.filter(i => i.response === "FAIL")
  const allRequiredAnswered = check.items.filter(i => i.isRequired).every(i => i.response !== null)

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

  // Section completion stats
  function getSectionStats(items: CheckItem[]) {
    const answered = items.filter(i => {
      const draft = drafts[i.id]
      return draft ? !!draft.response : !!i.response
    }).length
    const failed = items.filter(i => {
      const draft = drafts[i.id]
      return (draft ? draft.response : i.response) === "FAIL"
    }).length
    return { answered, failed, total: items.length }
  }

  // ── Shared dialogs (rendered in both layouts) ──────────────────────────
  const dialogs = (
    <>
      <Dialog open={submitOpen} onClose={() => setSubmitOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Submit check for review</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Once submitted the check will be reviewed by a service manager before being marked complete.
            </Typography>
            <TextField label="Engineer summary (optional)" multiline rows={3} fullWidth
              value={engineerSummary} onChange={e => setEngineerSummary(e.target.value)}
              placeholder="Overall observations from the visit..." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmitOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={transitioning}>
            {transitioning ? "Submitting..." : "Submit for review"}
          </Button>
        </DialogActions>
      </Dialog>

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

  // ── Item card (execution mode) ─────────────────────────────────────────
  function renderItemCard(item: CheckItem, idx: number) {
    const draft = getDraft(item)
    const isFail = draft.response === "FAIL"
    const isPass = draft.response === "PASS"
    const isNA = draft.response === "NA"
    const isUnansweredRequired = item.isRequired && !draft.response

    return (
      <Box key={item.id} sx={{
        bgcolor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderLeft: isUnansweredRequired
          ? "3px solid #f59e0b"
          : isPass ? "3px solid #15803d"
          : isFail ? "3px solid #b91c1c"
          : "1px solid #e2e8f0",
        borderRadius: "8px", p: "14px 16px", mb: "8px",
        transition: "border-color 0.15s"
      }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {/* Item number */}
          <Typography sx={{ fontSize: 11, fontWeight: 500, color: "#94a3b8", mt: "3px", flexShrink: 0, minWidth: 22, fontFamily: "monospace" }}>
            {String(idx + 1).padStart(2, "0")}
          </Typography>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {/* Label + badges */}
            <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: "6px", flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: "#0f172a", flex: 1, lineHeight: 1.4 }}>
                {item.label}
              </Typography>
              {item.isRequired ? (
                <Chip size="small" label="Required" sx={{ height: 18, fontSize: 10, bgcolor: "#fef3c7", color: "#92400e", flexShrink: 0 }} />
              ) : null}
              {item.isCritical ? (
                <Chip size="small" label="Critical" sx={{ height: 18, fontSize: 10, bgcolor: "#fee2e2", color: "#b91c1c", flexShrink: 0 }} />
              ) : null}
              {item.isAdHoc ? (
                <Chip size="small" label="Ad hoc" sx={{ height: 18, fontSize: 10, bgcolor: "#f0f9ff", color: "#0369a1", flexShrink: 0 }} />
              ) : null}
            </Stack>

            {/* Guidance */}
            {item.guidance ? (
              <Typography sx={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, mb: "10px" }}>
                {item.guidance}
              </Typography>
            ) : null}

            {/* Response buttons */}
            <Stack direction="row" spacing={0.75} sx={{ mb: (isFail || draft.notes !== undefined) ? "12px" : 0 }}>
              <Button size="small"
                onClick={() => handleResponseClick(item, "PASS")}
                sx={{
                  flex: { xs: 1, md: "0 1 auto" },
                  minWidth: { xs: 0, md: 72 },
                  fontSize: { xs: 14, md: 12 }, fontWeight: 600, borderRadius: "6px",
                  border: "1.5px solid", py: { xs: "11px", md: "7px" },
                  borderColor: isPass ? "#15803d" : "#e2e8f0",
                  bgcolor: isPass ? "#dcfce7" : "#ffffff",
                  color: isPass ? "#15803d" : "#64748b",
                  "&:hover": { bgcolor: isPass ? "#d1fae5" : "#f8fafc", borderColor: "#15803d", color: "#15803d" }
                }}>
                ✓ Pass
              </Button>
              <Button size="small"
                onClick={() => handleResponseClick(item, "FAIL")}
                sx={{
                  flex: { xs: 1, md: "0 1 auto" },
                  minWidth: { xs: 0, md: 72 },
                  fontSize: { xs: 14, md: 12 }, fontWeight: 600, borderRadius: "6px",
                  border: "1.5px solid", py: { xs: "11px", md: "7px" },
                  borderColor: isFail ? "#b91c1c" : "#e2e8f0",
                  bgcolor: isFail ? "#fee2e2" : "#ffffff",
                  color: isFail ? "#b91c1c" : "#64748b",
                  "&:hover": { bgcolor: isFail ? "#fecaca" : "#f8fafc", borderColor: "#b91c1c", color: "#b91c1c" }
                }}>
                ✕ Fail
              </Button>
              {item.responseType !== "PASS_FAIL" ? (
                <Button size="small"
                  onClick={() => handleResponseClick(item, "NA")}
                  sx={{
                    flex: { xs: 1, md: "0 1 auto" },
                    minWidth: { xs: 0, md: 72 },
                    fontSize: { xs: 14, md: 12 }, fontWeight: 600, borderRadius: "6px",
                    border: "1.5px solid", py: { xs: "11px", md: "7px" },
                    borderColor: isNA ? "#64748b" : "#e2e8f0",
                    bgcolor: isNA ? "#f1f5f9" : "#ffffff",
                    color: isNA ? "#475569" : "#64748b",
                    "&:hover": { bgcolor: "#f1f5f9", borderColor: "#64748b", color: "#475569" }
                  }}>
                  N/A
                </Button>
              ) : null}
            </Stack>

            {/* Notes + Photo row — appears once item is answered */}
            {draft.response ? (
              <Box sx={{ borderTop: "1px dashed #e2e8f0", pt: "10px", mt: "2px" }}>

                {/* Existing note display — click to edit */}
                {draft.notes && !drafts[item.id]?.notesOpen ? (
                  <Box
                    onClick={() => setDrafts(prev => ({ ...prev, [item.id]: { ...getDraft(item), notesOpen: true } }))}
                    sx={{ mb: "10px", cursor: "text", bgcolor: "#f8fafc", borderRadius: "6px", px: "10px", py: "7px", border: "1px solid #e2e8f0", "&:hover": { borderColor: "#cbd5e1" } }}
                  >
                    <Typography sx={{ fontSize: 12, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                      {draft.notes}
                    </Typography>
                  </Box>
                ) : null}

                {/* Note input when expanded */}
                {drafts[item.id]?.notesOpen ? (
                  <Box sx={{ mb: "10px" }}>
                    <TextField
                      size="small" fullWidth multiline rows={2} autoFocus
                      placeholder={isFail ? "Describe the issue..." : "Add a note..."}
                      value={draft.notes}
                      onChange={e => setDrafts(prev => ({ ...prev, [item.id]: { ...getDraft(item), notes: e.target.value } }))}
                      onBlur={e => handleNotesBlur(item, e.target.value)}
                      sx={{ "& .MuiInputBase-root": { fontSize: { xs: 16, md: 12 }, bgcolor: "#ffffff" } }}
                    />
                    <Stack direction="row" justifyContent="flex-end" sx={{ mt: "6px" }}>
                      <Button size="small" variant="text"
                        onClick={() => setDrafts(prev => ({ ...prev, [item.id]: { ...getDraft(item), notesOpen: false } }))}
                        sx={{ fontSize: 11, color: "#64748b" }}>
                        Done
                      </Button>
                    </Stack>
                  </Box>
                ) : null}

                {/* Action row: captioned photo cells + Add photo + Add note — same style.
                    flex-start so the ghost buttons align to the thumbnails, not the taller
                    captioned cells. */}
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
                  {/* Hidden file input — `capture` opens the camera on mobile, the file
                      picker on desktop. Value reset so re-selecting the same file fires. */}
                  <input
                    type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }}
                    ref={el => { photoInputRefs.current[item.id] = el }}
                    onChange={e => { handlePhotoSelect(item.id, e.target.files); e.target.value = "" }}
                  />
                  {/* Persisted evidence cells — thumbnail (click to preview, × to delete) +
                      optional caption input beneath. Caption editable while IN_PROGRESS. */}
                  {(item.attachments ?? []).map((att) => (
                    <Box key={att.id} sx={{ display: "flex", flexDirection: "column", gap: "4px", width: 116 }}>
                      <Tooltip title={att.filename}>
                        <Box sx={{ position: "relative", width: 48, height: 48 }}>
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
                          <Box onClick={() => removePhoto(att)} sx={{
                            position: "absolute", top: -4, right: -4,
                            width: { xs: 18, md: 14 }, height: { xs: 18, md: 14 }, borderRadius: "50%",
                            bgcolor: "#475569", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: { xs: 11, md: 9 }, cursor: "pointer", fontWeight: 700,
                            "&:hover": { bgcolor: "#0f172a" }
                          }}>×</Box>
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

                  {/* Queued (offline) photo cells — captured on-device, awaiting upload.
                      Shown from a local object URL with a pending badge; the caption is
                      stored on the queued capture so it replays with the upload. Replaced
                      by the persisted cell once it drains. */}
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

                  {/* Add photo — ghost button */}
                  <Box onClick={() => photoInputRefs.current[item.id]?.click()} sx={{
                    display: "flex", alignItems: "center", gap: "5px",
                    px: "10px", py: { xs: "9px", md: "5px" }, borderRadius: "5px",
                    border: "1px solid #e2e8f0", color: "#64748b",
                    fontSize: { xs: 13, md: 11.5 }, cursor: "pointer", fontWeight: 500,
                    transition: "all 0.1s",
                    "&:hover": { bgcolor: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" }
                  }}>
                    <CameraAltIcon sx={{ fontSize: { xs: 15, md: 13 } }} />
                    {((item.attachments ?? []).length > 0 || (sync.photosByItem[item.id]?.length ?? 0) > 0) ? "Add more" : "Add photo"}
                  </Box>

                  {/* Add note — same ghost button style, only show if no note yet */}
                  {!draft.notes && !drafts[item.id]?.notesOpen ? (
                    <Box onClick={() => setDrafts(prev => ({ ...prev, [item.id]: { ...getDraft(item), notesOpen: true } }))} sx={{
                      display: "flex", alignItems: "center", gap: "5px",
                      px: "10px", py: { xs: "9px", md: "5px" }, borderRadius: "5px",
                      border: "1px solid #e2e8f0", color: "#64748b",
                      fontSize: { xs: 13, md: 11.5 }, cursor: "pointer", fontWeight: 500,
                      transition: "all 0.1s",
                      "&:hover": { bgcolor: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" }
                    }}>
                      <AddIcon sx={{ fontSize: { xs: 15, md: 13 } }} />
                      Add note{isFail ? " (recommended)" : ""}
                    </Box>
                  ) : null}
                </Box>
              </Box>
            ) : null}

            {/* Follow-on prompt for failed items */}
            {isFail && check?.status === "IN_PROGRESS" && canExecute ? (
              <Box sx={{ mt: "10px", p: "10px 12px", bgcolor: "#fef9e7", border: "1px solid #fcd34d", borderRadius: "6px" }}>
                {item.followOns.length > 0 ? (
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                    {item.followOns.map(fo => (
                      <Chip key={fo.id} size="small" label={fo.entityType}
                        sx={{ bgcolor: "#e0f2fe", color: "#0369a1", fontSize: 10 }} />
                    ))}
                    <Button size="small" onClick={() => setFollowOnItem(item)}
                      sx={{ fontSize: 11, color: "#92400e", ml: "auto" }}>
                      Add another
                    </Button>
                  </Stack>
                ) : (
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography sx={{ fontSize: 12, color: "#92400e" }}>
                      ⚠ This item failed — create a follow-on action?
                    </Typography>
                    <Stack direction="row" spacing={0.75}>
                      <Button size="small"
                        onClick={() => setFollowOnItem(item)}
                        sx={{ fontSize: 11, bgcolor: "#f59e0b", color: "#fff", px: "10px", py: "4px", borderRadius: "4px", "&:hover": { bgcolor: "#d97706" } }}>
                        Create
                      </Button>
                    </Stack>
                  </Stack>
                )}
              </Box>
            ) : null}
          </Box>
        </Stack>
      </Box>
    )
  }

  // ── EXECUTION LAYOUT (IN_PROGRESS + PENDING_REVIEW) ────────────────────
  if (isExecuting) {
    const passPercent = totalItems > 0 ? (passItems / totalItems) * 100 : 0
    const failPercent = totalItems > 0 ? (failItems / totalItems) * 100 : 0
    const naPercent = totalItems > 0 ? (naItems / totalItems) * 100 : 0

    return (
      <Box sx={{
        // md+: the page is full-bleed (the effect above flips Shell <main> to p:0 +
        // overflow:hidden + flex column), so there's NO padding to escape — we just
        // fill the pane with flex:1 and the columns scroll internally. (The old
        // md -24px bleed against <main>'s 20px padding was the horizontal-scroll bug.)
        // xs: the mobile Shell <main> keeps its 12px padding and is the scroll
        // container, so we bleed -12px to go edge-to-edge, grow naturally, and pin the
        // action bar with position:sticky (B3) — this avoids the 56px-header + 12px-
        // padding double-count that would clip a fixed-height flex footer on phones.
        mx: { xs: "-12px", md: 0 },
        mt: { xs: "-12px", md: 0 },
        mb: { xs: "-12px", md: 0 },
        flex: { md: 1 }, minHeight: { md: 0 },
        display: "flex", flexDirection: "column",
        overflow: { xs: "visible", md: "hidden" },
        bgcolor: "var(--color-background-tertiary)"
      }}>
        {/* ── Exec header ─────────────────────────────────────────────── */}
        <Box sx={{ bgcolor: "var(--color-background-primary)", borderBottom: "1px solid var(--color-border-primary)", px: "28px", pt: "16px", pb: "14px", flexShrink: 0 }}>
          {/* Meta row */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "10px" }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 600 }}>
                {check.reference}
              </Typography>
              <Tooltip title={copied ? "Copied!" : "Copy"}>
                <IconButton size="small" onClick={copyRef} sx={{ color: "#94a3b8", width: 18, height: 18 }}>
                  <ContentCopyIcon sx={{ fontSize: 11 }} />
                </IconButton>
              </Tooltip>
            </Stack>
            <StatusPill value={check.status} label={STATUS_LABELS[check.status]} minWidth={112} />
            <Box sx={{ flex: 1 }} />
            {/* Sync indicator — offline-aware (Phase 4a) */}
            <SyncStatusPill status={sync.status} pendingCount={sync.pendingCount} />
          </Stack>

          {/* Title + actions */}
          <Stack direction="row" alignItems="flex-start" spacing={2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 500, color: "#0f172a", lineHeight: 1.3 }}>
                {check.title}
              </Typography>
              {check.scopeNotes ? (
                <Typography sx={{ fontSize: 13, color: "#64748b", mt: "3px" }}>
                  {check.scopeNotes}
                </Typography>
              ) : null}
            </Box>
          </Stack>

          {/* Progress bar */}
          {totalItems > 0 ? (
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mt: "14px" }}>
              <Box sx={{ flex: 1, height: 7, bgcolor: "#f1f5f9", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                <Box sx={{ width: `${passPercent}%`, bgcolor: "#15803d", height: "100%", transition: "width 0.3s" }} />
                <Box sx={{ width: `${failPercent}%`, bgcolor: "#b91c1c", height: "100%", transition: "width 0.3s" }} />
                <Box sx={{ width: `${naPercent}%`, bgcolor: "#94a3b8", height: "100%", transition: "width 0.3s" }} />
              </Box>
              <Stack direction="row" spacing={2} sx={{ flexShrink: 0 }}>
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
            </Stack>
          ) : null}

          {error ? <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert> : null}
        </Box>

        {/* ── 3-column body (stacks to a single column on xs) ──────────── */}
        <Box sx={{
          flex: 1, display: "flex",
          flexDirection: { xs: "column", md: "row" },
          overflow: { xs: "visible", md: "hidden" },
          minHeight: { md: 0 },
        }}>

          {/* Section rail — hidden on xs (inline section headers cover context;
              jump-nav is low value on a linear phone scroll) */}
          {sectionNames.length > 1 ? (
            <Box sx={{ display: { xs: "none", md: "block" }, width: 220, minWidth: 220, bgcolor: "#ffffff", borderRight: "1px solid #e2e8f0", overflowY: "auto", flexShrink: 0, py: "16px" }}>
              <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", px: "20px", pb: "10px" }}>
                Sections
              </Typography>
              {sectionNames.map(sectionName => {
                const stats = getSectionStats(sections[sectionName])
                const isComplete = stats.answered === stats.total && stats.total > 0
                const hasFails = stats.failed > 0
                const isPartial = stats.answered > 0 && stats.answered < stats.total
                const isActive = activeSection === sectionName || (activeSection === null && sectionNames.indexOf(sectionName) === 0)

                return (
                  <Box key={sectionName} onClick={() => scrollToSection(sectionName)}
                    sx={{
                      display: "flex", alignItems: "center", gap: "10px",
                      px: "16px", py: "9px", cursor: "pointer",
                      borderLeft: "2px solid", borderLeftColor: isActive ? "primary.main" : "transparent",
                      bgcolor: isActive ? "#f0f6ff" : "transparent",
                      "&:hover": { bgcolor: isActive ? "#f0f6ff" : "#f8fafc" },
                      transition: "all 0.15s"
                    }}>
                    {/* Status icon */}
                    <Box sx={{
                      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 600,
                      bgcolor: isComplete && !hasFails ? "#dcfce7" : hasFails ? "#fee2e2" : isPartial ? "#fef3c7" : "#f1f5f9",
                      color: isComplete && !hasFails ? "#15803d" : hasFails ? "#b91c1c" : isPartial ? "#b45309" : "#94a3b8"
                    }}>
                      {isComplete && !hasFails ? (
                        <CheckCircleIcon sx={{ fontSize: 13 }} />
                      ) : hasFails ? "!" : isPartial ? stats.answered : (
                        <Typography sx={{ fontSize: 10, fontWeight: 600 }}>{sectionNames.indexOf(sectionName) + 1}</Typography>
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: isActive ? 600 : 400, color: isActive ? "primary.main" : "#0f172a", lineHeight: 1.3 }}>
                        {sectionName}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: "#94a3b8", mt: "1px" }}>
                        {stats.answered} of {stats.total}
                        {hasFails ? ` · ${stats.failed} fail` : isComplete ? " · done" : ""}
                      </Typography>
                    </Box>
                  </Box>
                )
              })}
            </Box>
          ) : null}

          {/* Items column */}
          <Box ref={itemsColumnRef} sx={{ flex: 1, overflowY: { xs: "visible", md: "auto" }, p: { xs: "16px 12px", md: "24px 28px" }, minWidth: 0 }}>
            {totalItems === 0 ? (
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">No checklist items. This check was created without a template.</Typography>
              </Box>
            ) : null}

            {sectionNames.map(sectionName => {
              return (
              <Box key={sectionName} ref={(el: HTMLDivElement | null) => { sectionRefs.current[sectionName] = el }}
                sx={{ mb: "8px" }}>
                {sectionNames.length > 1 ? (
                  <Box sx={{ px: "4px", py: "6px", mb: "8px" }}>
                    <Typography sx={{
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "#94a3b8"
                    }}>
                      {sectionName} · {getSectionStats(sections[sectionName]).answered}/{sections[sectionName].length}
                    </Typography>
                  </Box>
                ) : null}
                <Box sx={{ mb: "20px" }}>
                  {sections[sectionName].map((item, idx) => renderItemCard(item, idx))}
                </Box>
              </Box>
              )
            })}

            {/* Completion hint */}
            {check.status === "IN_PROGRESS" && !allRequiredAnswered ? (
              <Box sx={{ p: "12px 14px", borderRadius: "8px", bgcolor: "#fffbeb", border: "1px solid #fde68a" }}>
                <Typography sx={{ fontSize: 12, color: "#92400e" }}>
                  {check.items.filter(i => i.isRequired && !i.response).length} required item(s) still need a response before this check can be submitted.
                </Typography>
              </Box>
            ) : null}

            {/* Add ad-hoc item — dashed button at the bottom */}
            {canExecute && check.status === "IN_PROGRESS" ? (
              <Box
                onClick={() => setAdHocOpen(true)}
                sx={{
                  mt: "8px", mb: "80px",
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

          {/* Context column (240px on md+; full-width, stacked below items on xs) */}
          <Box sx={{
            width: { xs: "100%", md: 240 }, minWidth: { xs: 0, md: 240 },
            bgcolor: "#ffffff",
            borderLeft: { xs: "none", md: "1px solid #e2e8f0" },
            borderTop: { xs: "1px solid #e2e8f0", md: "none" },
            overflowY: { xs: "visible", md: "auto" }, flexShrink: 0, p: "20px",
          }}>

            {/* Check details */}
            <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>
              Details
            </Typography>
            {[
              { label: "Site", value: check.site.name },
              { label: "Template", value: check.template.name },
              check.scheduledAt ? { label: "Scheduled", value: new Date(check.scheduledAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) } : null,
              check.startedAt ? { label: "Elapsed", value: formatElapsed(check.startedAt) } : null,
              check.assignee ? { label: "Engineer", value: check.assignee.displayName } : null,
              check.passRate !== null ? { label: "Pass rate", value: `${check.passRate}%` } : null,
            ].filter((row): row is DetailRow => row !== null).map((row) => (
              <Box key={row.label} sx={{ display: "flex", justifyContent: "space-between", py: "6px", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}>
                <Typography sx={{ fontSize: 12, color: "#64748b" }}>{row.label}</Typography>
                <Typography sx={{ fontSize: 12, color: "#0f172a", fontWeight: 400, textAlign: "right", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.value}</Typography>
              </Box>
            ))}

            <Divider sx={{ my: 2 }} />

            {/* Submit / review area */}
            {check.status === "IN_PROGRESS" ? (
              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>
                  Submit
                </Typography>
                <Box sx={{ bgcolor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", p: "12px", textAlign: "center" }}>
                  <Typography sx={{ fontSize: 11.5, color: "#64748b", mb: "10px" }}>
                    {allRequiredAnswered ? (
                      <><strong style={{ color: "#15803d" }}>Ready to submit</strong> — all required items answered</>
                    ) : (
                      <><strong style={{ color: "#0f172a" }}>{check.items.filter(i => i.isRequired && !i.response).length}</strong> required item(s) remaining</>
                    )}
                  </Typography>
                  {!allRequiredAnswered ? (
                    <Box sx={{ bgcolor: "#fef3c7", color: "#92400e", p: "6px 10px", borderRadius: "5px", fontSize: 11, mb: "10px" }}>
                      Complete all required items first
                    </Box>
                  ) : sync.pendingCount > 0 ? (
                    <Box sx={{ bgcolor: "#fef3c7", color: "#92400e", p: "6px 10px", borderRadius: "5px", fontSize: 11, mb: "10px" }}>
                      {sync.pendingCount} change(s) still to sync — submit once saved
                    </Box>
                  ) : null}
                  <Button fullWidth variant="contained" size="small"
                    disabled={!allRequiredAnswered || sync.pendingCount > 0}
                    onClick={() => setSubmitOpen(true)}
                    sx={{ fontSize: 12, py: "10px" }}>
                    Submit for review →
                  </Button>
                </Box>
              </Box>
            ) : null}

            {check.status === "PENDING_REVIEW" ? (
              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>
                  Review
                </Typography>
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
                    <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "8px" }}>
                      Engineer summary
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#334155", bgcolor: "#f8fafc", p: "10px", borderRadius: "6px", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                      {check.engineerSummary}
                    </Typography>
                  </Box>
                ) : null}
              </Box>
            ) : null}

            {/* Failed items summary */}
            {failItems > 0 ? (
              <Box sx={{ mt: 2 }}>
                <Divider sx={{ mb: 2 }} />
                <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", mb: "10px" }}>
                  Failed items ({failItems})
                </Typography>
                <Stack spacing={0.75}>
                  {failedItems.slice(0, 5).map(item => (
                    <Box key={item.id} sx={{ p: "8px 10px", bgcolor: "#fff5f5", borderRadius: "6px", border: "1px solid #fecaca" }}>
                      <Typography sx={{ fontSize: 11.5, color: "#7f1d1d", lineHeight: 1.4 }}>{item.label}</Typography>
                      {item.followOns.length > 0 ? (
                        <Typography sx={{ fontSize: 10, color: "#64748b", mt: "2px" }}>{item.followOns.length} follow-on(s) created</Typography>
                      ) : null}
                    </Box>
                  ))}
                  {failItems > 5 ? (
                    <Typography sx={{ fontSize: 11, color: "#64748b", textAlign: "center" }}>+{failItems - 5} more</Typography>
                  ) : null}
                </Stack>
              </Box>
            ) : null}
          </Box>
        </Box>

        {/* ── Sticky action bar (xs only) — keeps submit/review reachable
            without scrolling the whole form; the in-panel block above is
            hidden on xs to avoid duplication. ──────────────────────────── */}
        <Box sx={{
          display: { xs: "flex", md: "none" },
          position: "sticky", bottom: 0, zIndex: 2, flexShrink: 0,
          bgcolor: "#ffffff", borderTop: "1px solid #e2e8f0",
          p: "12px", gap: 1, alignItems: "center",
          boxShadow: "0 -2px 8px rgba(15,23,42,0.06)",
        }}>
          {check.status === "IN_PROGRESS" ? (
            <Stack spacing={0.5} sx={{ width: "100%" }}>
              {!allRequiredAnswered ? (
                <Typography sx={{ fontSize: 11.5, color: "#92400e", textAlign: "center" }}>
                  {check.items.filter(i => i.isRequired && !i.response).length} required item(s) remaining
                </Typography>
              ) : sync.pendingCount > 0 ? (
                <Typography sx={{ fontSize: 11.5, color: "#92400e", textAlign: "center" }}>
                  {sync.pendingCount} change(s) still to sync…
                </Typography>
              ) : null}
              <Button fullWidth variant="contained" size="large"
                disabled={!allRequiredAnswered || sync.pendingCount > 0}
                onClick={() => setSubmitOpen(true)}
                sx={{ py: "12px", fontSize: 15 }}>
                Submit for review →
              </Button>
            </Stack>
          ) : null}
          {check.status === "PENDING_REVIEW" ? (
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
          ) : null}
        </Box>

        {dialogs}
        <AttachmentPreviewModal open={!!previewAtt} attachment={previewAtt} onClose={() => setPreviewAtt(null)} />
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