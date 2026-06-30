import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Stack, Typography } from "@mui/material"
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined"
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded"
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined"
import { api } from "../../lib/api"
import { useThemeMode } from "../../lib/theme"
import { formatDurationLong } from "../../lib/notifications"
import { IntentPill, StatusPill, ragToken, resolveIntent, type SemanticIntent } from "../shared"
import {
  isAwaitingReview,
  isInRework,
  isOpenFollowOn,
  recentChecks,
  scoreRagLevel,
  type DashCheck,
  type SiteRow,
} from "../../lib/checksPanel"

// Inline site-checks expansion — the check-as-container content (formerly the routed
// ChecksSiteDrill) re-homed into the checks-panel accordion: clicking a site row unfolds
// its recent checks directly beneath it. The summary header / breadcrumb / back-button are
// gone (the site row above already carries the score, follow-on counts and review state);
// each check's age now sits on its title line.

// Recent checks shown when a site is expanded — bounded (each fetches its own detail for
// follow-ons, so this is also the per-open detail-fetch fan-out cap).
const RECENT_LIMIT = 8

// The slice of GET /checks/:id consumed here — each item's follow-ons with their resolved
// Task/Risk/Issue (ref + title + status). `linked` is null for a dangling / cross-tenant id
// (the backend scopes the resolve), so we filter those out.
type DrillFollowOn = { entityType: string; linked: { reference: string; title: string; status: string } | null }
type DrillCheckDetail = { items: { followOns: DrillFollowOn[] }[] }

function humanise(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

// The check's review-state pill (Awaiting review / In rework / Passed). In-rework takes
// precedence (a sent-back check is IN_PROGRESS but carries flagged items); terminal →
// "Passed"; anything else falls back to its humanised status.
function reviewState(check: DashCheck): { label: string; intent: SemanticIntent } {
  if (isInRework(check)) return { label: "In rework", intent: "warning" }
  if (isAwaitingReview(check)) return { label: "Awaiting review", intent: "warning" }
  if (check.status === "COMPLETED" || check.status === "CLOSED") return { label: "Passed", intent: "success" }
  return { label: humanise(check.status), intent: resolveIntent(check.status) }
}

function followOnIcon(entityType: string) {
  const sx = { fontSize: 14, color: "var(--color-text-muted)" } as const
  if (entityType === "Risk") return <WarningAmberRoundedIcon sx={sx} />
  if (entityType === "Issue") return <BugReportOutlinedIcon sx={sx} />
  return <AssignmentOutlinedIcon sx={sx} />
}

function ScoreBadge({ passRate }: { passRate: number | null }) {
  const { mode } = useThemeMode()
  if (passRate == null) return <Typography sx={{ fontSize: 11.5, color: "text.tertiary" }}>—</Typography>
  const tok = ragToken(scoreRagLevel(passRate), mode)
  return <IntentPill bg={tok.bg} text={tok.text} label={`${Math.round(passRate)}%`} size="sm" />
}

// One open follow-on nested beneath its originating check: type icon · ref · title · status.
function FollowOnRow({ fo }: { fo: DrillFollowOn }) {
  const link = fo.linked! // caller filters to linked + open
  return (
    <Stack direction="row" alignItems="center" gap="8px">
      {followOnIcon(fo.entityType)}
      <Typography sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "text.secondary", flexShrink: 0 }}>
        {link.reference}
      </Typography>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: 12, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {link.title}
      </Typography>
      <StatusPill value={link.status} label={humanise(link.status)} size="sm" />
    </Stack>
  )
}

// Clean "N days ago"-style age from the check's effective date (completed → submitted →
// updated). Guarded so a missing/invalid date drops the age rather than showing "NaN".
function checkAge(check: DashCheck): string {
  const iso = check.completedAt ?? check.submittedAt ?? check.updatedAt
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isFinite(ms) && ms >= 0 ? `${formatDurationLong(ms)} ago` : ""
}

// A check as a container — header line always; open follow-ons nest beneath it when present
// (a clean passed check with none collapses to the single header line). The age now sits on
// the title line ("PSU redundancy check · 3 days ago"); the reference is the muted sub-line.
function RecentCheckCard({ check }: { check: DashCheck }) {
  const detail = useQuery({
    queryKey: ["check", check.id],
    queryFn: async () => (await api.get<DrillCheckDetail>(`/checks/${check.id}`)).data,
  })
  const openFollowOns = (detail.data?.items ?? [])
    .flatMap((i) => i.followOns)
    .filter((fo) => fo.linked && isOpenFollowOn(fo.entityType, fo.linked.status))
  const review = reviewState(check)
  const age = checkAge(check)

  return (
    <Box sx={{ border: "0.5px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", px: "12px", py: "10px" }}>
      <Stack direction="row" alignItems="center" gap="10px">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <Box component="span" sx={{ fontWeight: 600 }}>{check.title}</Box>
            {age ? <Box component="span" sx={{ color: "var(--color-text-muted)" }}>{`  ·  ${age}`}</Box> : null}
          </Typography>
          <Typography sx={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            {check.reference}
          </Typography>
        </Box>
        <ScoreBadge passRate={check.passRate} />
        <StatusPill intent={review.intent} label={review.label} size="sm" />
      </Stack>
      {openFollowOns.length > 0 ? (
        <Stack spacing="6px" sx={{ mt: "9px", pl: "12px", ml: "2px", borderLeft: "2px solid", borderColor: "divider" }}>
          {openFollowOns.map((fo, idx) => <FollowOnRow key={`${fo.linked!.reference}-${idx}`} fo={fo} />)}
        </Stack>
      ) : null}
    </Box>
  )
}

// The expandable section that unfolds beneath an open site row. Sits on a subtly distinct
// surface (--color-background-secondary) so the white check cards read as nested under —
// and belonging to — the site row above. Mounted only while open (the panel wraps this in
// a Collapse with unmountOnExit), so collapsed sites fire no detail fetches.
export function SiteChecksExpansion({ row }: { row: SiteRow }) {
  const recent = recentChecks(row.checks, RECENT_LIMIT)
  return (
    <Box sx={{ bgcolor: "var(--color-background-secondary)", borderRadius: "8px", p: "10px", mt: "2px", mb: "4px" }}>
      {recent.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)", px: "2px", py: "6px" }}>
          No checks at this site yet.
        </Typography>
      ) : (
        <Stack spacing="8px">
          {recent.map((check) => <RecentCheckCard key={check.id} check={check} />)}
        </Stack>
      )}
    </Box>
  )
}
