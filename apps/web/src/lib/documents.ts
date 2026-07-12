import { api } from "./api"
import type { DriveItem } from "./crm"

export type { DriveItem }

// A DocumentReference row — a link from a record to a SharePoint (or any URL)
// business document. The pin layer; the bytes live in SharePoint, not the app.
export type DocumentRef = {
  id: string
  title: string
  url: string
  docType: string | null
  version: string | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  createdAt: string
}

// Discriminated results — the picker distinguishes integration-off / no-site / ok.
export type BrowseResult =
  | { status: "disabled" }
  | { status: "unmapped" }
  | { status: "ok"; subPath: string; items: DriveItem[] }

export type SearchResult =
  | { status: "disabled" }
  | { status: "unmapped" }
  | { status: "ok"; items: DriveItem[] }

// Documents linked to one record (the per-record Documents panel).
export async function listRecordDocuments(linkedEntityType: string, linkedEntityId: string) {
  return (await api.get<DocumentRef[]>("/documents", { params: { linkedEntityType, linkedEntityId } })).data
}

// Browse / search the client's SharePoint Documents (shared) library.
export async function browseSharePoint(subPath?: string) {
  return (await api.get<BrowseResult>("/documents/browse", { params: subPath ? { subPath } : {} })).data
}

export async function searchSharePoint(q: string) {
  return (await api.get<SearchResult>("/documents/search", { params: { q } })).data
}

export async function linkDocument(dto: {
  title: string
  url: string
  docType?: string
  linkedEntityType: string
  linkedEntityId: string
}) {
  return (await api.post<DocumentRef>("/documents", dto)).data
}

export async function unlinkDocument(id: string) {
  return (await api.delete(`/documents/${id}`)).data
}
