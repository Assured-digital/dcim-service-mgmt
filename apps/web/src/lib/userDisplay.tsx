import type { ReactNode } from "react"

// A user reference as carried by API read responses. The backend resolves `displayName`
// (knownAs -> "First Last" -> email; see apps/api/src/users/display.ts). `email` is only
// present on picker payloads (AssignableUser) — read responses expose { id, displayName }.
export type UserRef =
  | {
      id?: string
      displayName?: string | null
      email?: string | null
    }
  | null
  | undefined

// The display label for a person: resolved displayName, falling back to email ONLY for a
// genuinely nameless user, then the fallback placeholder. This is the single client-side
// source of truth for rendering a person — do not re-implement `email.split("@")` anywhere.
export function userLabel(user: UserRef, fallback = "Unassigned"): string {
  if (!user) return fallback
  return user.displayName?.trim() || user.email?.trim() || fallback
}

// Resolve a person's label from RAW profile fields (knownAs / first / last / email) — for the
// few client-side call sites that hold the unresolved user record rather than the server's
// pre-resolved `displayName` (e.g. the account menu reading GET /auth/me). Precedence mirrors
// the server's computeDisplayName: knownAs rendered VERBATIM (exactly as the user stored it —
// no case transform), then "First Last", then the email local-part as a last resort. Read
// responses already carry a resolved displayName — use userLabel() for those, not this.
export function personName(p: {
  knownAs?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
}): string {
  const known = p.knownAs?.trim()
  if (known) return known
  const full = [p.firstName, p.lastName].map((s) => s?.trim()).filter(Boolean).join(" ")
  if (full) return full
  return p.email?.split("@")[0]?.trim() || ""
}

// Two-letter initials derived from the display label (handles names and email local-parts).
export function userInitials(user: UserRef): string {
  const label = userLabel(user, "")
  if (!label) return "?"
  const at = label.indexOf("@")
  const base = at > 0 ? label.slice(0, at) : label
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Render a person's name inline. Email surfaces ONLY when no name resolves.
export function UserDisplay({
  user,
  fallback = "Unassigned",
}: {
  user: UserRef
  fallback?: string
}): ReactNode {
  return userLabel(user, fallback)
}
