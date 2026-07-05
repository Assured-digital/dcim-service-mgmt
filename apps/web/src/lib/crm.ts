import { api } from "./api"

// ── CRM shared types + helpers (CRM_DESIGN.md §7) ─────────────────────────
// Phase 1: contacts. Activity/Opportunity/Quote types join here in later phases.

export type ContactView = {
  id: string
  clientId: string
  firstName: string
  lastName: string
  jobTitle: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  siteId: string | null
  site: { id: string; name: string } | null
  category: string
  isPrimary: boolean
  userId: string | null
  notes: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export const CONTACT_CATEGORIES = [
  "DECISION_MAKER",
  "TECHNICAL",
  "BILLING",
  "OPERATIONS",
  "ACCESS",
  "GENERAL"
] as const
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number]

export const CONTACT_CATEGORY_LABELS: Record<string, string> = {
  DECISION_MAKER: "Decision maker",
  TECHNICAL: "Technical",
  BILLING: "Billing",
  OPERATIONS: "Operations",
  ACCESS: "Access",
  GENERAL: "General"
}

export function contactDisplayName(c: Pick<ContactView, "firstName" | "lastName">) {
  return `${c.firstName} ${c.lastName}`.trim()
}

// Client lifecycle (CRM_DESIGN.md §2) — lives on the Client record.
export const CLIENT_LIFECYCLE_STAGES = ["PROSPECT", "ONBOARDING", "ACTIVE", "FORMER"] as const
export const LIFECYCLE_STAGE_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  ONBOARDING: "Onboarding",
  ACTIVE: "Active",
  FORMER: "Former"
}

export type ContactInput = {
  firstName: string
  lastName: string
  jobTitle?: string
  email?: string
  phone?: string
  mobile?: string
  siteId?: string
  category?: string
  isPrimary?: boolean
  notes?: string
  status?: string
}

// ── Activities (phase 2) ──────────────────────────────────────────────────
export type ActivityView = {
  id: string
  clientId: string
  type: string
  source: string
  subject: string
  body: string | null
  occurredAt: string
  createdById: string | null
  createdBy: { id: string; displayName: string | null } | null
  contacts: Array<{ id: string; firstName: string; lastName: string }>
  createdAt: string
  updatedAt: string
}

export const ACTIVITY_TYPES = ["CALL", "MEETING", "EMAIL", "SITE_VISIT", "NOTE"] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CALL: "Call",
  MEETING: "Meeting",
  EMAIL: "Email",
  SITE_VISIT: "Site visit",
  NOTE: "Note"
}

export type ActivityInput = {
  type: string
  subject: string
  body?: string
  occurredAt?: string
  contactIds?: string[]
}

export type FollowUpInput = {
  title: string
  description?: string
  dueAt?: string
  assigneeId?: string
}

export async function listActivities(filters?: { type?: string; contactId?: string; from?: string; to?: string }) {
  return (await api.get<ActivityView[]>("/activities", { params: filters })).data
}

export async function createActivity(dto: ActivityInput) {
  return (await api.post<ActivityView>("/activities", dto)).data
}

export async function updateActivity(id: string, dto: Partial<ActivityInput>) {
  return (await api.patch<ActivityView>(`/activities/${id}`, dto)).data
}

export async function createActivityFollowUp(id: string, dto: FollowUpInput) {
  return (await api.post(`/activities/${id}/follow-up`, dto)).data
}

// ── Opportunities / pipeline (phase 3) ────────────────────────────────────
// NB: `value` and `probability` are ABSENT from API responses for field roles
// (ENGINEER / SERVICE_DESK_ANALYST) — commercial-figure RBAC, CRM_DESIGN.md
// decision 12. All consumers must handle undefined.
export type OpportunityView = {
  id: string
  clientId: string
  reference: string
  title: string
  type: string
  stage: string
  lastStageChangeAt: string
  probability?: number | null
  value?: number | null
  currency: string
  expectedCloseDate: string | null
  nextStep: string | null
  nextStepDate: string | null
  ownerId: string | null
  owner?: { id: string; displayName: string | null } | null
  contactId: string | null
  contact: { id: string; firstName: string; lastName: string } | null
  workPackageId: string | null
  workPackage: { id: string; reference: string; title: string } | null
  renewsWorkPackageId: string | null
  renewsWorkPackage: { id: string; reference: string; title: string } | null
  lostReason: string | null
  lostDetail: string | null
  notes: string | null
  createdById: string
  createdBy?: { id: string; displayName: string } | null
  client?: { id: string; name: string; lifecycleStage: string } | null
  createdAt: string
  updatedAt: string
}

export const OPPORTUNITY_STAGES = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const
export const OPEN_STAGES = ["DISCOVERY", "QUALIFIED", "PROPOSAL", "NEGOTIATION"] as const
export const OPPORTUNITY_STAGE_LABELS: Record<string, string> = {
  DISCOVERY: "Discovery",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost"
}

