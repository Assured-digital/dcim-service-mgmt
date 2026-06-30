// Pure derivations for the dashboard checks panel (DASHBOARD_SPEC §6). No React,
// no tokens — just data in, data out — so the panel/drill components stay thin and
// these are unit-testable in isolation. The colour decision (scoreRagLevel) returns a
// RAGLevel; components resolve it to a token with the active theme mode.
import type { RAGLevel } from "../components/shared"

const DAY_MS = 86_400_000
const NINETY_DAYS_MS = 90 * DAY_MS

// The slice of a Check (GET /checks list payload) the panel consumes. The list returns
// every status (incl. terminal/completed) — same data CheckHistoryPage reads — so the
// scored set (passRate != null) and the next-planned set both come from one query.
// `reworkFlagged` is added to the list item select for this panel (the only backend
// dependency beyond the existing follow-on-summary endpoint).
export type DashCheckItem = { response: string | null; reworkFlagged?: boolean | null }
export type DashCheck = {
  id: string
  reference: string
  title: string
  status: string
  passRate: number | null
  scheduledAt: string | null
  submittedAt: string | null
  completedAt: string | null
  closedAt: string | null
  updatedAt: string
  createdAt: string
  site: { id: string; name: string } | null
  items: DashCheckItem[]
}

// follow-on-summary endpoint shape (checks.controller followOnSummary → followOnCountsBySite):
// per-site OPEN Task/Risk/Issue counts raised from checks. Only sites WITH open follow-ons
// appear; sites with checks but no follow-ons are absent → defaulted to 0 when joined.
export type FollowOnSiteCount = {
  siteId: string
  siteName: string
  tasksFromChecks: number
  risksFromChecks: number
  issuesFromChecks: number
}
export type FollowOnSummary = { sites: FollowOnSiteCount[] }

// Open-follow-on terminal sets — MIRROR the backend (checks.service followOnCountsBySite:
// TASK_TERMINAL=[DONE], RISK/ISSUE terminal=[CLOSED]) so the drill's nested "open follow-ons"
// stay consistent with Part B's per-site counts (which come from that same endpoint).
const FOLLOW_ON_TERMINAL: Record<string, string[]> = {
  Task: ["DONE"],
  Risk: ["CLOSED"],
  Issue: ["CLOSED"],
}
export function isOpenFollowOn(entityType: string, status: string): boolean {
  const terminal = FOLLOW_ON_TERMINAL[entityType]
  return terminal ? !terminal.includes(status) : true
}

// Pass-rate → RAG band — the SAME thresholds as CheckCard's passRateRag (≥80 green /
// ≥60 amber / <60 red). Returned as a level; the component picks the token.
export function scoreRagLevel(v: number): RAGLevel {
  return v >= 80 ? "GREEN" : v >= 60 ? "AMBER" : "RED"
}

// Review-state predicates. A check is "in rework" only when it's been SENT BACK
// (PENDING_REVIEW → IN_PROGRESS, per checkTransitions) carrying reviewer-flagged items —
// a plain IN_PROGRESS check with no flagged item is just normal work, NOT rework.
export function isAwaitingReview(c: DashCheck): boolean {
  return c.status === "PENDING_REVIEW"
}
export function isInRework(c: DashCheck): boolean {
  return c.status === "IN_PROGRESS" && c.items.some((i) => i.reworkFlagged)
}

