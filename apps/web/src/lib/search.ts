import { api } from "./api"

export type SearchResultType =
  | "sr" | "inc" | "chg" | "task" | "risk" | "issue"
  | "knowledge" | "asset" | "check" | "contact" | "opportunity" | "quote"

export type SearchResult = {
  type: SearchResultType
  id: string
  reference: string
  title: string
  status: string
  module: string
  detailPath: string
}

export type SearchResponse = {
  results: SearchResult[]
  resultsByType: Record<string, SearchResult[]>
  count: number
}

// x-client-id is auto-attached by the api interceptor.
export async function globalSearch(q: string) {
  return (await api.get<SearchResponse>("/search", { params: { q } })).data
}

export const SEARCH_TYPE_LABEL: Record<SearchResultType, string> = {
  sr: "Service Requests",
  inc: "Incidents",
  chg: "Changes",
  task: "Tasks",
  risk: "Risks",
  issue: "Issues",
  knowledge: "Knowledge",
  asset: "Assets",
  check: "Checks",
  contact: "Contacts",
  opportunity: "Opportunities",
  quote: "Quotes"
}

// Stable render order for grouped results.
export const SEARCH_TYPE_ORDER: SearchResultType[] = [
  "sr", "inc", "chg", "task", "risk", "issue",
  "knowledge", "asset", "check", "contact", "opportunity", "quote"
]