export const OPPORTUNITY_TYPES = ["NEW_BUSINESS", "RENEWAL", "EXPANSION"] as const
export const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  NEW_BUSINESS: "New business",
  RENEWAL: "Renewal",
  EXPANSION: "Expansion"
}

export const LOST_REASONS = ["PRICE", "COMPETITOR", "NO_DECISION", "TIMING", "SCOPE", "RELATIONSHIP"] as const
export const LOST_REASON_LABELS: Record<string, string> = {
  PRICE: "Price",
  COMPETITOR: "Lost to competitor",
  NO_DECISION: "No decision",
  TIMING: "Timing",
  SCOPE: "Scope mismatch",
  RELATIONSHIP: "Relationship"
}

// Days-in-stage beyond which a deal shows the rotting badge (per-stage; the
// time-in-stage signal every major CRM converged on).
export const STAGE_ROT_DAYS: Record<string, number> = {
  DISCOVERY: 21,
  QUALIFIED: 21,
  PROPOSAL: 14,
  NEGOTIATION: 14
}

export function isRotting(o: Pick<OpportunityView, "stage" | "lastStageChangeAt" | "nextStepDate">) {
  const limit = STAGE_ROT_DAYS[o.stage]
  if (!limit) return false // terminal stages never rot
  const ageDays = (Date.now() - new Date(o.lastStageChangeAt).getTime()) / 86_400_000
  if (ageDays > limit) return true
  // A past-due next step also counts as stalled (hygiene rule).
  return !!o.nextStepDate && new Date(o.nextStepDate).getTime() < Date.now()
}

export function formatMoney(value: number | null | undefined, currency = "GBP") {
  if (value === null || value === undefined) return null
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
}

export type OpportunityInput = {
  title: string
  type?: string
  value?: number
  expectedCloseDate?: string
  nextStep?: string
  nextStepDate?: string
  ownerId?: string
  contactId?: string
  renewsWorkPackageId?: string
  notes?: string
}

export type OpportunityPatch = Partial<OpportunityInput> & {
  stage?: string
  probability?: number
  lostReason?: string
  lostDetail?: string
}

export async function listOpportunities(filters?: { stage?: string; type?: string; ownerId?: string }) {
  return (await api.get<OpportunityView[]>("/opportunities", { params: filters })).data
}

export async function getOpportunity(id: string) {
  return (await api.get<OpportunityView>(`/opportunities/${id}`)).data
}

export async function createOpportunity(dto: OpportunityInput) {
  return (await api.post<OpportunityView>("/opportunities", dto)).data
}

export async function updateOpportunity(id: string, dto: OpportunityPatch) {
  return (await api.patch<OpportunityView>(`/opportunities/${id}`, dto)).data
}

export async function createWorkPackageFromOpportunity(id: string, dto?: { title?: string; type?: string; startDate?: string; endDate?: string }) {
  return (await api.post(`/opportunities/${id}/work-package`, dto ?? {})).data
}

// ── SharePoint documents (phase 7a) ───────────────────────────────────────
export type DriveItem = {
  id: string
  name: string
  webUrl: string
  size?: number
  lastModifiedDateTime?: string
  isFolder: boolean
  childCount?: number
  mimeType?: string
}

// Discriminated result — the UI distinguishes integration-off / no-folder / ok.
export type DocumentsResult =
  | { status: "disabled" }
  | { status: "unmapped" }
  | { status: "ok"; folderPath: string; subPath: string; items: DriveItem[] }

export type DocumentsSearchResult =
  | { status: "disabled" }
  | { status: "unmapped" }
  | { status: "ok"; items: DriveItem[] }

// A pinned document (DocumentReference) — the existing pin layer.
export type PinnedDocument = {
  id: string
  title: string
  url: string
  docType: string | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  createdAt: string
}

export async function browseDocuments(subPath?: string) {
  return (await api.get<DocumentsResult>("/crm/documents", { params: subPath ? { subPath } : {} })).data
}

export async function searchDocuments(q: string) {
  return (await api.get<DocumentsSearchResult>("/crm/documents/search", { params: { q } })).data
}

export async function listPinnedDocuments() {
  return (await api.get<PinnedDocument[]>("/documents")).data
}

export async function pinDocument(dto: { title: string; url: string; docType?: string; linkedEntityType?: string; linkedEntityId?: string }) {
  return (await api.post<PinnedDocument>("/documents", dto)).data
}

// ── Account overview + renewals (phase 6) ─────────────────────────────────
export type AccountOverview = {
  client: { id: string; name: string; lifecycleStage: string } | null
  primaryContact: {
    id: string; firstName: string; lastName: string; jobTitle: string | null
    email: string | null; phone: string | null; mobile: string | null
  } | null
  pipeline: {
    open: Array<{ id: string; reference: string; title: string; stage: string; value?: number | null; probability?: number | null; expectedCloseDate: string | null }>
    count: number
    weightedValue?: number
  }
  recentActivity: Array<{ id: string; type: string; subject: string; occurredAt: string }>
  quotes: Array<{ id: string; reference: string; title: string; status: string; value?: number | null; validUntil: string | null }>
  nextRenewal: { id: string; reference: string; title: string; renewalDate: string; noticePeriodDays: number | null } | null
  health: { daysSinceLastActivity: number | null; openIncidents: number; openServiceRequests: number }
}

