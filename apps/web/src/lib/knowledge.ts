import { api } from "./api"

export type KnowledgeStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"

export type KnowledgeArticle = {
  id: string
  reference: string
  title: string
  body: string
  category: string
  status: KnowledgeStatus
  tags: string[]
  shared: boolean          // true = org-wide; false = pinned to a client
  clientId: string | null
  createdBy?: { id: string; displayName: string } | null
  createdAt: string
  updatedAt: string
}

export type KnowledgeInput = {
  title: string
  body: string
  category?: string
  status?: KnowledgeStatus
  tags?: string[]
  shared?: boolean
}

// x-client-id is auto-attached by the api interceptor — never set it here.
export async function listKnowledge(params?: { q?: string; status?: string }) {
  return (await api.get<KnowledgeArticle[]>("/knowledge", { params })).data
}

export async function getKnowledge(id: string) {
  return (await api.get<KnowledgeArticle>(`/knowledge/${id}`)).data
}

export async function createKnowledge(dto: KnowledgeInput) {
  return (await api.post<KnowledgeArticle>("/knowledge", dto)).data
}

export async function updateKnowledge(id: string, dto: Partial<KnowledgeInput>) {
  return (await api.put<KnowledgeArticle>(`/knowledge/${id}`, dto)).data
}
