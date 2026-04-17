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
  site?: { id: string; name: string } | null
  cabinet?: { id: string; name: string; roomId: string | null; room?: { id: string; name: string } | null } | null
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

export function lifecycleSx(state: string) {
  if (state === "ACTIVE") return { bgcolor: "#dcfce7", color: "#15803d" }
  if (state === "RETIRED") return { bgcolor: "#f1f5f9", color: "#64748b" }
  if (state === "STAGING") return { bgcolor: "#dbeafe", color: "#1d4ed8" }
  return { bgcolor: "#fef3c7", color: "#b45309" }
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
  if (state === "ACTIVE") return "#22c55e"
  if (state === "STAGING") return "#8b5cf6"
  if (state === "PLANNED") return "#3b82f6"
  if (state === "RETIRED") return "#94a3b8"
  return "#f59e0b"
}