export type RenewalRow = {
  id: string; reference: string; title: string
  renewalDate: string; noticePeriodDays: number | null; autoRenews: boolean; status: string
}

export type SweepResult = {
  clientsSwept: number; renewalOppsCreated: number; stalledNudges: number; staleQuoteNudges: number
}

export async function getAccountOverview() {
  return (await api.get<AccountOverview>("/crm/overview")).data
}

// ── Reports (the reporting five) — commercial roles only ──────────────────
export type CrmReports = {
  pipeline: Array<{ stage: string; count: number; value: number; weighted: number }>
  forecast: Array<{ month: string; count: number; value: number; weighted: number }>
  winLoss: {
    periodMonths: number; won: number; lost: number; winRate: number | null
    wonValue: number; lossReasons: Record<string, number>
  }
  stalled: Array<{ id: string; reference: string; title: string; stage: string; value: number | null; daysInStage: number; nextStepOverdue: boolean }>
}

export async function getCrmReports(months = 6) {
  return (await api.get<CrmReports>("/crm/reports", { params: { months } })).data
}

export async function getRenewals(withinDays = 90) {
  return (await api.get<RenewalRow[]>("/crm/renewals", { params: { withinDays } })).data
}

export async function runCrmSweep() {
  return (await api.post<SweepResult>("/crm/sweep")).data
}

// ── Quotes (phase 4) ──────────────────────────────────────────────────────
// `value` and line-item `unitPrice` are ABSENT for field roles (decision 12).
export type QuoteLineItemView = {
  id: string
  description: string
  quantity: number
  unitPrice?: number
  sortOrder: number
}

export type QuoteView = {
  id: string
  clientId: string
  reference: string
  title: string
  description: string | null
  status: string
  version: number
  revisedFromId: string | null
  isPrimary: boolean
  value?: number
  currency: string
  validUntil: string | null
  contactId: string | null
  contact: { id: string; firstName: string; lastName: string } | null
  opportunityId: string | null
  opportunity: { id: string; reference: string; title: string; stage: string } | null
  workPackageId: string | null
  workPackage: { id: string; reference: string; title: string } | null
  sentAt: string | null
  decidedAt: string | null
  notes: string | null
  createdById: string
  createdBy?: { id: string; displayName: string } | null
  attachments?: import("./attachments").AttachmentSummary[]
  versions?: Array<{ id: string; version: number; status: string }>
  lineItems: QuoteLineItemView[]
  createdAt: string
  updatedAt: string
}

export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"] as const
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn"
}
// Mirrors the backend QUOTE_TRANSITIONS map — used to disable illegal moves in the UI.
export const QUOTE_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["SENT", "WITHDRAWN"],
  SENT: ["ACCEPTED", "REJECTED", "EXPIRED", "WITHDRAWN"],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
  WITHDRAWN: []
}

export type QuoteLineInput = { description: string; quantity: number; unitPrice: number }
export type QuoteInput = {
  title: string
  description?: string
  validUntil?: string
  contactId?: string
  opportunityId?: string
  notes?: string
  lineItems?: QuoteLineInput[]
}

export async function listQuotes(filters?: { status?: string; opportunityId?: string }) {
  return (await api.get<QuoteView[]>("/quotes", { params: filters })).data
}

export async function getQuote(id: string) {
  return (await api.get<QuoteView>(`/quotes/${id}`)).data
}

export async function createQuote(dto: QuoteInput) {
  return (await api.post<QuoteView>("/quotes", dto)).data
}

export async function updateQuote(id: string, dto: Partial<QuoteInput> & { status?: string }) {
  return (await api.patch<QuoteView>(`/quotes/${id}`, dto)).data
}

export async function replaceQuoteLineItems(id: string, lineItems: QuoteLineInput[]) {
  return (await api.put<QuoteView>(`/quotes/${id}/line-items`, { lineItems })).data
}

export async function reviseQuote(id: string) {
  return (await api.post<QuoteView>(`/quotes/${id}/revise`)).data
}

export async function createWorkPackageFromQuote(id: string, dto?: { title?: string; type?: string; startDate?: string; endDate?: string }) {
  return (await api.post(`/quotes/${id}/work-package`, dto ?? {})).data
}

// The x-client-id scope header is auto-attached by the api.ts interceptor.
export async function listContacts(filters?: { status?: string; category?: string; siteId?: string }) {
  return (await api.get<ContactView[]>("/contacts", { params: filters })).data
}

export async function createContact(dto: ContactInput) {
  return (await api.post<ContactView>("/contacts", dto)).data
}

export async function updateContact(id: string, dto: Partial<ContactInput>) {
  return (await api.patch<ContactView>(`/contacts/${id}`, dto)).data
}
