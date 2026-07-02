import { entityStatusIntent, getActiveThemeMode, semanticToken, type ThemeMode } from "../components/shared/tokens/colors"

// ─── Shared types ──────────────────────────────────────────────────────────

export type Asset = {
  id: string
  name: string
  assetTag: string
  assetType: string
  uPosition: number | null
  uHeight: number | null
  // Placement semantics (DCIM spec §2) — optional: only the cabinets payload
  // selects them today; other asset queries may omit them.
  isFullDepth?: boolean | null
  isZeroU?: boolean
  budgetedDrawW?: number | null
  weightKg?: number | null
  // Decommission workflow (DCIM_SCHEMA_SPEC §4) — served on the cabinets payload.
  disposalStatus?: string | null
  physicallyRemoved?: boolean
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

// Advisory U-range hold (DCIM spec §2) — served on the cabinets payload,
// written via /sites/:siteId/cabinets/:cabinetId/reservations.
export type CabinetReservation = {
  id: string
  cabinetId: string
  uStart: number
  uHeight: number
  rackSide: "FRONT" | "REAR" | null
  name: string
  notes: string | null
  expiresAt: string | null
  createdAt: string
}

export function reservationExpired(r: CabinetReservation, now: Date = new Date()): boolean {
  return r.expiresAt != null && new Date(r.expiresAt) <= now
}

export type Cabinet = {
  id: string
  siteId: string
  name: string
  type: string
  roomId: string | null
  totalU: number | null
  usedU: number | null // computed server-side (occupancy minus excluded types)
  powerKw: number | null
  startingUnit?: number
  maxWeightKg?: number | null
  notes: string | null
  _count: { assets: number }
  assets: Asset[]
  reservations?: CabinetReservation[]
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
  contractedKw?: number | null
  contractedU?: number | null
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

// Dark counterpart of ASSET_TYPE_BG — same identity hue re-scaled to a deep,
// low-luminance fill (mirrors the *Dark groups in tokens/colors.ts).
export const ASSET_TYPE_BG_DARK: Record<string, string> = {
  Server: "#16294a", Switch: "#311823", Patch: "#1e293b",
  PDU: "#3a2c0f", UPS: "#13351f", KVM: "#1e1b3a", Firewall: "#3a1a1a"
}

const assetTypeBgByMode: Record<ThemeMode, Record<string, string>> = {
  light: ASSET_TYPE_BG,
  dark: ASSET_TYPE_BG_DARK,
}

export const ASSET_LIFECYCLE_OPTIONS = ["ACTIVE", "PLANNED", "PROCUREMENT", "STAGING", "RETIRED"]

// ─── Helper functions ──────────────────────────────────────────────────────

export function assetBg(type: string, mode: ThemeMode = getActiveThemeMode()) {
  const map = assetTypeBgByMode[mode]
  return map[type] ?? (mode === "dark" ? "#1e293b" : "#f1f5f9")
}

// Title/subtitle text on an assetBg fill (the elevation slot labels).
export function assetSlotText(mode: ThemeMode = getActiveThemeMode()): { title: string; subtitle: string } {
  return mode === "dark" ? { title: "#e2e8f0", subtitle: "#94a3b8" } : { title: "#0f172a", subtitle: "#64748b" }
}

// Saturated lifecycle colour for label-less glyphs (the rack-elevation stripe, the
// register dot). Reads the SAME entityStatusIntent map the lifecycle pills use, on
// the `solid` scale (the pastel fill washes out at a few px), so chip / stripe / dot
// all agree: ACTIVE→green, STAGING→blue, PROCUREMENT→amber, PLANNED/RETIRED→slate.
export function lifecycleGlyphColor(state: string, mode: ThemeMode = getActiveThemeMode()) {
  return semanticToken(entityStatusIntent(state), mode).solid
}

export function barColor(pct: number, mode: ThemeMode = getActiveThemeMode()) {
  if (mode === "dark") return pct > 85 ? "#ef4444" : pct > 65 ? "#f59e0b" : "#22c55e"
  return pct > 85 ? "#b91c1c" : pct > 65 ? "#b45309" : "#15803d"
}

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

export function stripeBg(state: string, mode: ThemeMode = getActiveThemeMode()) {
  return lifecycleGlyphColor(state, mode)
}