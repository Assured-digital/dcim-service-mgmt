import React from "react"
import { Box, Button, Chip, Tooltip, Typography } from "@mui/material"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import EditIcon from "@mui/icons-material/Edit"
import { isOrgSuperRole } from "../lib/auth"
import { type UserView } from "../lib/users"

// Derive 1–2 initials from an email local-part. Splits on "." (or "_"/"-") so
// "jake.haldane@x.com" → "JH"; otherwise takes the first two characters.
function initialsFromEmail(email: string): string {
  const local = (email.split("@")[0] || "").trim()
  if (!local) return "?"
  const parts = local.split(/[._-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return local.slice(0, 2).toUpperCase()
}

// Display name precedence: knownAs → "firstName lastName" (trimmed) → null.
// Returning null signals "no name on record" so the caller falls back to email.
function displayNameFor(user: UserView): string | null {
  return user.knownAs?.trim() || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || null
}

// Derive 1–2 initials from a display name: first letters of the first two
// whitespace-separated words; if a single word, its first two characters.
function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0] || "").slice(0, 2).toUpperCase()
}

// Resolve the assigned-client display as a LIST of labels. Org-level users
// (ORG_OWNER/ORG_ADMIN/legacy ADMIN) always read "Organisation" regardless of
// any stray clientId on the record (seed-data quirk). Everyone else shows their
// client name(s). Returned as an array so multi-client assignment can render
// here later without reworking the row.
function clientLabelsFor(user: UserView, clientNameById: Map<string, string>): string[] {
  if (isOrgSuperRole(user.role)) return ["Organisation"]
  if (!user.clientId) return ["Organisation"]
  return [clientNameById.get(user.clientId) ?? user.clientId]
}

type Props = {
  user: UserView
  clientNameById: Map<string, string>
  onEdit: (user: UserView) => void
}

export default function UserListRow({ user, clientNameById, onEdit }: Props) {
  const orgLevel = isOrgSuperRole(user.role)
  const clientLabels = clientLabelsFor(user, clientNameById)
  const roleLabel = user.role.replace(/_/g, " ").toLowerCase()
  const displayName = displayNameFor(user)
  const initials = displayName ? initialsFromName(displayName) : initialsFromEmail(user.email)

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        bgcolor: "var(--color-background-primary, #ffffff)",
        border: "0.5px solid var(--color-border-primary, #e2e8f0)",
        borderRadius: 1,
        px: 1.75,
        py: 1.5,
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": {
          borderColor: "#cbd5e1",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)"
        }
      }}
    >
      {/* Avatar — initials, tinted for org-level users */}
      <Box
        sx={{
          flexShrink: 0,
          width: 38,
          height: 38,
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          bgcolor: orgLevel
            ? "var(--color-background-info, #eff6ff)"
            : "var(--color-background-secondary, #f8fafc)",
          color: orgLevel ? "#1d4ed8" : "var(--color-text-secondary, #475569)",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.3
        }}
      >
        {initials}
      </Box>

      {/* Main — name (or email) + status, then role chip + assigned client(s) */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography
            sx={{
              fontSize: 13.5,
              fontWeight: displayName ? 600 : 500,
              color: "var(--color-text-primary, #0f172a)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {displayName ?? user.email}
          </Typography>
          {user.isActive ? (
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.375, flexShrink: 0 }}>
              <CheckCircleIcon sx={{ fontSize: 13, color: "#16a34a" }} />
              <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "#16a34a" }}>active</Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-muted, #64748b)", flexShrink: 0 }}>
              inactive
            </Typography>
          )}
        </Box>

        {/* Secondary muted email line — shown only when a name occupies the primary line. */}
        {displayName && (
          <Typography
            sx={{
              fontSize: 12,
              color: "var(--color-text-muted, #64748b)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {user.email}
          </Typography>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, flexWrap: "wrap" }}>
          <Chip
            size="small"
            label={roleLabel}
            sx={{
              height: 20,
              bgcolor: "#eef2ff",
              color: "#3730a3",
              fontWeight: 600,
              fontSize: 11,
              textTransform: "capitalize",
              "& .MuiChip-label": { px: 0.875 }
            }}
          />
          <Typography sx={{ fontSize: 12, color: "var(--color-text-tertiary, #94a3b8)" }}>·</Typography>
          {/* Multi-client-ready: a list of client tags, single today. */}
          {clientLabels.map((label, i) => (
            <Typography
              key={i}
              sx={{
                fontSize: 12,
                color: "var(--color-text-muted, #64748b)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>
      </Box>

      {/* Right — edit action */}
      <Tooltip title="Edit user" placement="top">
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditIcon sx={{ fontSize: 14 }} />}
          onClick={() => onEdit(user)}
          sx={{
            flexShrink: 0,
            height: 30,
            borderRadius: 999,
            px: 1.5,
            fontSize: 12.5,
            textTransform: "none",
            borderColor: "var(--color-border-primary, #e2e8f0)",
            color: "var(--color-text-secondary, #475569)"
          }}
        >
          Edit
        </Button>
      </Tooltip>
    </Box>
  )
}
