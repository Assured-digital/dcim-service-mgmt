import { useQueries } from "@tanstack/react-query"
import { api } from "./api"
import { getSelectedClientId } from "./scope"
import {
  deriveRag, RISK_STATUS_LABELS, ISSUE_STATUS_LABELS,
  type Risk as RawRisk, type Issue as RawIssue,
} from "./risksIssuesQueue"

// ── Kind + unified ticket shape ────────────────────────────────────────────
// The Service Desk queue unifies the six governed work-items. RSK/ISS (Risks &
// Issues) were merged in — they carry a RAG `ragSeverity` instead of a ticket
// `priority`, and never participate in the new/awaiting/overdue views.
export type TicketKind = "SR" | "INC" | "CHG" | "TASK" | "RSK" | "ISS"
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
  assignee: { id: string; displayName: string } | null
  createdAt: string
  updatedAt: string
  overdue: boolean
  /** Due date. ISO string. Real persisted `dueAt` for SR / INC / TASK; derived
   *  from `scheduledEnd` for CHG. Null when no due date is set. */
  dueAt: string | null
  /** Canonical detail route for this kind. */
  detailPath: string

  // Kind-specific extras (undefined for other kinds).
  severity?: string
  changeType?: string
  scheduledStart?: string | null
  scheduledEnd?: string | null
  /** RAG severity (RED/AMBER/GREEN) for RSK/ISS — the Priority column renders this
   *  as a RAG pill instead of the ticket PriorityPill. Undefined for tickets. */
  ragSeverity?: string
}

// ── Raw shapes from each endpoint ──────────────────────────────────────────
interface RawSR {
  id: string
  reference: string
  subject: string
  status: string
  priority: string
  dueAt: string | null
  updatedAt: string
  createdAt: string
  assignee: { id: string; displayName: string } | null
}

interface RawIncident {
  id: string
  reference: string
  title: string
  status: string
  severity: string
  priority: string
  dueAt: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; displayName: string } | null
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
  assignee: { id: string; displayName: string } | null
}

interface RawTask {
  id: string
  reference: string
  title: string
  status: string
  priority: string
  dueAt: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; displayName: string } | null
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
// Task keeps its own status model (Open/In Progress/Blocked/Done). Locked
// mapping onto the queue's saved views: OPEN/IN_PROGRESS → open, BLOCKED →
// wait (shows under "Awaiting"), DONE → done (Closed). Tasks never bucket as
// "new" (see isNewStatus); overdue is computed from the real dueAt below.
const TASK_INTENT: Record<string, ChipIntent> = {
  OPEN: "open",
  IN_PROGRESS: "open",
  BLOCKED: "wait",
  DONE: "done",
}
// Risk / Issue statuses map onto the shared chip intents. They never bucket as
// "new" (isNewStatus returns false for RSK/ISS) so active R&I read as "open".
const RISK_INTENT: Record<string, ChipIntent> = {
  IDENTIFIED: "open",
  UNDER_REVIEW: "open",
  MITIGATING: "open",
  ACCEPTED: "done",
  CLOSED: "done",
}
const ISSUE_INTENT: Record<string, ChipIntent> = {
  OPEN: "open",
  IN_PROGRESS: "open",
  RESOLVED: "done",
  CLOSED: "done",
}

function intentFor(kind: TicketKind, status: string): ChipIntent {
  const map =
    kind === "SR" ? SR_INTENT
    : kind === "INC" ? INC_INTENT
    : kind === "CHG" ? CHG_INTENT
    : kind === "RSK" ? RISK_INTENT
    : kind === "ISS" ? ISSUE_INTENT
    : TASK_INTENT
  return map[status] ?? "new"
}

// ── Due / overdue rules ────────────────────────────────────────────────────
// SR/INC/Task carry a real persisted dueAt; CHG derives its due-by from
// `scheduledEnd`. `overdue` is `dueAt < now` for non-terminal statuses
// (status-gated per type below). No SLA-policy layer — a ticket with no dueAt
// is never overdue.
const ACTIVE_SR = new Set(["NEW", "ASSIGNED", "IN_PROGRESS"])
const ACTIVE_INC = new Set(["NEW", "INVESTIGATING"])
const TERMINAL_CHG = new Set(["COMPLETED", "CLOSED", "CANCELLED", "REJECTED"])

