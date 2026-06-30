// ── Recent-activity selector (dashboard context feed) ───────────────────────
//
// A dense, most-recent-first feed of the latest activity across every record type
// the dashboard already fetches (tickets via useTickets — SR/INC/CHG/Task — plus
// risks, issues, checks). NO new endpoint, and distinct from needs-attention: this
// is *context* ("what's been happening"), not an action list.
//
// There is no audit/event log, so each row's plain-language line is DERIVED from the
// record's current state + recency (the honest best signal available from the flat
// lists): a record untouched since creation reads as newly-raised; a terminal record
// reads as resolved/closed; an assigned-but-active record reads as "assigned to X";
// otherwise it falls back to its current status. Ordered by `updatedAt` (most recent
// activity first) and capped — the same union/sort/cap the old dashboard used, enriched.

import { formatDurationLong } from "./notifications"
import { STATUS_LABELS, type Ticket } from "./tickets"
import type { Risk, Issue } from "./risksIssuesQueue"
import type { DashCheck } from "./checksPanel"

export interface RecentActivityItem {
  id: string
  /** Plain-language line, e.g. "SR-4465 resolved" / "INC-0012 assigned to Megan Doyle". */
  line: string
  /** Relative time of the activity, e.g. "27 minutes ago" / "1 day ago". */
  ago: string
  /** Canonical detail route — clickable; drill-through is role-gated downstream. */
  detailPath: string
}

const ms = (iso: string): number => new Date(iso).getTime()

// Prisma stamps createdAt === updatedAt on insert, so a near-zero gap means the record
// has NOT been meaningfully touched since creation → read it as "newly raised". A small
// window absorbs serialisation/clock jitter without swallowing a real later edit.
const FRESH_WINDOW_MS = 2_000
const isFresh = (createdAt: string, updatedAt: string): boolean =>
  ms(updatedAt) - ms(createdAt) < FRESH_WINDOW_MS

// Past-tense verb for a terminal record, keyed by raw status (shared SR/INC/CHG/Task).
const DONE_VERB: Record<string, string> = {
  COMPLETED: "completed", CLOSED: "closed", CANCELLED: "cancelled",
  RESOLVED: "resolved", REJECTED: "rejected", DONE: "completed",
}
const TICKET_CREATED_VERB: Record<string, string> = { SR: "raised", INC: "raised", CHG: "raised", TASK: "created" }

function ticketPhrase(t: Ticket): string {
  if (isFresh(t.createdAt, t.updatedAt)) return TICKET_CREATED_VERB[t.kind] ?? "raised"
  if (t.chipIntent === "done") return DONE_VERB[t.status] ?? "closed"
  if (t.assignee) return `assigned to ${t.assignee.displayName}`
  return (STATUS_LABELS[t.kind][t.status] ?? "updated").toLowerCase()
}

// Risks / Issues share the create→assign→resolve shape; only the terminal verbs differ.
const RISK_DONE: Record<string, string> = { ACCEPTED: "accepted", CLOSED: "closed" }
const ISSUE_DONE: Record<string, string> = { RESOLVED: "resolved", CLOSED: "closed" }
const prettyStatus = (status: string): string => status.toLowerCase().replace(/_/g, " ")

function riPhrase(
  done: Record<string, string>,
  status: string,
  assignee: { displayName: string } | null,
  fresh: boolean,
): string {
  if (fresh) return "raised"
  if (done[status]) return done[status]
  if (assignee) return `assigned to ${assignee.displayName}`
  return prettyStatus(status)
}

// Checks are planned→worked→reviewed→completed (never "overdue"); the review-state
// verbs carry the meaningful signal ("submitted for review" = awaiting a reviewer).
const CHECK_PHRASE: Record<string, string> = {
  SCHEDULED: "scheduled", ASSIGNED: "assigned", IN_PROGRESS: "in progress",
  PENDING_REVIEW: "submitted for review", COMPLETED: "completed", CLOSED: "closed", CANCELLED: "cancelled",
}
function checkPhrase(c: DashCheck): string {
  if (isFresh(c.createdAt, c.updatedAt)) return "scheduled"
  return CHECK_PHRASE[c.status] ?? "updated"
}

/**
 * Merge the latest activity across all record types into one most-recent-first feed.
 * Each source contributes `{ ref + derived phrase, updatedAt, detail route }`; the
 * union is sorted by recency and capped at `limit` (the feed's ceiling — the dashboard
 * shows a collapsed slice of this and expands inline up to the ceiling via "Show more").
 */
export function buildRecentActivity(
  tickets: Ticket[],
  risks: Risk[],
  issues: Issue[],
  checks: DashCheck[],
  now = Date.now(),
  limit = 20,
): RecentActivityItem[] {
  type Raw = { id: string; line: string; at: number; detailPath: string }
  const raw: Raw[] = []

  for (const t of tickets)
    raw.push({ id: `t-${t.id}`, line: `${t.reference} ${ticketPhrase(t)}`, at: ms(t.updatedAt), detailPath: t.detailPath })
  for (const r of risks)
    raw.push({ id: `r-${r.id}`, line: `${r.reference} ${riPhrase(RISK_DONE, r.status, r.assignee, isFresh(r.createdAt, r.updatedAt))}`, at: ms(r.updatedAt), detailPath: `/risks-issues/risks/${r.id}` })
  for (const i of issues)
    raw.push({ id: `i-${i.id}`, line: `${i.reference} ${riPhrase(ISSUE_DONE, i.status, i.assignee, isFresh(i.createdAt, i.updatedAt))}`, at: ms(i.updatedAt), detailPath: `/risks-issues/issues/${i.id}` })
  for (const c of checks)
    raw.push({ id: `c-${c.id}`, line: `${c.reference} ${checkPhrase(c)}`, at: ms(c.updatedAt), detailPath: `/checks/${c.id}` })

  return raw
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((x) => ({ id: x.id, line: x.line, ago: `${formatDurationLong(Math.max(0, now - x.at))} ago`, detailPath: x.detailPath }))
}
