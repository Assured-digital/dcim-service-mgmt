import React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Box, Card, CardContent, Stack, Typography } from "@mui/material"
import RefreshIcon from "@mui/icons-material/Refresh"
import { LoadingState, ErrorState } from "../components/PageState"
import { semanticToken, ragToken, type RAGLevel, type ThemeMode } from "../components/shared"
import { useThemeMode } from "../lib/theme"
import { useTickets } from "../lib/tickets"
import { computeSlaStatus } from "../lib/serviceDeskQueue"
import { deriveRag, type Risk as RIRisk } from "../lib/risksIssuesQueue"
import { getSelectedClientId } from "../lib/scope"

// ── One card system (shared with later dashboard commits) ───────────────────
// Paper ground, single hairline, one radius, flat. Inner padding uniform.
const DASH_CARD_SX = {
  bgcolor: "background.paper",
  border: "0.5px solid",
  borderColor: "divider",
  borderRadius: "10px",
  boxShadow: "none",
} as const
const CARD_CONTENT_SX = { p: "18px", "&:last-child": { pb: "18px" } } as const

// ── Types ──────────────────────────────────────────────────────────────────
type Check = { id: string; status: string }

// ── Domain-health RAG (the ONLY always-coloured element) ────────────────────
// NEUTRAL is a calm resting grey (no standing signal) — used for Infrastructure
// when there is no estate yet, and never to mean "good/bad". GREEN/AMBER/RED
// carry the standing signal; everything beneath this row rests neutral.
type HealthLevel = RAGLevel | "NEUTRAL"

function healthDot(level: HealthLevel, mode: ThemeMode): string {
  return level === "NEUTRAL" ? semanticToken("neutral", mode).solid : ragToken(level, mode).dot
}

function HealthItem({ label, level, status }: { label: string; level: HealthLevel; status: string }) {
  const { mode } = useThemeMode()
  return (
    <Box sx={{ flex: { xs: "1 1 45%", md: "1 1 0" }, minWidth: { xs: 0, md: 150 }, display: "flex", alignItems: "flex-start", gap: "10px", py: "4px" }}>
      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: healthDot(level, mode), mt: "4px", flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", lineHeight: 1.3 }}>{label}</Typography>
        <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", lineHeight: 1.3 }}>{status}</Typography>
      </Box>
    </Box>
  )
}

// ── Alert-band cell (calm-by-exception) ─────────────────────────────────────
// Neutral at rest; the value earns colour only when its threshold trips. A "good
// zero" (0 breached) stays muted, never red. Mirrors the count-tile language used
// elsewhere on the dashboard.
type CellIntent = "danger" | "warning"
function BandStat({ label, value, intent }: { label: string; value: number; intent: CellIntent }) {
  const { mode } = useThemeMode()
  const active = value > 0
  const color = active ? semanticToken(intent, mode).solid : "var(--color-text-muted)"
  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "4px" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: active ? color : "text.primary" }}>
        {value}
      </Typography>
    </Box>
  )
}

// Hairline separator between adjacent alert-band stats so they read as discrete
// readouts, not a loose row. Neutral + mode-aware (--color-border-primary, defined
// for both themes in styles.css); full-height via align-self stretch; even padding
// either side (the mx). NEVER coloured — the stats earn colour, the dividers don't.
function BandDivider() {
  return <Box sx={{ alignSelf: "stretch", width: "0.5px", flexShrink: 0, mx: "14px", bgcolor: "var(--color-border-primary)" }} />
}

// SLA % cell — point-in-time, honest denominator. Neutral text always (the breach
// CELL carries the red, not the percentage). `covered === 0` shows a calm dash +
// "no SLA-covered tickets", never a bare alarming 0%.
function SlaStat({ pct, covered }: { pct: number | null; covered: number }) {
  return (
    <Box sx={{ flex: "0 0 auto", minWidth: 120 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "4px" }}>
        SLA
      </Typography>
      {pct === null ? (
        <Stack direction="row" alignItems="baseline" gap="6px">
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>—</Typography>
          <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>no SLA-covered tickets</Typography>
        </Stack>
      ) : (
        <Stack direction="row" alignItems="baseline" gap="6px">
          <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: "text.primary" }}>{pct}%</Typography>
          <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)" }}>· of {covered} covered</Typography>
        </Stack>
      )}
    </Box>
  )
}

