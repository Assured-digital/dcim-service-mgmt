import React from "react"
import { Box, CircularProgress, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from "@mui/material"
import DownloadIcon from "@mui/icons-material/Download"
import MoreVertIcon from "@mui/icons-material/MoreVert"
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
import { EvidenceThumbs } from "./EvidenceThumbs"

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
  submittedAt: string | null
  completedAt: string | null
  closedAt: string | null
  passRate: number | null
  createdAt: string
  updatedAt: string
  site: { id: string; name: string } | null
  assignee: { id: string; displayName: string } | null
  template: { id: string; name: string; checkType: string } | null
  items: { id: string; response: string | null; isRequired: boolean }[]
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

// Due-date chip for upcoming cards: overdue (red) / due within 3 days (amber) /
// further out (neutral) / no date set (amber — needs scheduling).
export function dueState(iso: string | null): { label: string; intent: SemanticIntent } {
  const d = daysUntil(iso)
  if (d === null) return { label: "No date set", intent: "warning" }
  const dateLabel = new Date(iso as string).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
  if (d < 0) return { label: `Overdue · ${dateLabel}`, intent: "danger" }
  if (d <= 3) return { label: `Due ${dateLabel}`, intent: "warning" }
  return { label: dateLabel, intent: "neutral" }
}

const ACCENT: Record<Exclude<CheckCardVariant, "history">, string> = {
  review: semanticTokens.warning.text, // amber
  progress: semanticTokens.active.text, // blue
  upcoming: semanticTokens.neutral.text, // slate
  draft: semanticTokens.neutral.text,
}

// History cards aren't a single accent — they colour-code by terminal status (green
// COMPLETED / slate CLOSED / red CANCELLED) via the shared intent scale, so the archive
// reads its outcome at a glance. resolveIntent maps each terminal status to that hue.
const TERMINAL_LABEL: Record<string, string> = { COMPLETED: "Completed", CLOSED: "Closed", CANCELLED: "Cancelled" }

// Pass-rate -> RAG band (matches the prior history table): >=80 green, >=60 amber, else red.
function passRateRag(v: number) {
  return v >= 80 ? ragTokens.GREEN : v >= 60 ? ragTokens.AMBER : ragTokens.RED
}

function IntentChip({ intent, label }: { intent: SemanticIntent; label: string }) {
  const tok = semanticTokens[intent]
  return <IntentPill bg={tok.bg} text={tok.text} label={label} />
}

// One card for every queue state — the accent, header, title, site and person are
// shared; only the footer differs by `variant`. Click opens the check.
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
  const fail = variant === "review" ? failCount(check.items) : null
  const due = variant === "upcoming" ? dueState(check.scheduledAt) : null
  const { answered, total } = progressFraction(check.items)
  const submitted = variant === "review" ? formatRelativeTime(check.submittedAt ?? check.createdAt) : null

  // History per-card actions live behind a ⋮ menu (a deliberate two-step) rather than a bare
  // one-tap icon, so a report download can't fire by accident on a tightly-packed card.
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)

  // History-variant derived signals: status accent + pill, completed date, pass rate, fails.
  const isHistory = variant === "history"
  const isCancelled = check.status === "CANCELLED"
  const accent = isHistory ? semanticTokens[resolveIntent(check.status)].text : ACCENT[variant]
  const completedDate = isHistory ? effectiveCompleted(check) : null
  const completedLabel = completedDate
    ? completedDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : null
  // Cancelled checks were never scored -> pass rate "—" (never a misleading 0%) and no fails.
  const passRate = isCancelled ? null : check.passRate
  const fails = isHistory && !isCancelled ? check.items.filter((i) => i.response === "FAIL").length : 0

  // The variant's trailing signal — the one cluster that differs per queue. Lives on the
  // RIGHT at width (vertically centred against the identity block) and reflows BELOW it on
  // narrow screens. Built once here, placed by the responsive Stack below.
  const signal =
    variant === "review" ? (
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
        {fail ? <IntentChip intent={fail.intent} label={fail.label} /> : null}
        {check.evidence.length > 0 ? (
          <EvidenceThumbs attachments={check.evidence} max={2} />
        ) : (
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>No evidence</Typography>
        )}
        {submitted ? (
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 600 }}>{submitted}</Typography>
        ) : null}
      </Stack>
    ) : variant === "progress" ? (
      // Inline bar + count (the "Progress" label is dropped — the bar is self-evident). Fixed
      // width at sm so bars line up across cards; full-width when stacked on narrow.
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ width: { xs: "100%", sm: 200 } }}>
        <Box sx={{ flex: 1, minWidth: 80, height: 6, bgcolor: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
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
    ) : variant === "upcoming" ? (
      due ? <IntentChip intent={due.intent} label={due.label} /> : null
    ) : variant === "history" ? (
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
        <StatusPill value={check.status} label={TERMINAL_LABEL[check.status] ?? check.status} size="sm" />
        <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>{completedLabel ?? "—"}</Typography>
        {passRate == null ? (
          // Cancelled / never-scored -> "—", never a misleading 0%.
          <Typography sx={{ fontSize: 11.5, color: "#94a3b8" }}>—</Typography>
        ) : (
          <IntentPill {...passRateRag(passRate)} label={`${Math.round(passRate)}%`} size="sm" />
        )}
        {!isCancelled ? (
          <Typography
            sx={{ fontSize: 11.5, fontWeight: fails > 0 ? 600 : 400, color: fails > 0 ? ragTokens.RED.text : "#94a3b8" }}
          >
            {fails} fail{fails === 1 ? "" : "s"}
          </Typography>
        ) : null}
        {/* Per-card actions behind a ⋮ menu — a deliberate two-step (open → pick), never a
            hair-trigger one-tap. The trigger shows a spinner while the report generates.
            Cancelled checks have nothing to report -> no menu at all. */}
        {!isCancelled && onDownloadReport ? (
          <Box onClick={(e) => e.stopPropagation()}>
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
              <MenuItem
                onClick={() => { setMenuAnchor(null); onDownloadReport(check) }}
                sx={{ fontSize: 13, gap: 1 }}
              >
                <DownloadIcon sx={{ fontSize: 16, color: "#64748b" }} />
                Download report
              </MenuItem>
            </Menu>
          </Box>
        ) : null}
      </Stack>
    ) : null // draft — identity only, no trailing signal

  // Identity meta line: template · site, collapsed to one muted truncating line so the card
  // stays ~2 lines tall. The assignee (knownAs name via the shared AssigneeCell) rides
  // alongside it and never truncates away.
  const metaText = [check.template?.name, check.site?.name ?? "No site"]
    .filter(Boolean)
    .join("  ·  ")

  return (
    <Box
      onClick={() => onOpen(check.id)}
      sx={{
        border: "1px solid #e2e8f0",
        borderLeft: `3px solid ${accent}`,
        borderRadius: "8px",
        bgcolor: "#ffffff",
        px: { xs: 1.5, sm: 2 },
        py: { xs: 1.25, sm: 1 },
        cursor: "pointer",
        transition: "background-color 0.12s",
        "&:hover": { bgcolor: "#f8fafc" },
      }}
    >
      {/* Compact-horizontal at width (identity left, signal right, centred); reflows to a
          tight vertical stack on narrow screens. One layout for every variant. */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1, sm: 2 }}
        alignItems={{ xs: "stretch", sm: "center" }}
      >
        {/* Identity — ref + title, then the meta line + assignee. Grows and truncates so a
            long title/template never pushes the signal off the card. */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: "#475569", flexShrink: 0 }}>
              {check.reference}
            </Typography>
            <Typography
              sx={{
                fontSize: 13.5,
                fontWeight: 600,
                color: "#0f172a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {check.title}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.4, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: 12,
                color: "#64748b",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {metaText}
            </Typography>
            <Box sx={{ flexShrink: 0 }}>
              <AssigneeCell user={check.assignee} />
            </Box>
          </Stack>
        </Box>

        {/* Signal — variant footer, right-aligned at width / below the identity on narrow. */}
        {signal ? (
          <Box
            sx={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: { xs: "flex-start", sm: "flex-end" },
              width: { xs: "100%", sm: "auto" },
            }}
          >
            {signal}
          </Box>
        ) : null}
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
