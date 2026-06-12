import { useQueries } from "@tanstack/react-query"
import { api } from "./api"
import { getSelectedClientId } from "./scope"

// ── Kind + unified ticket shape ────────────────────────────────────────────
export type TicketKind = "SR" | "INC" | "CHG"
export type ChipIntent = "new" | "open" | "wait" | "done" | "overdue"

export interface Ticket {
  id: string
  kind: TicketKind
  reference: string
  subject: string
  /** Raw per-kind status (e.g. INVESTIGATING, PENDING_APPROVAL, WAITING_CUSTOMER). */
  status: string
  /** Derived from status + overdue for chip rendering. */
  chipIntent: ChipIntent
  priority: string
  assignee: { id: string; email: string } | null
  createdAt: string
  updatedAt: string
  overdue: boolean
  /** Implied SLA / scheduled deadline. ISO string. Derived from priority/severity
   *  thresholds for SR / INC, real `scheduledEnd` for CHG. */
  dueAt: string | null
  /** Canonical detail route for this kind. */
  detailPath: string

  // Kind-specific extras (undefined for other kinds).
  severity?: string
  changeType?: string
  scheduledStart?: string | null
  scheduledEnd?: string | null
}

// ── Raw shapes from each endpoint ──────────────────────────────────────────
interface RawSR {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  updatedAt: string
  createdAt: string
  assignee: { id: string; email: string } | null
}

interface RawIncident {
  id: string
  reference: string
  title: string
  status: string
  severity: string
  priority: string
  createdAt: string
  updatedAt: string
  assignee: { id: string; email: string } | null
}

interface RawChange {
  id: string
  reference: string
  title: string
  status: string
  changeType: string
  priority: string
  scheduledStart: string | null
  scheduledEnd: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; email: string } | null
}

// ── Status → chipIntent mappers ────────────────────────────────────────────
const SR_INTENT: Record<string, ChipIntent> = {
  NEW: "new",
  ASSIGNED: "open",
  IN_PROGRESS: "open",
  WAITING_CUSTOMER: "wait",
  COMPLETED: "done",
  CLOSED: "done",
  CANCELLED: "done",
}
const INC_INTENT: Record<string, ChipIntent> = {
  NEW: "new",
  INVESTIGATING: "open",
  MITIGATED: "open",
  RESOLVED: "done",
  CLOSED: "done",
}
const CHG_INTENT: Record<string, ChipIntent> = {
  DRAFT: "new",
  SUBMITTED: "new",
  PENDING_APPROVAL: "wait",
  APPROVED: "open",
  IN_PROGRESS: "open",
  COMPLETED: "done",
  CLOSED: "done",
  REJECTED: "done",
  CANCELLED: "done",
}

function intentFor(kind: TicketKind, status: string): ChipIntent {
  const map = kind === "SR" ? SR_INTENT : kind === "INC" ? INC_INTENT : CHG_INTENT
  return map[status] ?? "new"
}

// ── Due / overdue heuristics ──────────────────────────────────────────────
// No real SLA data in the current API. The implied due-by is derived from
// priority/severity thresholds for SR and INC, and from `scheduledEnd` for
// CHG. `overdue` is just `dueAt < now` for non-terminal statuses.
const HOUR = 1000 * 60 * 60
const ACTIVE_SR = new Set(["NEW", "ASSIGNED", "IN_PROGRESS"])
const ACTIVE_INC = new Set(["NEW", "INVESTIGATING"])
const TERMINAL_CHG = new Set(["COMPLETED", "CLOSED", "CANCELLED", "REJECTED"])

function dueAtSR(r: RawSR): Date {
  const t = r.priority === "critical" ? 4 * HOUR
          : r.priority === "high" ? 12 * HOUR
          : 48 * HOUR
  return new Date(new Date(r.createdAt).getTime() + t)
}

function dueAtIncident(r: RawIncident): Date {
  const t = r.severity === "CRITICAL" ? 1 * HOUR
          : r.severity === "HIGH" ? 4 * HOUR
          : 24 * HOUR
  return new Date(new Date(r.createdAt).getTime() + t)
}

function dueAtChange(r: RawChange): Date | null {
  return r.scheduledEnd ? new Date(r.scheduledEnd) : null
}

// ── Normalisers ────────────────────────────────────────────────────────────
function normaliseSR(r: RawSR, now: number): Ticket {
  const due = dueAtSR(r)
  const overdue = ACTIVE_SR.has(r.status) && due.getTime() < now
  return {
    id: r.id,
    kind: "SR",
    reference: r.reference,
    subject: r.subject,
    status: r.status,
    chipIntent: overdue ? "overdue" : intentFor("SR", r.status),
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    overdue,
    dueAt: due.toISOString(),
    detailPath: `/service-desk/sr/${r.id}`,
  }
}

function normaliseIncident(r: RawIncident, now: number): Ticket {
  const due = dueAtIncident(r)
  const overdue = ACTIVE_INC.has(r.status) && due.getTime() < now
  return {
    id: r.id,
    kind: "INC",
    reference: r.reference,
    subject: r.title,
    status: r.status,
    chipIntent: overdue ? "overdue" : intentFor("INC", r.status),
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    overdue,
    dueAt: due.toISOString(),
    severity: r.severity,
    detailPath: `/service-desk/inc/${r.id}`,
  }
}

