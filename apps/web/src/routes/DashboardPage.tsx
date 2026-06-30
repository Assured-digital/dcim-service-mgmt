import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Box, Card, CardContent, Stack, Typography } from "@mui/material"
import RefreshIcon from "@mui/icons-material/Refresh"
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded"
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined"
import { LoadingState, ErrorState } from "../components/PageState"
import { semanticToken, ragToken, type RAGLevel, type ThemeMode } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import { useTickets } from "../lib/tickets"
import { computeSlaStatus } from "../lib/serviceDeskQueue"
import { buildNeedsAttention, type NeedsAttentionItem, type Severity } from "../lib/needsAttention"
import { deriveRag, type Risk as RIRisk } from "../lib/risksIssuesQueue"
import { getSelectedClientId } from "../lib/scope"
import { SectionBar, DASH_CARD_SX, CARD_CONTENT_SX } from "../components/dashboard/primitives"
import ChecksPanel from "../components/dashboard/ChecksPanel"
import { type DashCheck, isInRework } from "../lib/checksPanel"
import { OnboardingCard, EstateHero, AllClearLine, deriveColdState, type EstateSite } from "../components/dashboard/ColdStart"

// ── Domain-health RAG (the ONLY always-coloured element) ────────────────────
// NEUTRAL is a calm resting grey (no standing signal) — used for Infrastructure
// when there is no estate yet, and never to mean "good/bad". GREEN/AMBER/RED
// carry the standing signal; everything beneath this row rests neutral.
type HealthLevel = RAGLevel | "NEUTRAL"

function healthDot(level: HealthLevel, mode: ThemeMode): string {
  return level === "NEUTRAL" ? semanticToken("neutral", mode).solid : ragToken(level, mode).dot
}

// Responsive: at sm+ the dot sits beside a stacked label-over-status cell (the grid lays
// these 4-across → 2×2). On a phone (xs) the grid collapses to a single column and each
// item becomes a list row — dot + label on the left, status right-aligned — because 2×2
// cells get unreadably small at ~380px. One DOM, two layouts via flex-direction.
function HealthItem({ label, level, status }: { label: string; level: HealthLevel; status: string }) {
  const { mode } = useThemeMode()
  return (
    <Box sx={{ display: "flex", alignItems: { xs: "center", sm: "flex-start" }, gap: "10px", minWidth: 0 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: healthDot(level, mode), mt: { xs: 0, sm: "4px" }, flexShrink: 0 }} />
      <Box sx={{
        flex: 1, minWidth: 0, display: "flex",
        flexDirection: { xs: "row", sm: "column" },
        alignItems: { xs: "baseline", sm: "stretch" },
        justifyContent: { xs: "space-between", sm: "flex-start" },
        gap: { xs: "10px", sm: 0 },
      }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", lineHeight: 1.3, whiteSpace: "nowrap" }}>{label}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", lineHeight: 1.3, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: { xs: "right", sm: "left" } }}>{status}</Typography>
      </Box>
    </Box>
  )
}

// ── Alert-band count-stat (ALWAYS-COLOURED via the DOT — follows the RAG row, calm-
//    by-exception via dots NOT fills) ───────────────────────────────────────────
// A RAG status dot anchors each count: GREEN at 0 ("actively fine", not absent), else
// AMBER (Unassigned / Due soon) or RED (Breached). The dot is its own column, vertically
// centred against the cell; the label + number stack to its right, the number coloured to
// match the dot (neutral at 0). NO cell background tint (no fills — consistent with the
// RAG domain row) and NO tooltip; the whole stat is clickable through to its filtered queue.
function CountStat({ label, value, activeLevel, onClick }: {
  label: string; value: number; activeLevel: "AMBER" | "RED"; onClick: () => void
}) {
  const { mode } = useThemeMode()
  const active = value > 0
  const t = ragToken(active ? activeLevel : "GREEN", mode)
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      sx={{
        minWidth: 0, display: "flex", alignItems: "center", gap: "9px",
        px: "10px", py: "8px", borderRadius: "8px", cursor: "pointer",
        transition: "background-color 0.12s",
        // Same grey hover affordance as the open-work-by-type tiles (TypeTile).
        "&:hover": { bgcolor: "var(--color-background-tertiary)" },
        "&:focus-visible": { outline: "2px solid", outlineColor: t.dot, outlineOffset: "1px" },
      }}
    >
      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: t.dot, flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "3px", whiteSpace: "nowrap" }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: active ? t.text : "text.primary" }}>
          {value}
        </Typography>
      </Box>
    </Box>
  )
}

