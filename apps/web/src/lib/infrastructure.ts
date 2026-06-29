import { entityStatusIntent, semanticTokens } from "../components/shared/tokens/colors"

// ─── Shared types ──────────────────────────────────────────────────────────

export type Asset = {
  id: string
  name: string
  assetTag: string
  assetType: string
  uPosition: number | null
  uHeight: number | null
  status: string
  lifecycleState: string
  rackSide: "FRONT" | "REAR" | null
  manufacturer: string | null
  modelNumber: string | null
  serialNumber: string | null
  ipAddress: string | null
  powerDrawW: number | null
  siteId: string | null
  cabinetId: string | null
  warrantyExpiry: string | null
  installDate: string | null
  deletionStatus: string | null
  deletionRequestedById: string | null
  deletionRequestedAt: string | null
  deletionReason: string | null
  site?: { id: string; name: string } | null
  cabinet?: { id: string; name: string; roomId: string | null; room?: { id: string; name: string } | null } | null
}

// Approver queue row (GET /assets/deletion-requests): an Asset plus the resolved requester.
export type PendingDeletion = Asset & {
  requestedBy: { id: string; displayName: string | null } | null
}

export type Cabinet = {
  id: string
  name: string
  type: string
  roomId: string | null
  totalU: number | null
  usedU: number | null
  powerKw: number | null
  notes: string | null
  _count: { assets: number }
  assets: Asset[]
}

export type Room = { id: string; name: string; type: string; floor: string | null }
export type Check = { id: string; reference: string; title: string; status: string; scheduledAt: string | null }
export type Site = {
  id: string
  name: string
  address: string | null
  city: string | null
  postcode: string | null
  country: string
  latitude: number | null
  longitude: number | null
  geocodedAt: string | null
  notes: string | null
  checks?: Check[]
}
export type AuditEvent = { id: string; action: string; createdAt: string; data?: { from?: string; to?: string; fields?: string[] } | null }
export type LinkedTask = { id: string; reference: string; title: string; status: string; priority: string }
export type LinkedServiceRequest = { id: string; reference: string; subject: string; status: string; priority: string }
export type LinkedRisk = { id: string; reference: string; title: string; status: string; likelihood: string; impact: string }
export type LinkedIssue = { id: string; reference: string; title: string; status: string; severity: string }
export type UserOption = { id: string; email: string }
export type ViewMode = "hierarchy" | "register"
export type RackTab = "dashboard" | "elevation" | "assets" | "history" | "linked"
export type ElevationSide = "FRONT" | "REAR"
export type InfoRow = { label: string; value: string; mono?: boolean }

// ─── Constants ─────────────────────────────────────────────────────────────

export const HEADER_HEIGHT = 49

export const ROOM_TYPE_LABELS: Record<string, string> = {
  DATA_HALL: "Data Hall",
  COMMS_ROOM: "Comms Room",
  SUPPORT: "Support Area",
  STORAGE: "Storage",
  OTHER: "Other"
}

export const ASSET_TYPE_BG: Record<string, string> = {
  Server: "#dbeafe", Switch: "#fce7f3", Patch: "#f1f5f9",
  PDU: "#fef3c7", UPS: "#d1fae5", KVM: "#ede9fe", Firewall: "#fee2e2"
}

export const ASSET_LIFECYCLE_OPTIONS = ["ACTIVE", "PLANNED", "PROCUREMENT", "STAGING", "RETIRED"]

// ─── Helper functions ──────────────────────────────────────────────────────

export function assetBg(type: string) { return ASSET_TYPE_BG[type] ?? "#f1f5f9" }

// Saturated lifecycle colour for label-less glyphs (the rack-elevation stripe, the
// register dot). Reads the SAME entityStatusIntent map the lifecycle pills use, on
// the `solid` scale (the pastel fill washes out at a few px), so chip / stripe / dot
// all agree: ACTIVE→green, STAGING→blue, PROCUREMENT→amber, PLANNED/RETIRED→slate.
export function lifecycleGlyphColor(state: string) {
  return semanticTokens[entityStatusIntent(state)].solid
}

export function barColor(pct: number) { return pct > 85 ? "#b91c1c" : pct > 65 ? "#b45309" : "#15803d" }

export function uFill(used: number | null, total: number | null) {
  if (!total) return 0
  return Math.min(100, Math.round(((used ?? 0) / total) * 100))
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return fallback
}

export function normalizeRackSide(side: string | null | undefined): "FRONT" | "REAR" {
  return side === "REAR" ? "REAR" : "FRONT"
}

export function formatKw(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2)
}

export function actionLabel(action: string, data?: { from?: string; to?: string; fields?: string[] } | null): string {
  if (action === "STATUS_UPDATED" && data?.from && data?.to) return `Status changed from ${data.from} to ${data.to}`
  if (action === "UPDATED" && data?.fields?.length) return `Updated ${data.fields.join(", ")}`
  if (action === "CREATED") return "Cabinet created"
  return action.replaceAll("_", " ").toLowerCase()
}

export function stripeBg(state: string) {
  return lifecycleGlyphColor(state)
}