// Worst-state summary badge for the alert band.
function SummaryBadge({ level, text }: { level: RAGLevel; text: string }) {
  const { mode } = useThemeMode()
  const t = ragToken(level, mode)
  return (
    <Box sx={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", px: "12px", py: "8px", borderRadius: "8px", bgcolor: t.bg }}>
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: t.dot, flexShrink: 0 }} />
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: t.text, whiteSpace: "nowrap" }}>{text}</Typography>
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

// ── Main page ──────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { mode } = useThemeMode()
  const queryClient = useQueryClient()
  const clientId = getSelectedClientId()
  const [refreshing, setRefreshing] = React.useState(false)

  // ── Queries — the layer already in place. Tickets via the shared useTickets
  //    hook; checks / risks / sites direct. (Issues join when needs-attention
  //    lands — nothing in this skeleton consumes them yet.) ──────────────────
  const tickets = useTickets()
  const checks = useQuery({ queryKey: ["checks"], queryFn: async () => (await api.get<Check[]>("/checks")).data })
  const risks = useQuery({ queryKey: ["risks"], queryFn: async () => (await api.get<RIRisk[]>("/risks")).data })
  const sites = useQuery({ queryKey: ["infrastructure", clientId ?? "self"], queryFn: async () => (await api.get<unknown[]>("/sites")).data })

  const isLoading = tickets.isLoading || checks.isLoading || risks.isLoading || sites.isLoading
  const hasError = !!(tickets.error || checks.error || risks.error || sites.error)

  // ── Service Desk + alert-band metrics (open SR/INC for SLA; open work items
  //    across the ticket union for unassigned) ────────────────────────────────
  const m = React.useMemo(() => {
    let breached = 0, dueSoon = 0, onTrack = 0, unassigned = 0
    for (const t of tickets.data) {
      if (t.chipIntent === "done") continue                      // open work only
      if (!t.assignee) unassigned++
      if (t.kind === "SR" || t.kind === "INC") {
        switch (computeSlaStatus(t.dueAt, false)) {
          case "breached": breached++; break
          case "due-soon": dueSoon++; break
          case "on-track": onTrack++; break
          default: break                                          // no due date → outside SLA
        }
      }
    }
    const covered = breached + dueSoon + onTrack
    const pct = covered > 0 ? Math.round((onTrack / covered) * 100) : null
    return { breached, dueSoon, onTrack, covered, pct, unassigned }
  }, [tickets.data])

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

  // ── Alert-band summary badge (worst current state) ───────────────────────
  const needsLook = m.dueSoon + m.unassigned
  const summary: { level: RAGLevel; text: string } =
    m.breached > 0 ? { level: "RED", text: `${m.breached} breached` }
    : needsLook > 0 ? { level: "AMBER", text: `${needsLook} needs a look` }
    : { level: "GREEN", text: "All on track" }

  // ── Point-in-time stamp (most recent successful fetch across the queries) ──
  const stampMs = Math.max(tickets.dataUpdatedAt, checks.dataUpdatedAt, risks.dataUpdatedAt, sites.dataUpdatedAt)
  const stamp = stampMs > 0 ? new Date(stampMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—"
  const busy = refreshing || tickets.isFetching || checks.isFetching || risks.isFetching || sites.isFetching

  async function refresh() {
    setRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tickets"] }),
        queryClient.invalidateQueries({ queryKey: ["checks"] }),
        queryClient.invalidateQueries({ queryKey: ["risks"] }),
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

      {!isLoading && !hasError ? (
        <Stack spacing="16px">
          {/* OPERATIONAL section header — the as-of stamp + Refresh sit inline on the
              right. Wraps gracefully: at narrow widths the stamp + Refresh drop below
              the label (flex-wrap) rather than overflowing or colliding. The hairline
              runs beneath the whole row. */}
          <Box sx={{
            display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: "8px", columnGap: "16px",
            pb: "8px", borderBottom: "0.5px solid", borderColor: "var(--color-border-primary)",
          }}>
            <Typography sx={{ flex: "1 1 auto", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
              Operational
            </Typography>
            <Stack direction="row" alignItems="center" gap="12px" sx={{ flexShrink: 0 }}>
              <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
                Data as of {stamp}
              </Typography>
              <RefreshControl busy={busy} onClick={refresh} />
            </Stack>
          </Box>

          {/* 1 · Domain health — the only always-coloured element. */}
          <Card variant="outlined" sx={DASH_CARD_SX}>
            <CardContent sx={{ ...CARD_CONTENT_SX, py: "14px", "&:last-child": { pb: "14px" } }}>
              {/* 4-across on desktop with hairline dividers; reflows to 2×2 below md
                  (the HealthItem flex-basis), where the dividers hide so wrapped rows
                  don't show dangling rules. */}
              <Stack direction="row" flexWrap="wrap" gap="12px"
                divider={<Box sx={{ width: "0.5px", alignSelf: "stretch", bgcolor: "var(--color-border-tertiary)", display: { xs: "none", md: "block" } }} />}>
                <HealthItem label="Service Desk" level={serviceDesk.level} status={serviceDesk.status} />
                <HealthItem label="Checks" level={checksHealth.level} status={checksHealth.status} />
                <HealthItem label="Governance" level={governance.level} status={governance.status} />
                <HealthItem label="Infrastructure" level={infrastructure.level} status={infrastructure.status} />
              </Stack>
            </CardContent>
          </Card>

          {/* 2 · Alert band — calm-by-exception. Summary badge + SLA% + threshold cells. */}
          <Card variant="outlined" sx={DASH_CARD_SX}>
            <CardContent sx={{ ...CARD_CONTENT_SX, py: "14px", "&:last-child": { pb: "14px" } }}>
              <Stack direction="row" alignItems="center" flexWrap="wrap" gap="16px">
                <SummaryBadge level={summary.level} text={summary.text} />
                {/* Four discrete readouts: hairline neutral dividers between adjacent stats.
                    The summary badge stays separate to the left (the Stack's gap), with no
                    divider before the first stat. */}
                <Box sx={{ display: "flex", alignItems: "stretch", flex: 1, minWidth: 0 }}>
                  <SlaStat pct={m.pct} covered={m.covered} />
                  <BandDivider />
                  <BandStat label="Breached" value={m.breached} intent="danger" />
                  <BandDivider />
                  <BandStat label="Due soon" value={m.dueSoon} intent="warning" />
                  <BandDivider />
                  <BandStat label="Unassigned" value={m.unassigned} intent="warning" />
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {/* 3 · Open work by type (nav row) — later commit. */}
          <Placeholder label="Open work by type" note="Navigation row — Requests · Incidents · Changes · Tasks · Risks · Issues. Added in a later commit." />

          {/* 4 + 5 · Needs attention + Recent activity (two-up) — later commit. */}
          <Stack direction={{ xs: "column", md: "row" }} gap="16px">
            <Box sx={{ flex: 7, minWidth: 0 }}>
              <Placeholder label="Needs attention" note="Prioritised cross-type action list (breached · due-soon · unassigned). Added in a later commit." minHeight={140} />
            </Box>
            <Box sx={{ flex: 5, minWidth: 0 }}>
              <Placeholder label="Recent activity" note="Latest status changes & assignments. Added in a later commit." minHeight={140} />
            </Box>
          </Stack>

          {/* 6 · Checks panel (site-organised) — later commit. */}
          <Placeholder label="Checks" note="Site-organised panel — review state, scores + 90-day delta, follow-on counts. Added in a later commit." minHeight={120} />

          <ZoneHeading label="Client" />

          {/* 7 + 8 · Infrastructure band + Contacts — later commit. */}
          <Stack direction={{ xs: "column", md: "row" }} gap="16px">
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Placeholder label="Infrastructure" note="Sites · Cabinets · Assets band. Added in a later commit." minHeight={120} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Placeholder label="Contacts" note="Reserved — blocked on the Contact model (#174 / #161)." minHeight={120} />
            </Box>
          </Stack>
        </Stack>
      ) : null}
    </Box>
  )
}
