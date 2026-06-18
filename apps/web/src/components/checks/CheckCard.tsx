import React from "react"
import { Box, CircularProgress, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material"
import DownloadIcon from "@mui/icons-material/Download"
import MoreVertIcon from "@mui/icons-material/MoreVert"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import {
  AssigneeCell,
  IntentPill,
  StatusPill,
  ragTokens,
  resolveIntent,
  semanticTokens,
  type SemanticIntent,
} from "../shared"
import { formatRelativeTime } from "../../lib/notifications"
import type { AttachmentSummary } from "../../lib/attachments"

// One Check as consumed by the active landing. Mirrors the backend list payload
// (checks.service.ts listForClient) — every scalar field is returned via Prisma
// `include`; `evidence` is the per-row attachment summary added for review cards.
export type Check = {
  id: string
  reference: string
  title: string
  checkType: string
  status: string
  priority: string
  scheduledAt: string | null
  startedAt: string | null
  submittedAt: string | null
  completedAt: string | null
  closedAt: string | null
  passRate: number | null
  createdAt: string
  updatedAt: string
  site: { id: string; name: string } | null
  assignee: { id: string; displayName: string } | null
  template: { id: string; name: string; checkType: string } | null
  items: { id: string; response: string | null; isRequired: boolean; isCritical: boolean }[]
  evidence: AttachmentSummary[]
}

export type CheckView = "manager" | "engineer" | "viewer"
// "history" is the archive variant (CheckHistoryPage) — terminal checks
// (COMPLETED/CLOSED/CANCELLED) shown as the SAME card as the active landing, with a
// status pill + completed date + pass rate + fails + per-card Download Report.
export type CheckCardVariant = "review" | "progress" | "upcoming" | "draft" | "history"

// Terminal statuses (COMPLETED/CLOSED/CANCELLED) never appear on the active landing —
// they move to the Part 2 History page; DRAFT surfaces only in the manager drafts
// section. partitionChecks selects the active statuses per queue explicitly, so no
// separate exclusion filter is needed here.
const UPCOMING_WINDOW_DAYS = 30
const DAY_MS = 86_400_000

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((t - Date.now()) / DAY_MS)
}

