// ── Risks & Issues queue: shared types + params + selector ──────────────────
//
// Single source of truth for turning the URL query params (?view/?type/?q) plus
// the raw risk + issue lists into the unified, sorted row set. Pure functions (no
// hooks) so BOTH the depth-0 grid (RisksIssuesPage) and the depth-1 working-queue
// rail (RisksIssuesQueueRail) derive the SAME list from the SAME params with no
// duplicated logic. Mirrors lib/serviceDeskQueue.ts (the Service Desk equivalent).

export type Assignee = { id: string; displayName: string } | null

export type Risk = {
  id: string; reference: string; title: string; description: string
  likelihood: string; impact: string; status: string
  mitigationPlan: string | null; source: string | null
  reviewDate: string | null; closedAt: string | null
  createdAt: string; updatedAt: string; assignee: Assignee
}

export type Issue = {
  id: string; reference: string; title: string; description: string
  severity: string; status: string; resolution: string | null
  reviewDate: string | null; closedAt: string | null
  createdAt: string; updatedAt: string; assignee: Assignee
}

export type TypeFilter = "all" | "risks" | "issues"
export type QuickView = "all" | "assigned" | "urgent" | "review_due"

// One grid/rail row, type-tagged. `id` is prefixed (RSK-/ISS-) so the merged set
// has unique DataGrid row ids; `rawId` + `detailPath` drive navigation (shared by
// the grid's row click and the rail's row click).
export type UnifiedRow = {
  kind: "RSK" | "ISS"
  id: string
  rawId: string
  detailPath: string
  reference: string
  title: string
  status: string
  severityKey: string
  severityLabel: string
  assignee: Assignee
  createdAt: string
  updatedAt: string
}

export const RISK_STATUSES = ["IDENTIFIED", "UNDER_REVIEW", "MITIGATING", "ACCEPTED", "CLOSED"]
export const RISK_STATUS_LABELS: Record<string, string> = { IDENTIFIED: "Identified", UNDER_REVIEW: "Under review", MITIGATING: "Mitigating", ACCEPTED: "Accepted", CLOSED: "Closed" }

export const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]
export const ISSUE_STATUS_LABELS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" }

export const RAG_LABELS: Record<string, string> = { RED: "High", AMBER: "Medium", GREEN: "Low" }

export function deriveRag(likelihood: string, impact: string): "RED" | "AMBER" | "GREEN" {
  const score = (v: string) => (v === "HIGH" ? 3 : v === "MEDIUM" ? 2 : 1)
  const s = score(likelihood) * score(impact)
  return s >= 6 ? "RED" : s >= 3 ? "AMBER" : "GREEN"
}

export function reviewStatus(reviewDate: string | null, status: string): "overdue" | "due_soon" | "ok" | "none" | "closed" {
  if (status === "CLOSED") return "closed"
  if (!reviewDate) return "none"
  const d = new Date(reviewDate)
  const now = new Date()
  const in7 = new Date(now.getTime() + 7 * 86400000)
  if (d < now) return "overdue"
  if (d < in7) return "due_soon"
  return "ok"
}

export interface RIQueueParams {
  quickView: QuickView
  typeFilter: TypeFilter
  qParam: string
}

const QUICK_VIEWS: QuickView[] = ["all", "assigned", "urgent", "review_due"]

/** Decode the queue state from the URL. Mirrors RisksIssuesPage's depth-0 read. */
export function parseRIParams(sp: URLSearchParams): RIQueueParams {
  const rawView = sp.get("view")
  const rawType = sp.get("type")
  return {
    quickView: QUICK_VIEWS.includes(rawView as QuickView) ? (rawView as QuickView) : "all",
    typeFilter: rawType === "risks" ? "risks" : rawType === "issues" ? "issues" : "all",
    qParam: sp.get("q") ?? "",
  }
}

// Whether a record passes the active saved view. `rag` is the RED/AMBER/GREEN
// severity key (derived for risks, raw for issues); `isMine` is assignee === me.
function passesQuickView(qv: QuickView, rag: string, review: string, isMine: boolean): boolean {
  if (qv === "urgent") return rag === "RED"
  if (qv === "review_due") return review === "overdue"
  if (qv === "assigned") return isMine
  return true
}

/**
 * Merge filtered risks + issues into the unified, sorted row set the grid and rail
 * both render. Applies the saved view (quickView), the type filter, and free-text
 * search; sorts by updatedAt descending (the grid's default order).
 */
export function buildUnifiedRows(
  risks: Risk[],
  issues: Issue[],
  p: RIQueueParams,
  myId?: string,
): UnifiedRow[] {
  const q = p.qParam.trim().toLowerCase()
  const rows: UnifiedRow[] = []

  if (p.typeFilter !== "issues") {
    for (const r of risks) {
      const rag = deriveRag(r.likelihood, r.impact)
      if (!passesQuickView(p.quickView, rag, reviewStatus(r.reviewDate, r.status), !!myId && r.assignee?.id === myId)) continue
      rows.push({
        kind: "RSK",
        id: `RSK-${r.id}`,
        rawId: r.id,
        detailPath: `/service-desk/risk/${r.id}`,
        reference: r.reference,
        title: r.title,
        status: r.status,
        severityKey: rag,
        severityLabel: RAG_LABELS[rag] ?? rag,
        assignee: r.assignee,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
    }
  }

  if (p.typeFilter !== "risks") {
    for (const i of issues) {
      if (!passesQuickView(p.quickView, i.severity, reviewStatus(i.reviewDate, i.status), !!myId && i.assignee?.id === myId)) continue
      rows.push({
        kind: "ISS",
        id: `ISS-${i.id}`,
        rawId: i.id,
        detailPath: `/service-desk/issue/${i.id}`,
        reference: i.reference,
        title: i.title,
        status: i.status,
        severityKey: i.severity,
        severityLabel: RAG_LABELS[i.severity] ?? i.severity,
        assignee: i.assignee,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })
    }
  }

  const filtered = q
    ? rows.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.reference.toLowerCase().includes(q) ||
        (r.assignee?.displayName ?? "").toLowerCase().includes(q),
      )
    : rows

  filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return filtered
}
