import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Card, CardContent, Collapse, Stack, Tooltip, Typography } from "@mui/material"
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined"
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded"
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined"
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded"
import { api } from "../../lib/api"
import { useClientEntitlements } from "../../lib/entitlements"
import { useThemeMode } from "../../lib/theme"
import { ragToken, semanticToken } from "../shared"
import { SectionBar, DASH_CARD_SX, CARD_CONTENT_SX, ScoreReadout, fmtDay } from "./primitives"
import {
  buildSummary,
  buildSiteRows,
  type DashCheck,
  type FollowOnSummary,
  type SiteRow,
} from "../../lib/checksPanel"
import { SiteChecksExpansion } from "./ChecksSiteExpansion"

// Top sites by attention shown before the "+N more" expander (calm — most-needing-action
// first; the long tail folds away rather than scrolling the whole board).
const SITE_CAP = 6

// ── Summary strip (Part A) ────────────────────────────────────────────────────
function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0, px: "10px", py: "8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "4px", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}

// Review-state count — amber when > 0, neutral at rest (calm-by-exception; no dot, unlike
// the always-coloured alert band above).
function CountValue({ value }: { value: number }) {
  const { mode } = useThemeMode()
  return (
    <Typography sx={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: value > 0 ? semanticToken("warning", mode).text : "text.primary" }}>
      {value}
    </Typography>
  )
}

// ── Per-site follow-on icon-counts (Part B right cluster) ──────────────────────
function FollowOnCount({ icon, count, label }: { icon: React.ReactNode; count: number; label: string }) {
  const { mode } = useThemeMode()
  const active = count > 0
  return (
    <Tooltip title={`${count} ${label} from checks`}>
      <Stack component="span" direction="row" alignItems="center" gap="3px" sx={{ color: active ? semanticToken("warning", mode).text : "var(--color-text-muted)", opacity: active ? 1 : 0.6 }}>
        {icon}
        <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color: "inherit" }}>{count}</Typography>
      </Stack>
    </Tooltip>
  )
}

function FollowOnCounts({ row }: { row: SiteRow }) {
  const iconSx = { fontSize: 15, color: "inherit" } as const
  return (
    <Stack direction="row" alignItems="center" gap="11px" sx={{ flexShrink: 0 }}>
      <FollowOnCount icon={<AssignmentOutlinedIcon sx={iconSx} />} count={row.tasksFromChecks} label="tasks" />
      <FollowOnCount icon={<WarningAmberRoundedIcon sx={iconSx} />} count={row.risksFromChecks} label="risks" />
      <FollowOnCount icon={<BugReportOutlinedIcon sx={iconSx} />} count={row.issuesFromChecks} label="issues" />
    </Stack>
  )
}

function reviewStateText(row: SiteRow): string {
  const parts: string[] = []
  if (row.awaitingReview > 0) parts.push(`${row.awaitingReview} awaiting review`)
  if (row.inRework > 0) parts.push(`${row.inRework} in rework`)
  return parts.join(" · ")
}

// One site row — health dot · name · context subtext (review-state when it needs action,
// else next planned) · score+delta · follow-on counts · chevron. Clicking toggles the
// inline expansion of the site's checks beneath it; the chevron + bg reflect open state.
function SiteRowView({ row, expanded, onToggle }: { row: SiteRow; expanded: boolean; onToggle: () => void }) {
  const { mode } = useThemeMode()
  const needsAction = row.attention > 0
  const dot = ragToken(needsAction ? "AMBER" : "GREEN", mode).dot
  const subtext = needsAction
    ? reviewStateText(row)
    : row.next
      ? `Next: ${row.next.title} · ${fmtDay(row.next.scheduledAt)}`
      : "No upcoming checks"
  return (
    <Box
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle() } }}
      sx={{
        display: "flex", alignItems: "center", gap: "12px",
        px: "12px", py: "11px", borderRadius: "8px", cursor: "pointer",
        transition: "background-color 0.12s",
        // When expanded the row shares the expansion's surface so the two read as one unit.
        bgcolor: expanded ? "var(--color-background-secondary)" : "transparent",
        "&:hover": { bgcolor: "var(--color-background-secondary)" },
        "&:focus-visible": { outline: "2px solid", outlineColor: dot, outlineOffset: "-2px" },
      }}
    >
      <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: dot, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.siteName}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: needsAction ? semanticToken("warning", mode).text : "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtext}
        </Typography>
      </Box>
      <Box sx={{ flexShrink: 0 }}>
        <ScoreReadout score={row.score} size="sm" />
      </Box>
      <FollowOnCounts row={row} />
      {/* Expand affordance — points right when collapsed, down when open. */}
      <KeyboardArrowDownRoundedIcon sx={{ fontSize: 18, color: "var(--color-text-muted)", flexShrink: 0, transition: "transform 0.15s", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }} />
    </Box>
  )
}

