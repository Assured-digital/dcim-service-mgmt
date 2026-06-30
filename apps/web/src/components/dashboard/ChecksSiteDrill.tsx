import React from "react"
import { useQuery } from "@tanstack/react-query"
import { Box, Card, CardContent, Stack, Typography } from "@mui/material"
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded"
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined"
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded"
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined"
import { api } from "../../lib/api"
import { useThemeMode } from "../../lib/theme"
import { formatRelativeTime } from "../../lib/notifications"
import { IntentPill, StatusPill, ragToken, resolveIntent, semanticToken, type SemanticIntent } from "../shared"
import { DASH_CARD_SX, CARD_CONTENT_SX, ScoreReadout, fmtDay } from "./primitives"
import {
  isAwaitingReview,
  isInRework,
  isOpenFollowOn,
  recentChecks,
  scoreRagLevel,
  type DashCheck,
  type SiteRow,
} from "../../lib/checksPanel"

// Recent checks shown in the drill — bounded (each fetches its own detail for follow-ons,
// so this is also the per-open detail-fetch fan-out cap).
const RECENT_LIMIT = 8

// The slice of GET /checks/:id the drill consumes — each item's follow-ons with their
// resolved Task/Risk/Issue (ref + title + status). `linked` is null for a dangling /
// cross-tenant id (the backend scopes the resolve), so we filter those out.
type DrillFollowOn = { entityType: string; linked: { reference: string; title: string; status: string } | null }
type DrillCheckDetail = { items: { followOns: DrillFollowOn[] }[] }

function humanise(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
}

// The check's review-state pill (DASHBOARD_SPEC §6: Awaiting review / In rework / Passed).
// In-rework takes precedence (a sent-back check is IN_PROGRESS but carries flagged items);
// terminal → "Passed"; anything else falls back to its humanised status.
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

// A check as a container — header line always; open follow-ons nest beneath it when present
// (a clean passed check with none collapses to the single header line).
function RecentCheckCard({ check }: { check: DashCheck }) {
  const detail = useQuery({
    queryKey: ["check", check.id],
    queryFn: async () => (await api.get<DrillCheckDetail>(`/checks/${check.id}`)).data,
  })
  const openFollowOns = (detail.data?.items ?? [])
    .flatMap((i) => i.followOns)
    .filter((fo) => fo.linked && isOpenFollowOn(fo.entityType, fo.linked.status))
  const review = reviewState(check)
  const age = formatRelativeTime(check.completedAt ?? check.submittedAt ?? check.updatedAt)

  return (
    <Box sx={{ border: "0.5px solid", borderColor: "divider", borderRadius: "8px", bgcolor: "background.paper", px: "12px", py: "10px" }}>
      <Stack direction="row" alignItems="center" gap="10px">
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {check.title}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>{check.reference}</Box>
            {age ? `  ·  ${age}` : ""}
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

// Drill summary header — one compact stat per metric, reusing the panel's score readout.
function HeaderStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", mb: "3px", whiteSpace: "nowrap" }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}

function HeaderCount({ value }: { value: number }) {
  const { mode } = useThemeMode()
  return (
    <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1, color: value > 0 ? semanticToken("warning", mode).text : "text.primary" }}>
      {value}
    </Typography>
  )
}

// Site-scoped drill (Part C). Self-contained: the back affordance doubles as the in-panel
// breadcrumb (Engineering checks › [site]); kept inside the panel rather than a route, since
// the dashboard owns no sub-routes.
export function ChecksSiteDrill({ row, onBack }: { row: SiteRow; onBack: () => void }) {
  const recent = recentChecks(row.checks, RECENT_LIMIT)

  return (
    <Stack spacing="12px">
      {/* Breadcrumb / back */}
      <Box
        onClick={onBack}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBack() } }}
        sx={{
          display: "inline-flex", alignItems: "center", gap: "6px", alignSelf: "flex-start",
          py: "4px", pr: "8px", borderRadius: "7px", cursor: "pointer",
          transition: "background-color 0.12s",
          "&:hover": { bgcolor: "var(--color-background-secondary)" },
        }}
      >
        <ChevronLeftRoundedIcon sx={{ fontSize: 18, color: "var(--color-text-muted)" }} />
        <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
          Engineering checks
        </Typography>
        <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>›</Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.primary" }}>{row.siteName}</Typography>
      </Box>

      {/* Summary header */}
      <Card variant="outlined" sx={DASH_CARD_SX}>
        <CardContent sx={{ ...CARD_CONTENT_SX, py: "14px", "&:last-child": { pb: "14px" } }}>
          <Stack direction="row" gap="28px" flexWrap="wrap" rowGap="14px">
            <HeaderStat label="Avg score"><ScoreReadout score={row.score} size="sm" /></HeaderStat>
            <HeaderStat label="Awaiting review"><HeaderCount value={row.awaitingReview} /></HeaderStat>
            <HeaderStat label="In rework"><HeaderCount value={row.inRework} /></HeaderStat>
            <HeaderStat label="Next planned">
              {row.next ? (
                <Stack direction="row" alignItems="baseline" gap="7px">
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: "text.primary", lineHeight: 1 }}>{fmtDay(row.next.scheduledAt)}</Typography>
                  <Typography sx={{ fontSize: 11, color: "var(--color-text-muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.next.title}</Typography>
                </Stack>
              ) : (
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-muted)" }}>None scheduled</Typography>
              )}
            </HeaderStat>
          </Stack>
        </CardContent>
      </Card>

      {/* Recent checks */}
      <Typography sx={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
        Recent checks
      </Typography>
      {recent.length === 0 ? (
        <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>No checks at this site yet.</Typography>
      ) : (
        <Stack spacing="8px">
          {recent.map((check) => <RecentCheckCard key={check.id} check={check} />)}
        </Stack>
      )}
    </Stack>
  )
}
