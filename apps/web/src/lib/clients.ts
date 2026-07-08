import { api } from "./api"

// ── API shapes ──────────────────────────────────────────────────────────
// Mirrors the /clients resource view returned by the Clients API.
export type ClientView = {
  id: string
  name: string
  status: string
  lifecycleStage: string // PROSPECT | ONBOARDING | ACTIVE | FORMER (CRM_DESIGN.md §2)
  sharePointFolderPath?: string | null // folder within the org SharePoint site (phase 7a)
  organizationId: string | null
  createdAt: string
  updatedAt: string
  enabledModules?: string[] // A2 — the licensed product modules for this client
}

// Matches the existing /clients POST payload.
export type CreateClientInput = {
  name: string
  status: string
  lifecycleStage?: string
  sharePointFolderPath?: string
}

// Matches the existing /clients PATCH payload.
export type UpdateClientInput = {
  name?: string
  status?: string
  lifecycleStage?: string
  sharePointFolderPath?: string
}

// ── Calls ─────────────────────────────────────────────────────────────────
// The x-client-id scope header is auto-attached by the api.ts request
// interceptor for org-super-role users — never set it manually here.
export async function listClients() {
  return (await api.get<ClientView[]>("/clients")).data
}

// The caller's own assigned-client set (client-scoped users). Includes
// enabledModules so the entitlement hook can read licensing for these users too.
export async function listMyClients() {
  return (await api.get<ClientView[]>("/clients/mine")).data
}

export async function createClient(dto: CreateClientInput) {
  return (await api.post<ClientView>("/clients", dto)).data
}

export async function updateClient(id: string, dto: UpdateClientInput) {
  return (await api.patch<ClientView>(`/clients/${id}`, dto)).data
}

// A2 — set the client's licensed module set (full declarative list; anything
// omitted is disabled). Org-super only (enforced server-side).
export async function setClientModules(id: string, modules: string[]) {
  return (await api.put<ClientView>(`/clients/${id}/modules`, { modules })).data
}