function MoreSitesLink({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <Box
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      sx={{
        display: "flex", alignItems: "center", px: "12px", py: "9px", borderRadius: "8px", cursor: "pointer",
        transition: "background-color 0.12s",
        "&:hover": { bgcolor: "var(--color-background-secondary)" },
      }}
    >
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
        {count} more site{count === 1 ? "" : "s"} →
      </Typography>
    </Box>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────
// Self-contained: owns the follow-on-summary query (keyed under ["checks", …] so the
// dashboard's Refresh, which prefix-invalidates ["checks"], refreshes it too). Clicking a
// site row expands its recent checks inline (single-open accordion).
export default function ChecksPanel({ checks }: { checks: DashCheck[] }) {
  const [openSiteId, setOpenSiteId] = React.useState<string | null>(null)
  const [showAll, setShowAll] = React.useState(false)

  // A2 — /checks is gated to the OPERATIONS module; skip this query (and avoid a
  // 403) when the scoped client isn't licensed for it.
  const opsEnabled = useClientEntitlements().hasModule("OPERATIONS")
  const followOns = useQuery({
    queryKey: ["checks", "follow-on-summary"],
    queryFn: async () => (await api.get<FollowOnSummary>("/checks/follow-on-summary")).data,
    enabled: opsEnabled,
  })

  // One "now" per data snapshot — recomputed when the checks change (a Refresh re-evaluates
  // the upcoming/90-day windows) but stable across re-renders in between.
  const nowMs = React.useMemo(() => Date.now(), [checks, followOns.data])
  const summary = React.useMemo(() => buildSummary(checks, nowMs), [checks, nowMs])
  const siteRows = React.useMemo(() => buildSiteRows(checks, followOns.data, nowMs), [checks, followOns.data, nowMs])

  const visibleRows = showAll ? siteRows : siteRows.slice(0, SITE_CAP)
  const hiddenCount = siteRows.length - visibleRows.length

  return (
    <Stack spacing="12px">
      <SectionBar label="Checks" />

      {/* Part A — summary strip. Same 4-across / 2×2 grid + centred hairlines as the
          alert band, so the dashboard's stat rows read as one family. */}
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
            <Metric label="Awaiting review"><CountValue value={summary.awaitingReview} /></Metric>
            <Metric label="In rework"><CountValue value={summary.inRework} /></Metric>
            <Metric label="Avg score"><ScoreReadout score={summary.score} size="lg" /></Metric>
            <Metric label="Next planned">
              {summary.next ? (
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", lineHeight: 1.1 }}>
                    {fmtDay(summary.next.scheduledAt)}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {summary.next.title}
                  </Typography>
                </Box>
              ) : (
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-muted)" }}>None scheduled</Typography>
              )}
            </Metric>
          </Box>
        </CardContent>
      </Card>

      {/* Part B — per-site spine. */}
      <Card variant="outlined" sx={DASH_CARD_SX}>
        <CardContent sx={{ p: "6px", "&:last-child": { pb: "6px" } }}>
          {siteRows.length === 0 ? (
            <Box sx={{ px: "12px", py: "22px", textAlign: "center" }}>
              <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                No site checks recorded yet.
              </Typography>
            </Box>
          ) : (
            <Box>
              {/* Single-open accordion: each row toggles its own inline expansion; setting
                  one open id collapses any other (Collapse unmounts → no stale fetches). */}
              {visibleRows.map((row) => {
                const isOpen = openSiteId === row.siteId
                return (
                  <Box key={row.siteId}>
                    <SiteRowView row={row} expanded={isOpen} onToggle={() => setOpenSiteId(isOpen ? null : row.siteId)} />
                    <Collapse in={isOpen} unmountOnExit timeout={160}>
                      <SiteChecksExpansion row={row} />
                    </Collapse>
                  </Box>
                )
              })}
              {hiddenCount > 0 ? <MoreSitesLink count={hiddenCount} onClick={() => setShowAll(true)} /> : null}
            </Box>
          )}
        </CardContent>
      </Card>
    </Stack>
  )
}
