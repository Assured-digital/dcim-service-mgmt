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
