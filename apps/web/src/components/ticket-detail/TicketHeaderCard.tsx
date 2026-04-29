import React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Box, Button, Chip, Divider, Stack, Typography } from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import { chipSx, TypeBadge, PriorityDot, type TicketKind } from "../shared"

interface TicketHeaderCardProps {
  kind: TicketKind
  reference: string
  /** Raw status (e.g. IN_PROGRESS). Used to pick chip intent. */
  status: string
  /** Display label for the status chip (e.g. "In progress"). */
  statusLabel: string
  /** Priority key (low/medium/high/critical). */
  priority: string
  priorityLabel?: string
  title: string
  /** Optional inline meta row — client · site · opened · assignee etc. */
  meta?: React.ReactNode
  /** Right-aligned action buttons (primary + secondary). */
  actions?: React.ReactNode
  /** Workflow strip rendered below the meta row (optional). */
  workflow?: React.ReactNode
  /** Description body. When present, rendered below the card with a subtle label. */
  description?: React.ReactNode
  /** Where the Return button should fall back to when there's no in-app history. */
  returnFallbackPath?: string
}

/**
 * Unified header for ticket detail pages (SR / INC / CHG).
 *
 * Layout: a prominent title row (title left, Return + action buttons right),
 * a metadata strip (type, ref, status, priority) underneath, then meta line
 * and an optional workflow strip.
 */
export function TicketHeaderCard({
  kind, reference, status, statusLabel, priority, priorityLabel,
  title, meta, actions, workflow, description,
  returnFallbackPath = "/service-desk",
}: TicketHeaderCardProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Prefer the browser back stack so the queue restores its prior context
  // (saved view, search input, scroll position). Fall back to the queue
  // root for direct deep-links where there's no in-app history.
  function handleReturn() {
    if (location.key !== "default") navigate(-1)
    else navigate(returnFallbackPath)
  }

  return (
    <>
      <Box sx={{
        bgcolor: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 1.5,
        boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
        px: 2.5, pt: 2, pb: workflow ? 0 : 2,
        mb: description ? 2 : 2,
      }}>
        {/* Top row — title (left) and Return + actions (right) */}
        <Stack direction="row" alignItems="flex-start" spacing={2} sx={{ mb: 1.25 }}>
          <Typography sx={{
            flex: 1,
            fontFamily: "Space Grotesk, Manrope",
            fontSize: 22, fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-0.015em",
            lineHeight: 1.25,
          }}>
            {title}
          </Typography>

          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
              onClick={handleReturn}
              sx={{
                fontSize: 12, textTransform: "none",
                borderColor: "#e2e8f0", color: "#334155",
                "&:hover": { borderColor: "#cbd5e1", bgcolor: "#f8fafc" },
              }}
            >
              Return
            </Button>
            {actions}
          </Stack>
        </Stack>

        {/* Metadata strip — type, ref, status, priority */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: meta ? 1 : 0 }}>
          <TypeBadge kind={kind} />
          <Typography sx={{
            fontFamily: "monospace", fontSize: 12, fontWeight: 700,
            color: "#475569", letterSpacing: "0.01em",
          }}>
            {reference}
          </Typography>
          <Chip size="small" sx={chipSx(status)} label={statusLabel.toLowerCase()} />
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ px: 0.5 }}>
            <PriorityDot priority={priority} />
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "capitalize" }}>
              {priorityLabel ?? priority}
            </Typography>
          </Stack>
        </Stack>

        {/* Meta line — client · opened · assignee etc. */}
        {meta ? (
          <Typography component="div" sx={{ fontSize: 12, color: "#64748b", mb: workflow ? 1.5 : 0 }}>
            {meta}
          </Typography>
        ) : null}

        {/* Workflow strip (sits inside the card, flush to the bottom) */}
        {workflow ? (
          <>
            <Divider sx={{ mx: -2.5, mb: 1.25, mt: 1.25 }} />
            <Box sx={{ mx: -1, pb: 1 }}>{workflow}</Box>
          </>
        ) : null}
      </Box>

      {/* Description — rendered below the card, un-boxed, lightly labelled */}
      {description ? (
        <Box sx={{ px: 0.5, mb: 2.5 }}>
          <Typography sx={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            textTransform: "uppercase", color: "#64748b", mb: 0.75,
          }}>
            Description
          </Typography>
          {typeof description === "string" ? (
            <Typography sx={{
              fontSize: 14, color: "#334155", whiteSpace: "pre-wrap",
              lineHeight: 1.7,
            }}>
              {description}
            </Typography>
          ) : description}
        </Box>
      ) : null}
    </>
  )
}

// ── Primary action helper ────────────────────────────────────────────────
// Given a kind + current status, returns the most natural "next step" transition
// (used as the primary-action button label on the detail header). Returns null
// when the status has no obvious forward transition.
export function primaryTransition(
  kind: TicketKind,
  status: string,
): { target: string; label: string } | null {
  if (kind === "SR") {
    if (status === "NEW" || status === "ASSIGNED") return { target: "IN_PROGRESS", label: "Start work" }
    if (status === "IN_PROGRESS") return { target: "COMPLETED", label: "Resolve" }
    if (status === "WAITING_CUSTOMER") return { target: "IN_PROGRESS", label: "Resume" }
    if (status === "COMPLETED") return { target: "CLOSED", label: "Close" }
    return null
  }
  if (kind === "INC") {
    if (status === "NEW") return { target: "INVESTIGATING", label: "Investigate" }
    if (status === "INVESTIGATING") return { target: "MITIGATED", label: "Mitigate" }
    if (status === "MITIGATED") return { target: "RESOLVED", label: "Resolve" }
    if (status === "RESOLVED") return { target: "CLOSED", label: "Close" }
    return null
  }
  // CHG
  if (status === "DRAFT") return { target: "SUBMITTED", label: "Submit" }
  if (status === "SUBMITTED") return { target: "PENDING_APPROVAL", label: "Send for approval" }
  if (status === "APPROVED") return { target: "IN_PROGRESS", label: "Start change" }
  if (status === "IN_PROGRESS") return { target: "COMPLETED", label: "Complete" }
  if (status === "COMPLETED") return { target: "CLOSED", label: "Close" }
  return null
}
