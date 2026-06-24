// ── Service Desk queue: shared params + filter + sort ──────────────────────
//
// Single source of truth for turning the URL query params (?status/?type/?q/
// ?sort — the Phase 2a scheme) plus the raw ticket list into the displayed set.
// Pure functions (no hooks) so BOTH the depth-0 table (ServiceDeskPage) and the
// depth-1 working-queue rail (ServiceDeskQueueRail) derive the SAME list from
// the SAME params with no duplicated logic.

import type { GridSortModel } from "@mui/x-data-grid"
import { isNewStatus, type Ticket, type TicketKind } from "./tickets"

export const DEFAULT_SORT: GridSortModel = [{ field: "updatedAt", sort: "desc" }]

export const TYPE_PARAM_TO_KIND: Record<string, TicketKind> = { sr: "SR", inc: "INC", chg: "CHG", task: "TASK" }
export const KIND_TO_TYPE_PARAM: Record<TicketKind, string> = { SR: "sr", INC: "inc", CHG: "chg", TASK: "task" }

export function parseSortParam(raw: string | null): GridSortModel {
  if (raw === "none") return []                       // explicit unsorted (MUI asc→desc→none)
  if (!raw) return DEFAULT_SORT
  const [field, dir] = raw.split(":")
  if (!field || (dir !== "asc" && dir !== "desc")) return DEFAULT_SORT
  return [{ field, sort: dir }]
}

export function encodeSortParam(model: GridSortModel): string | null {
  if (model.length === 0) return "none"
  const { field, sort } = model[0]
  if (field === "updatedAt" && sort === "desc") return null   // default — omit
  return `${field}:${sort ?? "asc"}`
}

export interface QueueParams {
  savedView: string
  typeFilter: TicketKind | "all"
  qParam: string
  sortModel: GridSortModel
}

/** Decode the queue state from the URL. Mirrors ServiceDeskPage's depth-0 read. */
export function parseQueueParams(sp: URLSearchParams): QueueParams {
  const rawType = sp.get("type")
  return {
    savedView: sp.get("status") ?? "open",
    typeFilter: rawType ? (TYPE_PARAM_TO_KIND[rawType] ?? "all") : "all",
    qParam: sp.get("q") ?? "",
    sortModel: parseSortParam(sp.get("sort")),
  }
}

/** Filter tickets by saved view, type filter, and search input. */
export function filterTickets(
  tickets: Ticket[],
  p: QueueParams,
  currentUser: { userId: string } | null,
): Ticket[] {
  const q = p.qParam.trim().toLowerCase()
  return tickets.filter(t => {
    if (p.typeFilter !== "all" && t.kind !== p.typeFilter) return false
    const done = t.chipIntent === "done"

    if (p.savedView === "open" && done) return false
    if (p.savedView === "new" && (!isNewStatus(t) || done)) return false
    if (p.savedView === "mine" && (!currentUser || t.assignee?.id !== currentUser.userId || done)) return false
    if (p.savedView === "overdue" && !t.overdue) return false
    if (p.savedView === "unassigned" && (t.assignee || done)) return false
    if (p.savedView === "awaiting" && (t.chipIntent !== "wait" || done)) return false
    if (p.savedView === "closed" && !done) return false

    if (q) {
      const haystack = `${t.subject} ${t.reference} ${t.assignee?.displayName ?? ""}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}

// Reproduce the DataGrid columns' sort values (the per-column valueGetters in
// buildUnifiedColumns) so the rail's order matches the table's. The URL only
// ever carries a single-field sort; the default (updatedAt:desc — the dominant
// case) matches the DataGrid exactly. Dates compare as timestamps with nulls
// sorted last regardless of direction (MUI's empty-value behaviour).
function sortValue(t: Ticket, field: string): string | number | null {
  switch (field) {
    case "updatedAt": return t.updatedAt ? new Date(t.updatedAt).getTime() : null
    case "dueAt":     return t.dueAt ? new Date(t.dueAt).getTime() : null
    case "chipIntent": return t.overdue ? "overdue" : t.status
    case "assignee":  return t.assignee?.displayName ?? "Unassigned"
    case "kind":      return t.kind
    case "reference": return t.reference
    case "subject":   return t.subject
    case "priority":  return t.priority
    case "status":    return t.status
    default:          return (t as unknown as Record<string, unknown>)[field] as string ?? null
  }
}

/** Sort a filtered list to match the table's DataGrid order for the given model. */
export function sortTickets(tickets: Ticket[], sortModel: GridSortModel): Ticket[] {
  if (sortModel.length === 0) return tickets
  const { field, sort } = sortModel[0]
  const dir = sort === "asc" ? 1 : -1
  return [...tickets].sort((a, b) => {
    const av = sortValue(a, field)
    const bv = sortValue(b, field)
    // Nulls/empties sort last in either direction (matches MUI).
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
}
