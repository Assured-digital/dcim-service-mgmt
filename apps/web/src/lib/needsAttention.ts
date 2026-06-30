// ── Needs-attention selector (dashboard hero list) ──────────────────────────
//
// A single merged, severity-ordered, cross-type action queue derived ENTIRELY
// client-side from the ticket union the dashboard already fetches (useTickets:
// SR/INC/CHG/Task) — no new endpoint. Distinct from the alert band (which shows
// counts); this surfaces the actual prioritised items you work top-to-bottom.
//
// Three severity tiers, computed per open ticket and DEDUPED to one row per
// record (highest tier wins — breached > due-soon > unassigned):
//   • breached   — open item past its SLA due time (computeSlaStatus)
//   • due-soon   — open item approaching its SLA due time (within the 24h window)
//   • unassigned — open item with no assignee
// SLA status reuses computeSlaStatus on each ticket's dueAt (real for SR/INC/Task,
// scheduledEnd-derived for CHG), the same logic the alert band uses. Checks never
// contribute — they are never "overdue" (handled in the checks panel).

import { computeSlaStatus } from "./serviceDeskQueue"
import type { Ticket } from "./tickets"

export type Severity = "breached" | "due-soon" | "unassigned"

export interface NeedsAttentionItem {
  id: string
  severity: Severity
  reference: string
  subject: string
  detailPath: string
  /** Short right-aligned pressure label: "4h over" · "due 2h" · "3d old". */
  pressure: string
}

// Tier order for the merged queue: breached first, then due-soon, then unassigned.
const TIER_RANK: Record<Severity, number> = { breached: 0, "due-soon": 1, unassigned: 2 }

// Compact relative duration: "45m" → "3h" → "2d". Derives each unit from the one
// below so the rounding is consistent; never returns "0m" (clamps to 1m).
function humaniseDuration(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days}d`
}

/**
 * Build the prioritised needs-attention queue from the ticket union.
 * Ordered breached → due-soon → unassigned; within each tier by pressure
 * (most overdue / closest-to-due / oldest first). One row per record.
 */
export function buildNeedsAttention(tickets: Ticket[], now = Date.now()): NeedsAttentionItem[] {
  const ranked: (NeedsAttentionItem & { tier: number; sortKey: number })[] = []

  for (const t of tickets) {
    if (t.chipIntent === "done") continue                     // open work only

    // Highest severity wins — SLA breach/due-soon outrank a missing assignee, so a
    // record that is both breached AND unassigned appears once, as breached.
    const sla = computeSlaStatus(t.dueAt, false, now)
    let severity: Severity
    if (sla === "breached") severity = "breached"
    else if (sla === "due-soon") severity = "due-soon"
    else if (!t.assignee) severity = "unassigned"
    else continue                                             // on-track + assigned → fine

    const dueMs = t.dueAt ? new Date(t.dueAt).getTime() : null
    const createdMs = new Date(t.createdAt).getTime()

    // pressure label + within-tier sort key. SLA tiers order by dueAt ascending
    // (most overdue / soonest-due first); unassigned orders by age (oldest first).
    let pressure: string
    let sortKey: number
    if (severity === "breached" && dueMs !== null) {
      pressure = `${humaniseDuration(now - dueMs)} over`
      sortKey = dueMs
    } else if (severity === "due-soon" && dueMs !== null) {
      pressure = `due ${humaniseDuration(dueMs - now)}`
      sortKey = dueMs
    } else {
      pressure = `${humaniseDuration(now - createdMs)} old`
      sortKey = createdMs
    }

    ranked.push({
      id: t.id,
      severity,
      reference: t.reference,
      subject: t.subject,
      detailPath: t.detailPath,
      pressure,
      tier: TIER_RANK[severity],
      sortKey,
    })
  }

  ranked.sort((a, b) => a.tier - b.tier || a.sortKey - b.sortKey)
  return ranked.map((r): NeedsAttentionItem => ({
    id: r.id,
    severity: r.severity,
    reference: r.reference,
    subject: r.subject,
    detailPath: r.detailPath,
    pressure: r.pressure,
  }))
}