function dueAtChange(r: RawChange): Date | null {
  return r.scheduledEnd ? new Date(r.scheduledEnd) : null
}

// ── Normalisers ────────────────────────────────────────────────────────────
function normaliseSR(r: RawSR, now: number): Ticket {
  const due = r.dueAt ? new Date(r.dueAt) : null
  const overdue = due !== null && ACTIVE_SR.has(r.status) && due.getTime() < now
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
    dueAt: due ? due.toISOString() : null,
    detailPath: `/service-desk/sr/${r.id}`,
  }
}

function normaliseIncident(r: RawIncident, now: number): Ticket {
  const due = r.dueAt ? new Date(r.dueAt) : null
  const overdue = due !== null && ACTIVE_INC.has(r.status) && due.getTime() < now
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
    dueAt: due ? due.toISOString() : null,
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

function normaliseTask(r: RawTask, now: number): Ticket {
  // Like SR/INC, a Task carries a real persisted dueAt (CHG instead derives its
  // due-by from scheduledEnd). Overdue = a due date in the past while not yet DONE.
  const due = r.dueAt ? new Date(r.dueAt) : null
  const overdue = due !== null && r.status !== "DONE" && due.getTime() < now
  return {
    id: r.id,
    kind: "TASK",
    reference: r.reference,
    subject: r.title,
    status: r.status,
    chipIntent: overdue ? "overdue" : intentFor("TASK", r.status),
    priority: r.priority,
    assignee: r.assignee,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    overdue,
    dueAt: due ? due.toISOString() : null,
    detailPath: `/service-desk/task/${r.id}`,
  }
}

// Risk / Issue: no ticket priority (RAG severity instead) and no due/overdue
// concept in the queue — they carry a review date, surfaced on their detail page,
// not as a queue overdue. So overdue=false, dueAt=null; ragSeverity drives the
// Priority column. Risk severity is derived (likelihood×impact); Issue is raw RAG.
function normaliseRisk(r: RawRisk): Ticket {
  return {
    id: r.id,
    kind: "RSK",
    reference: r.reference,
    subject: r.title,
    status: r.status,
    chipIntent: intentFor("RSK", r.status),
    priority: "",
    assignee: r.assignee,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    overdue: false,
    dueAt: null,
    ragSeverity: deriveRag(r.likelihood, r.impact),
    detailPath: `/service-desk/risk/${r.id}`,
  }
}

function normaliseIssue(i: RawIssue): Ticket {
  return {
    id: i.id,
    kind: "ISS",
    reference: i.reference,
    subject: i.title,
    status: i.status,
    chipIntent: intentFor("ISS", i.status),
    priority: "",
    assignee: i.assignee,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    overdue: false,
    dueAt: null,
    ragSeverity: i.severity,
    detailPath: `/service-desk/issue/${i.id}`,
  }
}

// ── Helpers exposed for callers ───────────────────────────────────────────
/** True when a ticket sits in its initial "newly raised" status. */
export function isNewStatus(t: Ticket): boolean {
  if (t.kind === "SR") return t.status === "NEW"
  if (t.kind === "INC") return t.status === "NEW"
  if (t.kind === "TASK") return false   // Task has no "new" state; OPEN is its initial active status.
  if (t.kind === "RSK" || t.kind === "ISS") return false  // R&I don't participate in the "new" view.
  return t.status === "DRAFT" || t.status === "SUBMITTED"
}

// ── Hook ───────────────────────────────────────────────────────────────────
export interface UseTicketsResult {
  data: Ticket[]
  isLoading: boolean
  error: unknown
  /** True while any of the four ticket queries is fetching (incl. background refetch). */
  isFetching: boolean
  /** Epoch ms of the most recent successful fetch across the four queries (0 if none).
   *  Feeds the dashboard's point-in-time "data as of" stamp. */
  dataUpdatedAt: number
  /** Refetch all four ticket queries (e.g. the dashboard's manual Refresh). */
  refetch: () => void
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
      {
        queryKey: ["tickets", clientId, "task"],
        queryFn: async () => (await api.get<RawTask[]>("/tasks")).data,
      },
      {
        queryKey: ["tickets", clientId, "risk"],
        queryFn: async () => (await api.get<RawRisk[]>("/risks")).data,
      },
      {
        queryKey: ["tickets", clientId, "issue"],
        queryFn: async () => (await api.get<RawIssue[]>("/issues")).data,
      },
    ],
  })

  const [srQ, incQ, chgQ, taskQ, riskQ, issueQ] = results
  const isLoading = results.some(r => r.isLoading)
  const isFetching = results.some(r => r.isFetching)
  const error = results.find(r => r.error)?.error ?? null
  const dataUpdatedAt = results.reduce((max, r) => Math.max(max, r.dataUpdatedAt), 0)
  const refetch = () => results.forEach(r => r.refetch())

  const data: Ticket[] = [
    ...((srQ.data ?? []).map(r => normaliseSR(r, now))),
    ...((incQ.data ?? []).map(r => normaliseIncident(r, now))),
    ...((chgQ.data ?? []).map(r => normaliseChange(r, now))),
    ...((taskQ.data ?? []).map(r => normaliseTask(r, now))),
    ...(((riskQ.data ?? []) as RawRisk[]).map(r => normaliseRisk(r))),
    ...(((issueQ.data ?? []) as RawIssue[]).map(i => normaliseIssue(i))),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return { data, isLoading, error, isFetching, dataUpdatedAt, refetch }
}

