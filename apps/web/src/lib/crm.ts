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
