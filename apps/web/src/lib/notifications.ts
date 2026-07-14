import { api } from "./api"

// ── Notification API (Phase 2) ────────────────────────────────────────────────
// The bell consumes the recipient's own inbox under the active client scope.
// x-client-id is auto-injected by the api interceptor; recipient = the JWT user.
// All shapes mirror NotificationsService.listForUser / unreadCount (apps/api).

export type NotificationKind =
  | "MENTION"
  | "REPLY"
  | "ASSIGNED"
  | "STATUS_CHANGED"
  | "COMMENT"
  | "DUE_SOON"
  | "OVERDUE"

// System (actor-less) notification kinds — the time-based sweep alerts. The bell shows
// a "Reminder" sender for these instead of a person.
export const SYSTEM_NOTIFICATION_KINDS = new Set<string>(["DUE_SOON", "OVERDUE"])

// The feed line reads "{actor} {verb}" — one verb per kind. Mirrors the backend
// NotificationType enum. Unknown kinds fall back to a neutral phrase.
const NOTIFICATION_VERBS: Record<string, string> = {
  MENTION: "mentioned you",
  REPLY: "replied to you",
  ASSIGNED: "assigned this to you",
  STATUS_CHANGED: "updated the status",
  COMMENT: "commented",
  DUE_SOON: "flagged as due soon",
  OVERDUE: "flagged as overdue",
}

export function notificationVerb(type: string): string {
  return NOTIFICATION_VERBS[type] ?? "updated a record"
}

export interface NotificationActor {
  id: string
  displayName: string
}

export interface NotificationItem {
  id: string
  type: NotificationKind | string
  // #99: resolved fresh server-side; null if the actor was since removed.
  actor: NotificationActor | null
  sourceType: string
  sourceId: string
  commentId: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  unreadCount: number
  items: NotificationItem[]
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get<{ unreadCount: number }>("/notifications/unread-count")
  return data.unreadCount
}

export async function fetchNotifications(): Promise<NotificationList> {
  const { data } = await api.get<NotificationList>("/notifications")
  return data
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch("/notifications/read-all")
}

// ── Preferences (Phase 2) — per-type × per-channel (in-app / email) ─────────────
export interface NotificationPreference {
  type: NotificationKind
  inApp: boolean
  email: boolean
}

export const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  ASSIGNED: "Assigned to me",
  MENTION: "Mentioned me",
  STATUS_CHANGED: "Status changed",
  REPLY: "Reply to my comment",
  COMMENT: "New comment (watching)",
  DUE_SOON: "Due soon",
  OVERDUE: "Overdue",
}

export async function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
  const { data } = await api.get<{ preferences: NotificationPreference[] }>("/notifications/preferences")
  return data.preferences
}

export async function updateNotificationPreferences(
  preferences: NotificationPreference[]
): Promise<NotificationPreference[]> {
  const { data } = await api.put<{ preferences: NotificationPreference[] }>("/notifications/preferences", { preferences })
  return data.preferences
}

// ── source → detail route ─────────────────────────────────────────────────────
// sourceType is the Comment entityType vocabulary (PascalCase model names — see
// apps/api/src/comments/resolve-comment-scope.ts). Mirrors linkedRecords.ts route
// maps + the App.tsx route table. Returns null for an unmappable type (no nav).
const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  Incident: (id) => `/service-desk/inc/${id}`,
  ServiceRequest: (id) => `/service-desk/sr/${id}`,
  ChangeRequest: (id) => `/service-desk/chg/${id}`,
  Task: (id) => `/service-desk/task/${id}`,
  Risk: (id) => `/risks-issues/risks/${id}`,
  Issue: (id) => `/risks-issues/issues/${id}`,
  Asset: (id) => `/asset-register/assets/${id}`,
}

export function routeForNotificationSource(sourceType: string, sourceId: string): string | null {
  const build = SOURCE_ROUTES[sourceType]
  return build ? build(sourceId) : null
}

// Human label for the source-context line ("in a service request"). The Stage 2
// API does not return the record's reference/title, so we surface the type.
const SOURCE_LABELS: Record<string, string> = {
  Incident: "an incident",
  ServiceRequest: "a service request",
  ChangeRequest: "a change",
  Task: "a task",
  Risk: "a risk",
  Issue: "an issue",
  Asset: "an asset",
}

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_LABELS[sourceType] ?? "a record"
}

// ── relative time ─────────────────────────────────────────────────────────────
// No shared date util exists; detail pages each roll their own formatter. Compact
// relative form for the feed, falling back to an en-GB date for anything ≥ 7 days.
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 45) return "just now"
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
}

// Clean, spelled-out duration from a millisecond span: "5 minutes" → "3 hours" → "8 days".
// Neutral phrasing (no abbreviation, no "old"/"ago") for dashboards where a severity cue
// already carries urgency; callers append " ago" when a past-tense reading is wanted.
export function formatDurationLong(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000))
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"}`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? "" : "s"}`
}