// ── Detail-field specs per kind ────────────────────────────────────────────
export const KIND_DETAIL_FIELDS: Record<TicketKind, string[]> = {
  SR:  ["requester", "channel", "category", "sla", "opened", "updated"],
  INC: ["severity", "firstResponse", "sla", "opened", "updated"],
  CHG: ["changeType", "scheduledStart", "scheduledEnd", "approvals", "implementationNotes", "postImplReview", "opened", "updated"],
  TASK: ["priority", "assignee", "dueAt", "opened", "updated"],
  RSK: ["likelihood", "impact", "assignee", "reviewDate", "opened", "updated"],
  ISS: ["severity", "assignee", "reviewDate", "opened", "updated"],
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
  // Mirrors config/transitions/taskTransitions.ts (OPEN ↔ IN_PROGRESS ↔ BLOCKED → DONE → reopen).
  TASK: {
    OPEN: ["IN_PROGRESS", "BLOCKED", "DONE"],
    IN_PROGRESS: ["OPEN", "BLOCKED", "DONE"],
    BLOCKED: ["OPEN", "IN_PROGRESS", "DONE"],
    DONE: ["OPEN"],
  },
  // Risk/Issue transitions live in config/transitions/{risk,issue}Transitions.ts and
  // are driven by their own detail pages — the queue doesn't transition them, so
  // these stay empty (present only to satisfy the exhaustive Record).
  RSK: {},
  ISS: {},
}

// Full human-readable type label per kind (e.g. the working-queue rail row).
// Canonical source — prefer this over ad-hoc per-call-site labels.
export const KIND_LABELS: Record<TicketKind, string> = {
  SR:  "Service Request",
  INC: "Incident",
  CHG: "Change Request",
  TASK: "Task",
  RSK: "Risk",
  ISS: "Issue",
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
  TASK: {
    OPEN: "Open",
    IN_PROGRESS: "In progress",
    BLOCKED: "Blocked",
    DONE: "Done",
  },
  RSK: RISK_STATUS_LABELS,
  ISS: ISSUE_STATUS_LABELS,
}

// Kind-specific detail endpoint (used to build legacy redirects).
export function detailPathFor(kind: TicketKind, id: string): string {
  switch (kind) {
    case "SR":  return `/service-desk/sr/${id}`
    case "INC": return `/service-desk/inc/${id}`
    case "CHG": return `/service-desk/chg/${id}`
    case "TASK": return `/service-desk/task/${id}`
    case "RSK": return `/service-desk/risk/${id}`
    case "ISS": return `/service-desk/issue/${id}`
  }
}