// Effective "completed" date for a terminal (archive) check — completedAt is set on
// completion and retained through CLOSED; the fallbacks cover any legacy/edge row that
// reached a terminal state without one. Drives the history card's date, default sort
// and the window filter (CheckHistoryPage), and the date shown on the history variant.
export function effectiveCompleted(c: Check): Date | null {
  const iso = c.completedAt ?? c.closedAt ?? c.submittedAt ?? c.updatedAt
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// Null-dated active work counts as upcoming (it's live work still needing a date) and
// sorts to the top; genuinely far-future (>30d) drops off the workday view.
function inUpcomingWindow(c: Check): boolean {
  const d = daysUntil(c.scheduledAt)
  return d === null || d <= UPCOMING_WINDOW_DAYS
}

export function compareDue(a: Check, b: Check): number {
  const av = a.scheduledAt ? new Date(a.scheduledAt).getTime() : -Infinity
  const bv = b.scheduledAt ? new Date(b.scheduledAt).getTime() : -Infinity
  return av - bv // null-dated to the top
}

// Partition the active set into the role's ordered queues. Manager: review →
// in-progress → upcoming (+ drafts). Engineer: their active/assigned work → their
// upcoming (SCHEDULED only — ASSIGNED is already in "active", so no double-listing).
// Viewer/unknown: in-progress → upcoming, no review/drafts.
export function partitionChecks(all: Check[], view: CheckView, meId: string) {
  const mine = (c: Check) => c.assignee?.id === meId

  if (view === "engineer") {
    return {
      review: [] as Check[],
      progress: all.filter((c) => (c.status === "IN_PROGRESS" || c.status === "ASSIGNED") && mine(c)),
      upcoming: all
        .filter((c) => c.status === "SCHEDULED" && mine(c) && inUpcomingWindow(c))
        .sort(compareDue),
      drafts: [] as Check[],
    }
  }

  return {
    review: view === "manager" ? all.filter((c) => c.status === "PENDING_REVIEW") : [],
    progress: all.filter((c) => c.status === "IN_PROGRESS"),
    upcoming: all
      .filter((c) => (c.status === "SCHEDULED" || c.status === "ASSIGNED") && inUpcomingWindow(c))
      .sort(compareDue),
    drafts: view === "manager" ? all.filter((c) => c.status === "DRAFT") : [],
  }
}

// Pass/fail summary for a review card, computed client-side from the item responses
// already in the payload. No items → neutral "No items" (never divide by zero).
export function failCount(items: { response: string | null }[]): { label: string; intent: SemanticIntent } {
  const total = items.length
  if (total === 0) return { label: "No items", intent: "neutral" }
  const fails = items.filter((i) => i.response === "FAIL").length
  if (fails > 0) return { label: `${fails} fail${fails === 1 ? "" : "s"} of ${total}`, intent: "danger" }
  return { label: "All pass", intent: "success" }
}

function progressFraction(items: { response: string | null }[]): { answered: number; total: number } {
  const total = items.length
  const answered = items.filter((i) => i.response !== null).length
  return { answered, total }
}

// Upcoming urgency chip — colour-coded urgency ONLY (the scheduled date itself sits on the
// card's line-3 date slot, so the chip never repeats the date). Returns null when the work is
// simply scheduled and not yet near-due — the plain date alone carries it.
export function dueUrgency(iso: string | null): { label: string; intent: SemanticIntent } | null {
  const d = daysUntil(iso)
  if (d === null) return { label: "No date set", intent: "warning" }
  if (d < 0) return { label: "Overdue", intent: "danger" }
  if (d <= 3) return { label: "Due soon", intent: "warning" }
  return null
}

const ACCENT: Record<Exclude<CheckCardVariant, "history">, string> = {
  review: semanticTokens.warning.text, // amber
  progress: semanticTokens.active.text, // blue
  upcoming: semanticTokens.neutral.text, // slate
  draft: semanticTokens.neutral.text,
}

// Full status label set — every card shows a status pill (top-right), so every status that can
// reach a card needs a humanised label. StatusPill derives the colour from the status value.
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  PENDING_REVIEW: "Pending review",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
}

// Pass-rate -> RAG band (matches the prior history table): >=80 green, >=60 amber, else red.
function passRateRag(v: number) {
  return v >= 80 ? ragTokens.GREEN : v >= 60 ? ragTokens.AMBER : ragTokens.RED
}

// Uniform short date for the card's line-3 date slot (en-GB, day + short month + year).
function fmtDate(d: Date | null): string {
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—"
}
function shortDate(iso: string | null): string {
  return fmtDate(iso ? new Date(iso) : null)
}

// Compact elapsed-time label (e.g. "47m", "2h 15m") from start→end timestamps. Returns null
// when either bound is missing or non-positive, so callers DROP the stat gracefully (e.g. a
// cancelled check that never started/completed).
function formatDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return null
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

function IntentChip({ intent, label }: { intent: SemanticIntent; label: string }) {
  const tok = semanticTokens[intent]
  return <IntentPill bg={tok.bg} text={tok.text} label={label} />
}

