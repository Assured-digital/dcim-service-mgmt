import { api } from "./api"

// ── API shapes ──────────────────────────────────────────────────────────
// Mirrors the /clients resource view returned by the Clients API.
export type ClientView = {
  id: string
  name: string
  status: string
  lifecycleStage: string // PROSPECT | ONBOARDING | ACTIVE | FORMER (CRM_DESIGN.md §2)
  organizationId: string | null
  createdAt: string
  updatedAt: string
}

// Matches the existing /clients POST payload.
export type CreateClientInput = {
  name: string
  status: string
  lifecycleStage?: string
}

// Matches the existing /clients PATCH payload.
export type UpdateClientInput = {
  name?: string
  status?: string
  lifecycleStage?: string
}

// ── Calls ─────────────────────────────────────────────────────────────────
// The x-client-id scope header is auto-attached by the api.ts request
// interceptor for org-super-role users — never set it manually here.
export async function listClients() {
  return (await api.get<ClientView[]>("/clients")).data
}

export async function createClient(dto: CreateClientInput) {
  return (await api.post<ClientView>("/clients", dto)).data
}

export async function updateClient(id: string, dto: UpdateClientInput) {
  return (await api.patch<ClientView>(`/clients/${id}`, dto)).data
}