function normaliseChange(r: RawChange, now: number): Ticket {
  const due = dueAtChange(r)
  const overdue = !TERMINAL_CHG.has(r.status) && due !== null && due.getTime() < now
  return {
    id: r.id,
    kind: "CHG",
    reference: r.reference,
    subject: r.title,
    status: r.status,
    chipIntent: overdue ? "overdue" : intentFor("CHG", r.status),
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    overdue,
    dueAt: due ? due.toISOString() : null,
    changeType: r.changeType,
    scheduledStart: r.scheduledStart,
    scheduledEnd: r.scheduledEnd,
    detailPath: `/service-desk/chg/${r.id}`,
  }
}

// ── Helpers exposed for callers ───────────────────────────────────────────
/** True when a ticket sits in its initial "newly raised" status. */
export function isNewStatus(t: Ticket): boolean {
  if (t.kind === "SR") return t.status === "NEW"
  if (t.kind === "INC") return t.status === "NEW"
  return t.status === "DRAFT" || t.status === "SUBMITTED"
}

// ── Hook ───────────────────────────────────────────────────────────────────
export interface UseTicketsResult {
  data: Ticket[]
  isLoading: boolean
  error: unknown
}

/**
 * Unified ticket feed: fans out to /service-requests, /incidents, /changes
 * in parallel and normalises each payload into the Ticket shape.
 *
 * Query keys include the selected client id so super-users see fresh data
 * on client switch (a pre-existing bug in the three original pages).
 */
export function useTickets(): UseTicketsResult {
  const clientId = getSelectedClientId() ?? "self"
  const now = Date.now()

  const results = useQueries({
    queries: [
      {
        queryKey: ["tickets", clientId, "sr"],
        queryFn: async () => (await api.get<RawSR[]>("/service-requests")).data,
      },
      {
        queryKey: ["tickets", clientId, "inc"],
        queryFn: async () => (await api.get<RawIncident[]>("/incidents")).data,
      },
      {
        queryKey: ["tickets", clientId, "chg"],
        queryFn: async () => (await api.get<RawChange[]>("/changes")).data,
      },
    ],
  })

  const [srQ, incQ, chgQ] = results
  const isLoading = results.some(r => r.isLoading)
  const error = results.find(r => r.error)?.error ?? null

  const data: Ticket[] = [
    ...((srQ.data ?? []).map(r => normaliseSR(r, now))),
    ...((incQ.data ?? []).map(r => normaliseIncident(r, now))),
    ...((chgQ.data ?? []).map(r => normaliseChange(r, now))),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return { data, isLoading, error }
}

// ── Detail-field specs per kind ────────────────────────────────────────────
export const KIND_DETAIL_FIELDS: Record<TicketKind, string[]> = {
  SR:  ["requester", "channel", "category", "sla", "opened", "updated"],
  INC: ["severity", "firstResponse", "sla", "opened", "updated"],
  CHG: ["changeType", "scheduledStart", "scheduledEnd", "approvals", "implementationNotes", "postImplReview", "opened", "updated"],
}

// ── Status-flow specs per kind (lifted from the three detail pages) ────────
export const STATUS_FLOW: Record<TicketKind, Record<string, string[]>> = {
  SR: {
    NEW: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
    ASSIGNED: ["IN_PROGRESS", "WAITING_CUSTOMER", "CANCELLED"],
    IN_PROGRESS: ["WAITING_CUSTOMER", "COMPLETED", "CANCELLED"],
    WAITING_CUSTOMER: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
    COMPLETED: ["CLOSED"],
    CLOSED: [],
    CANCELLED: [],
  },
  INC: {
    NEW: ["INVESTIGATING", "CLOSED"],
    INVESTIGATING: ["MITIGATED", "RESOLVED", "CLOSED"],
    MITIGATED: ["INVESTIGATING", "RESOLVED", "CLOSED"],
    RESOLVED: ["CLOSED"],
    CLOSED: [],
  },
  CHG: {
    DRAFT: ["SUBMITTED", "CANCELLED"],
    SUBMITTED: ["PENDING_APPROVAL", "CANCELLED"],
    PENDING_APPROVAL: ["APPROVED", "REJECTED"],
    APPROVED: ["IN_PROGRESS", "CANCELLED"],
    REJECTED: [],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: ["CLOSED"],
    CLOSED: [],
    CANCELLED: [],
  },
}

// Full human-readable type label per kind (e.g. the working-queue rail row).
// Canonical source — prefer this over ad-hoc per-call-site labels.
export const KIND_LABELS: Record<TicketKind, string> = {
  SR:  "Service Request",
  INC: "Incident",
  CHG: "Change Request",
}

export const STATUS_LABELS: Record<TicketKind, Record<string, string>> = {
  SR: {
    NEW: "New",
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In progress",
    WAITING_CUSTOMER: "Waiting on customer",
    COMPLETED: "Completed",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  },
  INC: {
    NEW: "New",
    INVESTIGATING: "Investigating",
    MITIGATED: "Mitigated",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
  },
  CHG: {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    PENDING_APPROVAL: "Pending approval",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  },
}

// Kind-specific detail endpoint (used to build legacy redirects).
export function detailPathFor(kind: TicketKind, id: string): string {
  switch (kind) {
    case "SR":  return `/service-desk/sr/${id}`
    case "INC": return `/service-desk/inc/${id}`
    case "CHG": return `/service-desk/chg/${id}`
  }
}
