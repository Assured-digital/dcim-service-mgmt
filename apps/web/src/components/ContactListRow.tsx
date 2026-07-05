import React from "react"
import { Box, Button, Chip, Tooltip, Typography } from "@mui/material"
import StarIcon from "@mui/icons-material/Star"
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined"
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined"
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined"
import EditIcon from "@mui/icons-material/Edit"
import { useThemeMode } from "../lib/theme"
import { semanticToken } from "./shared/tokens/colors"
import { CONTACT_CATEGORY_LABELS, contactDisplayName, type ContactView } from "../lib/crm"

// Card-row for a CRM contact — mirrors UserListRow (Admin → Users) so the two
// people-tables read the same: avatar initials, name + status, secondary line,
// category chip + contact details, right-aligned Edit. People fit this look.

function initials(first: string, last: string): string {
  const a = (first.trim()[0] ?? "").toUpperCase()
  const b = (last.trim()[0] ?? "").toUpperCase()
  return (a + b) || (first.slice(0, 2).toUpperCase()) || "?"
}

export default function ContactListRow({ contact, onEdit }: {
  contact: ContactView
  onEdit: (c: ContactView) => void
}) {
  const { mode } = useThemeMode()
  const primary = contact.isPrimary
  const name = contactDisplayName(contact)
  const phone = contact.phone || contact.mobile
  const active = contact.status === "ACTIVE"

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
        opacity: active ? 1 : 0.7,
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        "&:hover": {
          borderColor: mode === "dark" ? "#475569" : "#cbd5e1",
          boxShadow: mode === "dark" ? "0 1px 3px rgba(0, 0, 0, 0.4)" : "0 1px 3px rgba(15, 23, 42, 0.06)"
        }
      }}
    >
      {/* Avatar — initials, tinted for the primary contact */}
      <Box
        sx={{
          flexShrink: 0, width: 38, height: 38, borderRadius: "50%",
          display: "grid", placeItems: "center",
          bgcolor: primary ? (mode === "dark" ? "#16294a" : "#eff6ff") : "var(--color-background-secondary, #f8fafc)",
          color: primary ? (mode === "dark" ? "#60a5fa" : "#1d4ed8") : "var(--color-text-secondary, #475569)",
          fontSize: 13, fontWeight: 700, letterSpacing: 0.3
        }}
      >
        {initials(contact.firstName, contact.lastName)}
      </Box>

      {/* Main — name + primary star + status, then category + contact details */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text-primary, #0f172a)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </Typography>
          {primary ? (
            <Tooltip title="Primary contact" placement="top">
              <StarIcon sx={{ fontSize: 14, color: "#eab308", flexShrink: 0 }} />
            </Tooltip>
          ) : null}
          {contact.jobTitle ? (
            <Typography sx={{ fontSize: 12, color: "var(--color-text-muted, #64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              · {contact.jobTitle}
            </Typography>
          ) : null}
          {!active ? (
            <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: "var(--color-text-muted, #64748b)", flexShrink: 0 }}>inactive</Typography>
          ) : null}
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
          <Chip
            size="small"
            label={CONTACT_CATEGORY_LABELS[contact.category] ?? contact.category}
            sx={{ height: 20, bgcolor: mode === "dark" ? "#16294a" : "#eff6ff", color: mode === "dark" ? "#93c5fd" : "#1d4ed8", fontWeight: 600, fontSize: 11, "& .MuiChip-label": { px: 0.875 } }}
          />
          {contact.email ? (
            <Detail icon={<EmailOutlinedIcon sx={{ fontSize: 14 }} />} text={contact.email} />
          ) : null}
          {phone ? (
            <Detail icon={<PhoneOutlinedIcon sx={{ fontSize: 14 }} />} text={phone} />
          ) : null}
          {contact.site?.name ? (
            <Detail icon={<PlaceOutlinedIcon sx={{ fontSize: 14 }} />} text={contact.site.name} />
          ) : null}
        </Box>
      </Box>

      {/* Right — edit action */}
      <Tooltip title="Edit contact" placement="top">
        <Button
          size="small" variant="outlined" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
          onClick={() => onEdit(contact)}
          sx={{ flexShrink: 0, height: 30, borderRadius: 999, px: 1.5, fontSize: 12.5, textTransform: "none", borderColor: "var(--color-border-primary, #e2e8f0)", color: "var(--color-text-secondary, #475569)" }}
        >
          Edit
        </Button>
      </Tooltip>
    </Box>
  )
}

function Detail({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.375, color: "var(--color-text-muted, #64748b)", minWidth: 0 }}>
      {icon}
      <Typography sx={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</Typography>
    </Box>
  )
}