// When a check acquired its score, for the 90-day baseline. passRate is set at submission;
// the fallback chain mirrors CheckCard.effectiveCompleted (completed → closed → submitted → updated).
function scoredAtMs(c: DashCheck): number | null {
  const iso = c.completedAt ?? c.closedAt ?? c.submittedAt ?? c.updatedAt
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : t
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

// Average score across the client's SCORED checks (passRate != null — a not-yet-scored
// check is EXCLUDED, never counted as 0). The 90-day delta is the cumulative average now
// minus the cumulative average as it stood 90 days ago (scored on/before now − 90d); null
// when there's no prior baseline (a young programme — no honest delta to show, never 0).
export type ScoreSummary = { avg: number | null; delta: number | null; scoredCount: number }
export function scoreSummary(checks: DashCheck[], nowMs: number): ScoreSummary {
  const scored = checks.filter((c) => c.passRate != null) as (DashCheck & { passRate: number })[]
  if (scored.length === 0) return { avg: null, delta: null, scoredCount: 0 }
  const avg = mean(scored.map((c) => c.passRate))
  const cutoff = nowMs - NINETY_DAYS_MS
  const prior = scored.filter((c) => {
    const t = scoredAtMs(c)
    return t != null && t <= cutoff
  })
  const delta = prior.length > 0 ? avg - mean(prior.map((c) => c.passRate)) : null
  return {
    avg: Math.round(avg),
    delta: delta == null ? null : Math.round(delta),
    scoredCount: scored.length,
  }
}

// The soonest upcoming planned check — SCHEDULED/ASSIGNED with a future scheduled date.
// Checks are planned-then-confirmed: there is no "overdue" concept, so a past scheduled
// date is simply not "next" (it's either in progress or awaiting confirmation elsewhere).
export function nextPlanned(checks: DashCheck[], nowMs: number): DashCheck | null {
  const upcoming = checks
    .filter((c) => (c.status === "SCHEDULED" || c.status === "ASSIGNED") && c.scheduledAt)
    .map((c) => ({ c, t: new Date(c.scheduledAt as string).getTime() }))
    .filter((x) => !Number.isNaN(x.t) && x.t >= nowMs)
    .sort((a, b) => a.t - b.t)
  return upcoming[0]?.c ?? null
}

// Client-wide summary strip (Part A): review-state counts + score + next planned.
export type PanelSummary = {
  awaitingReview: number
  inRework: number
  score: ScoreSummary
  next: DashCheck | null
}
export function buildSummary(checks: DashCheck[], nowMs: number): PanelSummary {
  return {
    awaitingReview: checks.filter(isAwaitingReview).length,
    inRework: checks.filter(isInRework).length,
    score: scoreSummary(checks, nowMs),
    next: nextPlanned(checks, nowMs),
  }
}

// Per-site spine (Part B). One row per site that HAS checks; follow-on counts joined from
// the endpoint (0 when a site has checks but no open follow-ons). `attention` (awaiting +
// rework) drives the health dot and the default ordering (most-needing-action first).
export type SiteRow = {
  siteId: string
  siteName: string
  checks: DashCheck[]
  awaitingReview: number
  inRework: number
  attention: number
  score: ScoreSummary
  next: DashCheck | null
  tasksFromChecks: number
  risksFromChecks: number
  issuesFromChecks: number
}

export function buildSiteRows(
  checks: DashCheck[],
  followOns: FollowOnSummary | undefined,
  nowMs: number
): SiteRow[] {
  const bySite = new Map<string, DashCheck[]>()
  for (const c of checks) {
    if (!c.site) continue // null-site checks still count in Part A's client-wide strip, just not the spine
    const arr = bySite.get(c.site.id)
    if (arr) arr.push(c)
    else bySite.set(c.site.id, [c])
  }
  const foBySite = new Map((followOns?.sites ?? []).map((s) => [s.siteId, s]))

  const rows: SiteRow[] = []
  for (const [siteId, siteChecks] of bySite) {
    const siteName = siteChecks[0].site!.name
    const awaitingReview = siteChecks.filter(isAwaitingReview).length
    const inRework = siteChecks.filter(isInRework).length
    const fo = foBySite.get(siteId)
    rows.push({
      siteId,
      siteName,
      checks: siteChecks,
      awaitingReview,
      inRework,
      attention: awaitingReview + inRework,
      score: scoreSummary(siteChecks, nowMs),
      next: nextPlanned(siteChecks, nowMs),
      tasksFromChecks: fo?.tasksFromChecks ?? 0,
      risksFromChecks: fo?.risksFromChecks ?? 0,
      issuesFromChecks: fo?.issuesFromChecks ?? 0,
    })
  }

  const followOnTotal = (r: SiteRow) => r.tasksFromChecks + r.risksFromChecks + r.issuesFromChecks
  rows.sort(
    (a, b) =>
      b.attention - a.attention ||
      followOnTotal(b) - followOnTotal(a) ||
      a.siteName.localeCompare(b.siteName)
  )
  return rows
}

// Most-recent-first ordering for the drill's "Recent checks" list (Part C). Reuses the
// same effective-date fallback as the score baseline so the newest activity leads.
export function recentChecks(checks: DashCheck[], limit: number): DashCheck[] {
  return [...checks]
    .sort((a, b) => (scoredAtMs(b) ?? 0) - (scoredAtMs(a) ?? 0))
    .slice(0, limit)
}