// SLA % cell — point-in-time, honest denominator; informational (NOT clickable) and
// dot-less (a percentage has no RAG state). Neutral text always. When data exists it
// shows "88% · of N covered"; when no open SR/INC carries an SLA due time it shows just
// "—" (never a bare alarming 0%). No tooltip.
function SlaStat({ pct, covered }: { pct: number | null; covered: number }) {
  return (
    <Box sx={{ minWidth: 0, px: "10px", py: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "3px" }}>
        SLA
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>
        {pct === null ? "—" : `${pct}%`}
      </Typography>
      {pct !== null ? (
        <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap", mt: "3px" }}>
          of {covered} covered
        </Typography>
      ) : null}
    </Box>
  )
}

// ── Placeholder (a later commit fills this slot) ─────────────────────────────
// Honest, clearly-marked reserved slot — makes the new IA visible without faking
// content. Dashed, muted, never a calm-looking blank.
function Placeholder({ label, note, minHeight = 96 }: { label: string; note: string; minHeight?: number }) {
  return (
    <Box sx={{
      border: "1px dashed", borderColor: "var(--color-border-secondary)", borderRadius: "10px",
      p: "16px", minHeight, display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px",
    }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 12, color: "text.tertiary" }}>{note}</Typography>
    </Box>
  )
}

// ── Contacts — explicit RESERVED slot ────────────────────────────────────────
// Not a generic placeholder, not a blank void, not a fake: a dashed card with an icon,
// header and a "Reserved" chip, until the Contact model lands (#174). A distinct, styled
// reserved state — the spec's honest answer for a slot whose backing model doesn't exist.
function ContactsReserved() {
  return (
    <Box sx={{
      border: "1px dashed", borderColor: "var(--color-border-secondary)", borderRadius: "10px",
      p: "18px", minHeight: 120, display: "flex", flexDirection: "column", gap: "8px",
    }}>
      <Stack direction="row" alignItems="center" gap="8px">
        <PeopleAltOutlinedIcon sx={{ fontSize: 16, color: "var(--color-text-muted)" }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Contacts
        </Typography>
        <Box sx={{ ml: "auto", px: "8px", py: "2px", borderRadius: "6px", bgcolor: "var(--color-background-tertiary)" }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
            Reserved
          </Typography>
        </Box>
      </Stack>
      <Typography sx={{ fontSize: 12.5, color: "text.tertiary", maxWidth: 380, lineHeight: 1.5 }}>
        Client contacts will live here once the Contact model lands (#174).
      </Typography>
    </Box>
  )
}

// ── Zone heading ─────────────────────────────────────────────────────────────
function ZoneHeading({ label, first }: { label: string; first?: boolean }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "12px", "&&": { mt: first ? 0 : "12px", mb: "-4px" } }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, height: 0, borderTop: "0.5px solid", borderColor: "var(--color-border-tertiary)" }} />
    </Box>
  )
}

