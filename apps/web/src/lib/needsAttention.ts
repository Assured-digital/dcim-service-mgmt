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
import { formatDurationLong } from "./notifications"
import type { Ticket } from "./tickets"

export type Severity = "breached" | "due-soon" | "unassigned"

// B2 — the feed now merges items from multiple modules; source tags each row so
// the dashboard can show a module chip on the cross-module (DCIM/CRM) ones.
export type NeedsAttentionSource = "servicedesk" | "dcim" | "crm"

export interface NeedsAttentionItem {
  id: string
  severity: Severity
  source: NeedsAttentionSource
  reference: string
  subject: string
  detailPath: string
  /** Directional relative time, disambiguated by severity (the severity word is NOT
   *  repeated): breached "1 day ago" (since breach), due-soon "in 2 hours" (until due),
   *  unassigned "14 days" (since opened). Neutral — the severity dot carries urgency; the
   *  reference is intentionally not surfaced on the dashboard. */
  age: string
}

// Tier order for the merged queue: breached first, then due-soon, then unassigned.
const TIER_RANK: Record<Severity, number> = { breached: 0, "due-soon": 1, unassigned: 2 }

/**
 * Build the prioritised needs-attention queue from the ticket union.
 * Ordered breached → due-soon → unassigned; within each tier by SLA urgency
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

    // Within-tier sort key (display is separate): SLA tiers order by dueAt ascending
    // (most overdue / soonest-due first); unassigned orders by age (oldest first).
    const sortKey = severity === "unassigned" ? createdMs : (dueMs ?? createdMs)
    // Directional time — disambiguates the bare duration by severity WITHOUT repeating the
    // row's severity word: breached shows time SINCE the breach ("1 day ago"), due-soon time
    // UNTIL due ("in 2 hours"), unassigned plain elapsed since opened ("14 days"). The
    // "ago"/"in"/plain form alone signals past-vs-future. breached/due-soon always carry a
    // dueMs (computeSlaStatus only returns those when dueAt is set); the guard falls back to
    // elapsed if somehow absent.
    const age =
      severity === "breached" && dueMs !== null ? `${formatDurationLong(now - dueMs)} ago`
      : severity === "due-soon" && dueMs !== null ? `in ${formatDurationLong(dueMs - now)}`
      : formatDurationLong(now - createdMs)

    ranked.push({
      id: t.id,
      severity,
      source: "servicedesk",
      reference: t.reference,
      subject: t.subject,
      detailPath: t.detailPath,
      age,
      tier: TIER_RANK[severity],
      sortKey,
    })
  }

  ranked.sort((a, b) => a.tier - b.tier || a.sortKey - b.sortKey)
  return ranked.map((r): NeedsAttentionItem => ({
    id: r.id,
    severity: r.severity,
    source: "servicedesk",
    reference: r.reference,
    subject: r.subject,
    detailPath: r.detailPath,
    age: r.age,
  }))
}

// ── Cross-module attention (B2) ─────────────────────────────────────────────
// DCIM + CRM items folded into the same feed, sourced from ready endpoints. Each
// is entitlement/role-gated at the call site (DashboardPage); these builders just
// shape whatever data is passed — undefined/empty in → no items out.

type CapacityOverview = { totals?: { strandedCabinets?: number; expiringReservations?: number } } | null | undefined

export function buildDcimAttention(overview: CapacityOverview): NeedsAttentionItem[] {
  const t = overview?.totals
  if (!t) return []
  const items: NeedsAttentionItem[] = []
  const stranded = t.strandedCabinets ?? 0
  if (stranded > 0) {
    items.push({
      id: "dcim-stranded", severity: "breached", source: "dcim", reference: "capacity",
      subject: `${stranded} cabinet${stranded === 1 ? "" : "s"} at capacity — no room to scale`,
      detailPath: "/dcim/overview", age: "review",
    })
  }
  const expiring = t.expiringReservations ?? 0
  if (expiring > 0) {
    items.push({
      id: "dcim-reservations", severity: "due-soon", source: "dcim", reference: "reservations",
      subject: `${expiring} cabinet reservation${expiring === 1 ? "" : "s"} expiring soon`,
      detailPath: "/dcim/overview", age: "soon",
    })
  }
  return items
}

type Renewal = { id: string; reference?: string; title?: string; renewalDate?: string | null }
type StalledOpp = { id: string; reference?: string; title?: string; stage?: string; daysInStage?: number }

export function buildCrmAttention(
  renewals: Renewal[] | undefined,
  stalled: StalledOpp[] | undefined,
  now = Date.now()
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = []
  const DAY = 86_400_000
  for (const r of renewals ?? []) {
    if (!r.renewalDate) continue
    const due = new Date(r.renewalDate).getTime()
    if (Number.isNaN(due)) continue
    const days = Math.round((due - now) / DAY)
    if (days > 30) continue
    items.push({
      id: `crm-renewal-${r.id}`,
      severity: days <= 0 ? "breached" : "due-soon",
      source: "crm",
      reference: r.reference ?? "renewal",
      subject: `Renewal ${days <= 0 ? "overdue" : "due"}: ${r.title ?? r.reference ?? "work package"}`,
      detailPath: `/work-packages/${r.id}`,
      age: days <= 0 ? `${formatDurationLong(now - due)} ago` : `in ${formatDurationLong(due - now)}`,
    })
  }
  for (const s of stalled ?? []) {
    const d = s.daysInStage ?? 0
    items.push({
      id: `crm-stalled-${s.id}`,
      severity: d > 30 ? "breached" : "due-soon",
      source: "crm",
      reference: s.reference ?? "opportunity",
      subject: `Stalled: ${s.title ?? s.reference ?? "opportunity"}${s.stage ? ` (${s.stage.toLowerCase()})` : ""}`,
      detailPath: `/crm/opportunities/${s.id}`,
      age: `${d}d in stage`,
    })
  }
  return items
}

// Merge module feeds into one severity-ordered list (breached → due-soon →
// unassigned). Stable within a tier (preserves each builder's own ordering).
export function mergeAttention(...lists: NeedsAttentionItem[][]): NeedsAttentionItem[] {
  return lists.flat().sort((a, b) => TIER_RANK[a.severity] - TIER_RANK[b.severity])
}