// One card for EVERY queue state, rendered as a uniform three-line skeleton so the list reads
// as one consistent surface:
//   line 1 — ref + template (left) · status pill (right)
//   line 2 — title
//   line 3 — assignee · date (left) · variant signal + ⋮ actions menu (right)
// Only the line-3 signal + the date differ by `variant`; the skeleton is shared. Click opens.
export function CheckCard({
  check,
  variant,
  onOpen,
  onDownloadReport,
  downloading,
}: {
  check: Check
  variant: CheckCardVariant
  // eslint-disable-next-line no-unused-vars
  onOpen: (id: string) => void
  // History variant only — the per-card Download Report action + its in-flight state.
  // Logic/state stays in the page (CheckHistoryPage); the card just renders + delegates.
  // eslint-disable-next-line no-unused-vars
  onDownloadReport?: (check: Check) => void
  downloading?: boolean
}) {
  // ⋮ actions menu (a deliberate two-step, never a hair-trigger). Sits bottom-right on every
  // variant for a consistent action slot; today it carries Open + (history) Download report.
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)

  const isHistory = variant === "history"
  const isCancelled = check.status === "CANCELLED"
  // History colour-codes its accent by terminal status (green/slate/red); active queues keep
  // their per-variant accent. The coloured left-accent is preserved either way.
  const accent = isHistory ? semanticTokens[resolveIntent(check.status)].text : ACCENT[variant]

  // Line-3 derived data — the date (left, after the assignee) and the signal (right).
  const { answered, total } = progressFraction(check.items)
  const fail = variant === "review" ? failCount(check.items) : null
  const submitted = variant === "review" ? formatRelativeTime(check.submittedAt ?? check.createdAt) : null
  const due = variant === "upcoming" ? dueUrgency(check.scheduledAt) : null
  // Cancelled checks were never scored -> pass rate "—" (never a misleading 0%) and no fails.
  const passRate = isCancelled ? null : check.passRate
  const fails = isHistory && !isCancelled ? check.items.filter((i) => i.response === "FAIL").length : 0
  // Extra at-a-glance history stats (omit gracefully): how long the visit took (started→completed)
  // and how many of the fails were on CRITICAL items — surfaced separately, in danger colour.
  const duration = isHistory && !isCancelled ? formatDuration(check.startedAt, check.completedAt) : null
  const criticalFails = isHistory && !isCancelled
    ? check.items.filter((i) => i.response === "FAIL" && i.isCritical).length
    : 0

  // Variant-appropriate date for the line-3 date slot (startedAt isn't in the list payload,
  // so in-progress falls back to its scheduled date).
  const dateLabel =
    variant === "history"
      ? fmtDate(effectiveCompleted(check))
      : variant === "review"
        ? shortDate(check.submittedAt ?? check.createdAt)
        : variant === "upcoming"
          ? shortDate(check.scheduledAt)
          : shortDate(check.scheduledAt ?? check.createdAt) // progress + draft

  // Line-3 right signal — variant-specific content in one consistent slot (status pill follows).
  const signal =
    variant === "history" ? (
      <>
        {duration ? (
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>{duration}</Typography>
        ) : null}
        {passRate == null ? (
          // Cancelled / never-scored -> "—", never a misleading 0%.
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>—</Typography>
        ) : (
          <IntentPill {...passRateRag(passRate)} label={`Pass rate ${Math.round(passRate)}%`} size="sm" />
        )}
        {!isCancelled ? (
          <Typography
            sx={{ fontSize: 11.5, fontWeight: fails > 0 ? 600 : 400, color: fails > 0 ? ragTokens.RED.text : "#94a3b8" }}
          >
            {fails} fail{fails === 1 ? "" : "s"}
          </Typography>
        ) : null}
        {/* Critical fails — distinct from total fails, danger colour, only when there are any. */}
        {criticalFails > 0 ? (
          <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: ragTokens.RED.text }}>
            {criticalFails} critical
          </Typography>
        ) : null}
      </>
    ) : variant === "progress" ? (
      <Stack direction="row" alignItems="center" spacing={0.75}>
        <Box sx={{ width: 64, height: 6, bgcolor: "#f1f5f9", borderRadius: 999, overflow: "hidden", flexShrink: 0 }}>
          <Box
            sx={{
              width: total > 0 ? `${(answered / total) * 100}%` : "0%",
              height: "100%",
              bgcolor: "primary.main",
              borderRadius: 999,
            }}
          />
        </Box>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#475569", flexShrink: 0 }}>
          {total > 0 ? `${answered}/${total}` : "No items"}
        </Typography>
      </Stack>
    ) : variant === "review" ? (
      <>
        {fail ? <IntentChip intent={fail.intent} label={fail.label} /> : null}
        {submitted ? (
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 600 }}>{submitted}</Typography>
        ) : null}
      </>
    ) : variant === "upcoming" ? (
      due ? <IntentChip intent={due.intent} label={due.label} /> : null
    ) : null // draft — no signal; just assignee · date + the ⋮ menu

  // ⋮ menu items — Open is the universal baseline (and the slot for future per-card actions);
  // history non-cancelled adds Download report. Built as data so the menu render stays flat.
  const menuItems: { label: string; icon: React.ReactNode; onClick: () => void }[] = [
    { label: "Open check", icon: <OpenInNewIcon sx={{ fontSize: 16, color: "#64748b" }} />, onClick: () => onOpen(check.id) },
    ...(isHistory && !isCancelled && onDownloadReport
      ? [{ label: "Download report", icon: <DownloadIcon sx={{ fontSize: 16, color: "#64748b" }} />, onClick: () => onDownloadReport(check) }]
      : []),
  ]

  // ⋮ actions menu — sits top-right (line 1). A deliberate two-step (open → pick), with a spinner
  // on the trigger while a report generates. stopPropagation so opening it never opens the check.
  const actionsMenu = (
    <Box onClick={(e) => e.stopPropagation()} sx={{ flexShrink: 0, ml: 0.5, mr: "-6px", mt: "-4px" }}>
      <Tooltip title="Actions">
        <span>
          <IconButton
            size="small"
            disabled={!!downloading}
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ color: "#64748b", "&:hover": { color: "#1d4ed8", bgcolor: "#e8f1ff" } }}
          >
            {downloading ? <CircularProgress size={16} /> : <MoreVertIcon sx={{ fontSize: 18 }} />}
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {menuItems.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => { setMenuAnchor(null); item.onClick() }}
            sx={{ fontSize: 13, gap: 1 }}
          >
            {item.icon}
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  )

  return (
    <Box
      onClick={() => onOpen(check.id)}
      sx={{
        border: "1px solid #e2e8f0",
        borderLeft: `3px solid ${accent}`,
        borderRadius: "8px",
        bgcolor: "#ffffff",
        px: { xs: 1.5, sm: 2 },
        py: 1.25,
        // Uniform height so cards align in a clean list; grows only if line 3 wraps on a phone.
        minHeight: 96,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        cursor: "pointer",
        transition: "background-color 0.12s",
        "&:hover": { bgcolor: "#f8fafc" },
      }}
    >
      <Stack spacing={0.5}>
        {/* Line 1 — ref + template (truncating meta), ⋮ actions menu top-right */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            sx={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700, color: "#475569" }}>
              {check.reference}
            </Box>
            {check.template?.name ? `  ·  ${check.template.name}` : ""}
          </Typography>
          {actionsMenu}
        </Stack>

        {/* Line 2 — title */}
        <Typography
          sx={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {check.title}
        </Typography>

        {/* Line 3 — assignee · date (left); variant signal + status pill (right). Wraps on a phone. */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ flexWrap: { xs: "wrap", sm: "nowrap" }, rowGap: 0.5 }}
        >
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
            <AssigneeCell user={check.assignee} />
            <Typography sx={{ fontSize: 11.5, color: "#cbd5e1", flexShrink: 0 }}>·</Typography>
            <Typography sx={{ fontSize: 11.5, color: "#94a3b8", flexShrink: 0 }}>{dateLabel}</Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
            {signal}
            <StatusPill value={check.status} label={STATUS_LABEL[check.status] ?? check.status} size="sm" />
          </Stack>
        </Stack>
      </Stack>
    </Box>
  )
}

// A labelled queue: icon + title + count, then the cards. Renders NOTHING when empty,
// so "Awaiting review 0"-style ghost sections never appear.
export function QueueSection({
  title,
  count,
  icon,
  children,
}: {
  title: string
  count: number
  icon: React.ReactNode
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
        {icon}
        <Typography
          sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 15, fontWeight: 700, color: "#0f172a" }}
        >
          {title}
        </Typography>
        <Box
          sx={{
            bgcolor: "#e2e8f0",
            color: "#475569",
            borderRadius: 10,
            px: 0.85,
            py: 0.1,
            fontSize: 11.5,
            fontWeight: 700,
            lineHeight: 1.6,
          }}
        >
          {count}
        </Box>
      </Stack>
      <Stack spacing={1}>{children}</Stack>
    </Box>
  )
}