// ── Refresh control (point-in-time contract) ────────────────────────────────
// Shared by the OPERATIONAL section header and the error retry. Spins while busy.
function RefreshControl({ busy, onClick, label = "Refresh" }: { busy: boolean; onClick: () => void; label?: string }) {
  return (
    <Box
      component="button"
      onClick={onClick}
      disabled={busy}
      sx={{
        display: "inline-flex", alignItems: "center", gap: "5px", flexShrink: 0,
        px: "10px", py: "5px", borderRadius: "7px", cursor: busy ? "default" : "pointer",
        border: "0.5px solid", borderColor: "divider", bgcolor: "background.paper",
        color: "var(--color-text-secondary)", font: "inherit", fontSize: 11.5, fontWeight: 600,
        opacity: busy ? 0.6 : 1, transition: "background-color 0.12s",
        "&:hover": busy ? {} : { bgcolor: "var(--color-background-secondary)" },
      }}
    >
      <RefreshIcon sx={{ fontSize: 14, animation: busy ? "spin 0.8s linear infinite" : "none", "@keyframes spin": { to: { transform: "rotate(360deg)" } } }} />
      {label}
    </Box>
  )
}

// ── Navigation tile (open work by type) ──────────────────────────────────────
// Clickable count tile → that type's pre-filtered open queue. Calm-by-exception:
// the count is neutral text.primary at rest; only the enriched sub-signal (breached /
// active) carries colour, and it deep-links its own filtered slice (stopping click
// propagation so it doesn't also fire the tile's whole-type navigation).
type TileEnrich = { text: string; intent: "danger" | "warning"; onClick: () => void }
function TypeTile({ label, count, onClick, enrich }: { label: string; count: number; onClick: () => void; enrich?: TileEnrich | null }) {
  const { mode } = useThemeMode()
  return (
    <Box onClick={onClick} sx={{
      bgcolor: "var(--color-background-secondary)", borderRadius: "8px",
      px: "12px", py: "11px", cursor: "pointer", minWidth: 0,
      transition: "background-color 0.12s",
      "&:hover": { bgcolor: "var(--color-background-tertiary)" },
    }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "5px" }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="baseline" gap="8px" flexWrap="wrap">
        <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>{count}</Typography>
        {enrich ? (
          <Typography
            component="span"
            onClick={(e) => { e.stopPropagation(); enrich.onClick() }}
            sx={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1, color: semanticToken(enrich.intent, mode).solid, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
          >
            {enrich.text}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  )
}

// ── Needs-attention row (the hero action queue) ──────────────────────────────
// Calm-by-exception governs this list (unlike the always-coloured alert band):
// rows are NEUTRAL, colour lives ONLY in the leading severity dot + label. A
// fixed-width severity column (a dot + lightweight label — NOT a StatusPill) keeps
// every title aligned to one left edge. Then the title (truncated) and ref +
// pressure ("INC-0012 · 4h over"). The whole row is clickable to the record;
// drill-through is role-gated downstream (ENGINEER assigned-only → 404).
const SEV_META: Record<Severity, { label: string; level: RAGLevel }> = {
  breached:     { label: "Breached", level: "RED" },
  "due-soon":   { label: "Due soon", level: "AMBER" },
  unassigned:   { label: "Unassigned", level: "AMBER" },
}

function NeedsAttentionRow({ item, onClick }: { item: NeedsAttentionItem; onClick: () => void }) {
  const { mode } = useThemeMode()
  const meta = SEV_META[item.severity]
  const t = ragToken(meta.level, mode)
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      sx={{
        display: "flex", alignItems: "center", gap: "12px",
        px: "10px", py: "9px", borderRadius: "8px", cursor: "pointer",
        transition: "background-color 0.12s",
        "&:hover": { bgcolor: "var(--color-background-secondary)" },
        "&:focus-visible": { outline: "2px solid", outlineColor: t.dot, outlineOffset: "-2px" },
      }}
    >
      {/* Fixed-width severity column — dot + label, the only colour in the row. On a phone
          (xs) the label drops to dot-only so squeezed titles keep room; the dot's colour
          still carries the severity. */}
      <Box sx={{ width: { xs: "auto", sm: 90 }, flexShrink: 0, display: "flex", alignItems: "center", gap: "7px" }}>
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: t.dot, flexShrink: 0 }} />
        <Typography sx={{ display: { xs: "none", sm: "block" }, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: t.text, whiteSpace: "nowrap" }}>
          {meta.label}
        </Typography>
      </Box>
      {/* Title — truncates with ellipsis; all titles align to the column's right edge. */}
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.subject}
      </Typography>
      {/* Ref + pressure — neutral metadata. */}
      <Typography sx={{ flexShrink: 0, fontSize: 11.5, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
        {item.reference} · {item.pressure}
      </Typography>
    </Box>
  )
}

// "N more →" footer link when the queue exceeds the 5-row cap — to the broad open
// work queue (no dedicated needs-attention route exists; this is the closest full
// view). Row-styled so it reads as the list's continuation, not a button.
function MoreLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      sx={{
        display: "flex", alignItems: "center", px: "10px", py: "8px", borderRadius: "8px", cursor: "pointer",
        transition: "background-color 0.12s",
        "&:hover": { bgcolor: "var(--color-background-secondary)" },
        "&:focus-visible": { outline: "2px solid", outlineColor: "var(--color-border-secondary)", outlineOffset: "-2px" },
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
        {count} more →
      </Typography>
    </Box>
  )
}

// Calm, honest empty state — a quiet green check, no apology. Reinforces glanceable
// calm: when the board is fine, this section says so plainly.
function NeedsAttentionEmpty() {
  const { mode } = useThemeMode()
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", py: "30px" }}>
      <CheckCircleOutlineRoundedIcon sx={{ fontSize: 26, color: ragToken("GREEN", mode).dot }} />
      <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>
        Nothing else needs attention right now.
      </Typography>
    </Box>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const clientId = getSelectedClientId()
  const [refreshing, setRefreshing] = React.useState(false)

  // ── Queries — the layer already in place. Tickets via the shared useTickets
  //    hook (SR/INC/CHG/TASK); checks / risks / issues / sites direct. ────────
  const tickets = useTickets()
  const checks = useQuery({ queryKey: ["checks"], queryFn: async () => (await api.get<DashCheck[]>("/checks")).data })
  const risks = useQuery({ queryKey: ["risks"], queryFn: async () => (await api.get<RIRisk[]>("/risks")).data })
  const issues = useQuery({ queryKey: ["issues"], queryFn: async () => (await api.get<{ id: string; status: string }[]>("/issues")).data })
  const sites = useQuery({ queryKey: ["infrastructure", clientId ?? "self"], queryFn: async () => (await api.get<EstateSite[]>("/sites")).data })

  const isLoading = tickets.isLoading || checks.isLoading || risks.isLoading || issues.isLoading || sites.isLoading
  const hasError = !!(tickets.error || checks.error || risks.error || issues.error || sites.error)

  // ── Service Desk + alert-band metrics + per-type open counts. One pass over the
  //    ticket union: SLA buckets (SR/INC), unassigned (all open work), and the
  //    nav-row open counts per kind. srBreached feeds the Requests tile's enriched
  //    "N breached" sub-signal (SR only — it deep-links ?type=sr&sla=breached). ──
  const m = React.useMemo(() => {
    let breached = 0, dueSoon = 0, onTrack = 0, unassigned = 0, srBreached = 0
    let sr = 0, inc = 0, chg = 0, task = 0
    for (const t of tickets.data) {
      if (t.chipIntent === "done") continue                      // open work only
      if (!t.assignee) unassigned++
      if (t.kind === "SR") sr++
      else if (t.kind === "INC") inc++
      else if (t.kind === "CHG") chg++
      else if (t.kind === "TASK") task++
      if (t.kind === "SR" || t.kind === "INC") {
        switch (computeSlaStatus(t.dueAt, false)) {
          case "breached": breached++; if (t.kind === "SR") srBreached++; break
          case "due-soon": dueSoon++; break
          case "on-track": onTrack++; break
          default: break                                          // no due date → outside SLA
        }
      }
    }
    const covered = breached + dueSoon + onTrack
    const pct = covered > 0 ? Math.round((onTrack / covered) * 100) : null
    return { breached, dueSoon, onTrack, covered, pct, unassigned, srBreached, sr, inc, chg, task }
  }, [tickets.data])

  // Nav-row open counts for Risks / Issues (client-wide; same terminal-state
  // definitions the queues use). Risks "N active" reuses activeRedRisks below.
  const risksOpen = (risks.data ?? []).filter(r => !["ACCEPTED", "CLOSED"].includes(r.status)).length
  const issuesOpen = (issues.data ?? []).filter(i => !["RESOLVED", "CLOSED"].includes(i.status)).length

  // ── Needs-attention queue — the merged, severity-ordered cross-type action list
  //    (breached → due-soon → unassigned), derived from the SAME ticket union the
  //    alert band reads. Capped at 5 rows in the UI; the full count drives the
  //    header total + the "N more" overflow link. ────────────────────────────────
  const needsAttention = React.useMemo(() => buildNeedsAttention(tickets.data), [tickets.data])

  // ── Domain-health RAG derivations ────────────────────────────────────────
  // Service Desk — red on any breach; amber on due-soon or unassigned; else green.
  const serviceDesk: { level: HealthLevel; status: string } =
    m.breached > 0 ? { level: "RED", status: `${m.breached} breached` }
    : m.dueSoon > 0 ? { level: "AMBER", status: `${m.dueSoon} due soon` }
    : m.unassigned > 0 ? { level: "AMBER", status: `${m.unassigned} unassigned` }
    : { level: "GREEN", status: "On track" }

  // Checks — amber if any awaiting review; else green. (There is NO overdue check
  // state — never derived. A null passRate is "not yet scored", never a failure.
  // "In rework" is NOT derivable from the flat /checks list — no rework status and
  // the list omits item.reworkFlagged; it joins when the checks-panel aggregate lands.)
  const pendingReview = (checks.data ?? []).filter(c => c.status === "PENDING_REVIEW").length
  const checksHealth: { level: HealthLevel; status: string } =
    pendingReview > 0 ? { level: "AMBER", status: `${pendingReview} awaiting review` } : { level: "GREEN", status: "On track" }

  // Governance — amber if any active RED-RAG (urgent) risk; else green.
  const activeRedRisks = (risks.data ?? []).filter(
    r => !["ACCEPTED", "CLOSED"].includes(r.status) && deriveRag(r.likelihood, r.impact) === "RED"
  ).length
  const governance: { level: HealthLevel; status: string } =
    activeRedRisks > 0 ? { level: "AMBER", status: `${activeRedRisks} active risk${activeRedRisks === 1 ? "" : "s"}` } : { level: "GREEN", status: "On track" }

  // Infrastructure — calm resting state (estate health deferred to the DCIM module:
  // no fill bars, no capacity-derived health). Green when an estate exists, else neutral.
  const siteCount = (sites.data ?? []).length
  const infrastructure: { level: HealthLevel; status: string } = {
    level: siteCount > 0 ? "GREEN" : "NEUTRAL",
    status: `${siteCount} site${siteCount === 1 ? "" : "s"}`,
  }

  // ── Cold-start state machine — a derived resting state from already-fetched data
  //    (no new query). Computed only inside the loaded branch below, so it is never
  //    confused with a loading/error state. "Checks needing attention" = awaiting review
  //    or in rework (the same signals the checks panel escalates on). ────────────────
  const openWorkCount = m.sr + m.inc + m.chg + m.task + risksOpen + issuesOpen
  const checksCount = checks.data?.length ?? 0
  const inReworkCount = (checks.data ?? []).filter(isInRework).length
  const checksNeedAttention = pendingReview > 0 || inReworkCount > 0
  const coldState = deriveColdState({
    hasEstate: siteCount > 0,
    checksCount,
    openWorkCount,
    checksNeedAttention,
  })

  // Client name for the onboarding headline (CDS voice names the space) — read from the
  // Shell's already-cached client list (org-super → ["clients"], client-scoped →
  // ["clients-mine"]); no extra fetch. Falls back to "this client" if not yet populated.
  const clientName = React.useMemo(() => {
    for (const key of [["clients"], ["clients-mine"]]) {
      const list = queryClient.getQueryData<Array<{ id: string; name: string }>>(key)
      const hit = list?.find((c) => c.id === clientId)
      if (hit) return hit.name
    }
    return null
  }, [queryClient, clientId, sites.dataUpdatedAt])

  // ── Point-in-time stamp (most recent successful fetch across the queries) ──
  const stampMs = Math.max(tickets.dataUpdatedAt, checks.dataUpdatedAt, risks.dataUpdatedAt, issues.dataUpdatedAt, sites.dataUpdatedAt)
  const stamp = stampMs > 0 ? new Date(stampMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"
  const busy = refreshing || tickets.isFetching || checks.isFetching || risks.isFetching || issues.isFetching || sites.isFetching

  async function refresh() {
    setRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
        queryClient.invalidateQueries({ queryKey: ["checks"] }),
        queryClient.invalidateQueries({ queryKey: ["risks"] }),
        queryClient.invalidateQueries({ queryKey: ["issues"] }),
        queryClient.invalidateQueries({ queryKey: ["infrastructure"] }),
      ])
    } finally { setRefreshing(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  // No page title — the top-bar breadcrumb ("{client} › Dashboard") is the sole
  // identifier (no-page-titles convention). The point-in-time stamp + Refresh live
  // inline on the OPERATIONAL section header below.
  return (
    <Box>
      {isLoading ? <LoadingState label="Loading dashboard..." /> : null}
      {/* A failed load is an explicit error WITH retry — never dressed up as a calm/empty state. */}
      {hasError && !isLoading ? (
        <Box>
          <ErrorState title="Failed to load dashboard data" detail="The snapshot could not be loaded." />
          <RefreshControl busy={busy} onClick={refresh} label="Try again" />
        </Box>
      ) : null}

      {/* Onboarding (state a) — newly-set-up client: a friendly setup checklist replaces
          the operational zone entirely. Distinct from loading (spinner) and error (retry). */}
      {!isLoading && !hasError && coldState === "onboarding" ? (
        <OnboardingCard clientName={clientName} onNavigate={(to) => navigate(to)} />
      ) : null}

      {!isLoading && !hasError && coldState !== "onboarding" ? (
        <Stack spacing="16px">
          {/* Estate-forward (state b) — quiet-but-configured client: the estate leads as
              the hero, above the operational zone (which collapses to a calm line below). */}
          {coldState === "estate" ? (
            <>
              <SectionBar label="Estate" />
              <EstateHero sites={sites.data ?? []} onNavigate={(to) => navigate(to)} />
            </>
          ) : null}

          {/* OPERATIONAL section header — the as-of stamp + Refresh sit inline on the
              right (they drop below the label on narrow widths via SectionBar's wrap). */}
          <SectionBar label="Operational" right={
            <Stack direction="row" alignItems="center" gap="12px">
              <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                Data as of {stamp}
              </Typography>
              <RefreshControl busy={busy} onClick={refresh} />
            </Stack>
          } />

          {/* 1 + 2 · Operational band (domain health + alert band) — the always-coloured
              element. In the estate-forward state it collapses to a single calm "all on
              track" line (no wall of zero-stats); otherwise it renders in full. */}
          {coldState === "estate" ? (
            <AllClearLine />
          ) : (
          <>
          {/* 1 · Domain health — the only always-coloured element. Four defined cells
              in BOTH layouts: 4-across (md) and 2×2 (below md). The column hairline is a
              centred ::before in each gap (var(--color-border-primary) — same weight as
              the alert band), hidden on the first cell of each row so wrapped rows show no
              dangling rule. rowGap gives the 2×2 layout breathing room. Dividers are
              neutral — the domain dots are the only colour in this card. */}
          <Card variant="outlined" sx={DASH_CARD_SX}>
            <CardContent sx={{ ...CARD_CONTENT_SX, py: "14px", "&:last-child": { pb: "14px" } }}>
              <Box sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" },
                columnGap: "20px", rowGap: { xs: "14px", sm: "18px" },
                "& > *": { position: "relative" },
                // Vertical column hairline — only from sm up (the phone single-column list
                // has no columns, so no rules). First cell of each row carries no divider:
                // at md (4-across) that's the 1st cell; at sm (2×2) the 1st and 3rd.
                "& > *::before": {
                  content: '""', position: "absolute", top: 0, bottom: 0, left: "-10px",
                  width: "0.5px", bgcolor: "var(--color-border-primary)", display: { xs: "none", sm: "block" },
                },
                "& > *:nth-of-type(2n+1)::before": { display: { xs: "none", md: "block" } },
                "& > *:nth-of-type(4n+1)::before": { display: { md: "none" } },
              }}>
                <HealthItem label="Service Desk" level={serviceDesk.level} status={serviceDesk.status} />
                <HealthItem label="Checks" level={checksHealth.level} status={checksHealth.status} />
                <HealthItem label="Governance" level={governance.level} status={governance.status} />
                <HealthItem label="Infrastructure" level={infrastructure.level} status={infrastructure.status} />
              </Box>
            </CardContent>
          </Card>

          {/* 2 · Alert band — state reads off the individual stats only (NO summary
              badge). Order: SLA · Unassigned · Due soon · Breached. SLA is informational +
              dot-less; the three count-stats carry a RAG dot (green at 0, amber/red when
              active) with the number coloured to match — calm-by-exception via dots, NOT
              fills, consistent with the RAG row. No tooltips; each count-stat is clickable.
              Same grid + centred-hairline pattern as the RAG card: even distribution (SLA a
              touch wider for "88% · of N covered"; its empty "—" keeps the same gap to its
              divider), reflowing to 2×2 below md without dangling rules. */}
          <Card variant="outlined" sx={DASH_CARD_SX}>
            <CardContent sx={{ ...CARD_CONTENT_SX, py: "14px", "&:last-child": { pb: "14px" } }}>
              <Box sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
                columnGap: "16px", rowGap: "14px",
                "& > *": { position: "relative" },
                "& > *::before": {
                  content: '""', position: "absolute", top: 0, bottom: 0, left: "-8px",
                  width: "0.5px", bgcolor: "var(--color-border-primary)", display: "block",
                },
                "& > *:nth-of-type(2n+1)::before": { display: { xs: "none", md: "block" } },
                "& > *:nth-of-type(4n+1)::before": { display: { md: "none" } },
              }}>
                <SlaStat pct={m.pct} covered={m.covered} />
                <CountStat
                  label="Unassigned" value={m.unassigned} activeLevel="AMBER"
                  onClick={() => navigate("/service-desk?status=unassigned")}
                />
                <CountStat
                  label="Due soon" value={m.dueSoon} activeLevel="AMBER"
                  onClick={() => navigate("/service-desk?sla=due-soon")}
                />
                <CountStat
                  label="Breached" value={m.breached} activeLevel="RED"
                  onClick={() => navigate("/service-desk?sla=breached")}
                />
              </Box>
            </CardContent>
          </Card>
          </>
          )}

          {/* 3 · Open work by type — six clickable tiles → pre-filtered open queues.
              SCOPE (Approach A, frontend-only): counts come from the role-scoped list
              endpoints via useTickets/risks/issues, so they are client-wide for every
              role EXCEPT ENGINEER, whose list endpoints applyAssignedScope (assignee-only)
              — an ENGINEER therefore sees their own open counts here. This is consistent
              with the RAG row + alert band (same useTickets source). True client-wide
              counts for ENGINEER would need a backend count aggregate (Approach B, the
              follow-on-summary precedent) — out of scope for this frontend-only commit.
              Calm-by-exception: counts neutral at rest, colour only on the enriched
              breached/active sub-signals; drill-through stays role-gated. */}
          <SectionBar label="Open work by type" />
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(6, 1fr)" }, gap: "10px" }}>
            <TypeTile
              label="Requests" count={m.sr}
              onClick={() => navigate("/service-desk?type=sr&status=open")}
              enrich={m.srBreached > 0 ? { text: `${m.srBreached} breached`, intent: "danger", onClick: () => navigate("/service-desk?type=sr&sla=breached") } : null}
            />
            <TypeTile label="Incidents" count={m.inc} onClick={() => navigate("/service-desk?type=inc&status=open")} />
            <TypeTile label="Changes" count={m.chg} onClick={() => navigate("/service-desk?type=chg&status=open")} />
            <TypeTile label="Tasks" count={m.task} onClick={() => navigate("/service-desk?type=task&status=open")} />
            <TypeTile
              label="Risks" count={risksOpen}
              onClick={() => navigate("/risks-issues?type=risks")}
              enrich={activeRedRisks > 0 ? { text: `${activeRedRisks} active`, intent: "warning", onClick: () => navigate("/risks-issues?type=risks&view=urgent") } : null}
            />
            <TypeTile label="Issues" count={issuesOpen} onClick={() => navigate("/risks-issues?type=issues")} />
          </Box>

          {/* 4 · Needs attention (hero list) + 5 · Recent activity (placeholder —
              later commit), two-up on laptop. Needs-attention is the merged,
              severity-ordered action queue: SectionBar header carries the total
              count; the list caps at 5 rows with an "N more" overflow; the calm
              green empty state shows when nothing needs action. */}
          <Stack direction={{ xs: "column", md: "row" }} gap="16px" alignItems={{ md: "flex-start" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack spacing="12px">
                <SectionBar
                  label="Needs attention"
                  right={needsAttention.length > 0
                    ? <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                        {needsAttention.length} item{needsAttention.length === 1 ? "" : "s"}
                      </Typography>
                    : undefined}
                />
                <Card variant="outlined" sx={DASH_CARD_SX}>
                  <CardContent sx={{ p: "6px", "&:last-child": { pb: "6px" } }}>
                    {needsAttention.length === 0 ? (
                      <NeedsAttentionEmpty />
                    ) : (
                      <Stack>
                        {needsAttention.slice(0, 5).map(item => (
                          <NeedsAttentionRow key={item.id} item={item} onClick={() => navigate(item.detailPath)} />
                        ))}
                        {needsAttention.length > 5 ? (
                          <MoreLink count={needsAttention.length - 5} onClick={() => navigate("/service-desk?status=open")} />
                        ) : null}
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Stack>
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Placeholder label="Recent activity" note="Latest status changes & assignments. Added in a later commit." minHeight={140} />
            </Box>
          </Stack>

          {/* 6 · Checks panel (site-organised) — summary strip + per-site spine + site drill. */}
          <ChecksPanel checks={checks.data ?? []} />

          <ZoneHeading label="Client" />

          {/* 7 + 8 · Infrastructure band + Contacts — later commit. In estate-forward the
              estate is already the hero above, so the Infrastructure slot is omitted here. */}
          <Stack direction={{ xs: "column", md: "row" }} gap="16px">
            {coldState === "estate" ? null : (
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Placeholder label="Infrastructure" note="Sites · Cabinets · Assets band. Added in a later commit." minHeight={120} />
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <ContactsReserved />
            </Box>
          </Stack>
        </Stack>
      ) : null}
    </Box>
  )
}
