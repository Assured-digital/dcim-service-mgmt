import type { ComponentType } from "react"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined"
import BuildIcon from "@mui/icons-material/Build"
import TaskAltIcon from "@mui/icons-material/TaskAlt"
import WarningAmberIcon from "@mui/icons-material/WarningAmber"
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined"
import LinkIcon from "@mui/icons-material/Link"
import { api } from "./api"

// The six soft-linkable work-item types. The string values are the on-the-wire
// contract shared with the backend (RecordLink.aType/bType, /record-links search).
export const LINK_RECORD_TYPES = [
  "incident",
  "service_request",
  "change",
  "task",
  "risk",
  "issue",
] as const

export type LinkRecordType = (typeof LINK_RECORD_TYPES)[number]

// Minimal summary returned by the search endpoint and embedded (with linkId) in a
// record's resolved `links` projection.
export interface LinkRecordSummary {
  type: LinkRecordType
  id: string
  reference: string
  title: string
  status: string
}

export interface ResolvedLink extends LinkRecordSummary {
  linkId: string
}

export interface LinkRecordVisual {
  Icon: ComponentType<{ sx?: object }>
  bg: string
  fg: string
  label: string
}

// Single source of truth for per-type presentation — colours follow
// RECORD_DETAIL_SPEC.md §7.4 for risk/change/issue; incident/service_request/task
// added here (and documented in the spec).
export const LINKED_RECORD_VISUALS: Record<LinkRecordType, LinkRecordVisual> = {
  incident: { Icon: ErrorOutlineIcon, bg: "#fdecea", fg: "#b71c1c", label: "Incident" },
  service_request: { Icon: AssignmentOutlinedIcon, bg: "#eef2ff", fg: "#3538cd", label: "Service Request" },
  change: { Icon: BuildIcon, bg: "#e6f1fb", fg: "#185fa5", label: "Change" },
  task: { Icon: TaskAltIcon, bg: "#eaf3de", fg: "#3b6d11", label: "Task" },
  risk: { Icon: WarningAmberIcon, bg: "#faeeda", fg: "#854f0b", label: "Risk" },
  issue: { Icon: ReportProblemOutlinedIcon, bg: "#fbeaf0", fg: "#993556", label: "Issue" },
}

const FALLBACK_VISUAL: LinkRecordVisual = {
  Icon: LinkIcon,
  bg: "#eef2f6",
  fg: "#475569",
  label: "Record",
}

export function visualForType(type: string): LinkRecordVisual {
  return (LINKED_RECORD_VISUALS as Record<string, LinkRecordVisual>)[type] ?? FALLBACK_VISUAL
}

export function typeLabel(type: string): string {
  return visualForType(type).label
}

// Detail-page route for a linked record (see App.tsx route table).
export function routeForLink(link: { type: string; id: string }): string {
  switch (link.type) {
    case "incident":
      return `/service-desk/inc/${link.id}`
    case "service_request":
      return `/service-desk/sr/${link.id}`
    case "change":
      return `/service-desk/chg/${link.id}`
    case "task":
      return `/service-desk/task/${link.id}`
    case "risk":
      return `/risks-issues/risks/${link.id}`
    case "issue":
      return `/risks-issues/issues/${link.id}`
    default:
      return "#"
  }
}

// Standalone detail route for a navigator URL segment (sr|inc|chg|task|risk|issue).
// Used by the drawer's "Open full" affordance to leave the ticket context. Mirrors
// routeForLink, but keyed by the nav segment (which is what the depth-2 URL carries).
export function routeForSegment(seg: string, id: string): string {
  switch (seg) {
    case "sr":
      return `/service-desk/sr/${id}`
    case "inc":
      return `/service-desk/inc/${id}`
    case "chg":
      return `/service-desk/chg/${id}`
    case "task":
      return `/service-desk/task/${id}`
    case "risk":
      return `/risks-issues/risks/${id}`
    case "issue":
      return `/risks-issues/issues/${id}`
    default:
      return "#"
  }
}

// The `:assocType` URL segment used by the Service Desk navigator's depth-2 path
// (/service-desk/:type/:id/:assocType/:assocId). Matches the depth-1 sr|inc|chg
// prefix and extends it to the remaining work-item types.
export function navSegmentForType(type: string): string {
  switch (type) {
    case "incident":
      return "inc"
    case "service_request":
      return "sr"
    case "change":
      return "chg"
    case "task":
      return "task"
    case "risk":
      return "risk"
    case "issue":
      return "issue"
    default:
      return type
  }
}

// ── API helpers (x-client-id auto-injected by the api interceptor) ────────────

export async function searchLinkRecords(
  type: LinkRecordType,
  q: string
): Promise<LinkRecordSummary[]> {
  const { data } = await api.get<LinkRecordSummary[]>("/record-links/search", {
    params: { type, q: q || undefined },
  })
  return data
}

export async function createRecordLink(dto: {
  aType: LinkRecordType
  aId: string
  bType: LinkRecordType
  bId: string
}): Promise<void> {
  await api.post("/record-links", dto)
}

export async function deleteRecordLink(linkId: string): Promise<void> {
  await api.delete(`/record-links/${linkId}`)
}
