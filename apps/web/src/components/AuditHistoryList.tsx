import * as React from "react"
import { Box, Stack, Typography } from "@mui/material"
import { type AuditEvent, humaniseAuditEvent } from "../lib/auditEvents"
import { formatRelativeTime } from "../lib/notifications"

// Shared compact, content-free audit-history renderer — one source of truth for the History tab on
// every detail page AND the EntityHistoryDialog. One block per event: actor (bold) + humanised line(s) +
// relative time; multi-field UPDATEs stack a line per change; STATUS_UPDATED transition comments show as
// a muted note. Humanisation (incl. legacy degradation) lives in lib/auditEvents.humaniseAuditEvent.

export function AuditHistoryList({
  events,
  recordNoun,
}: {
  events: AuditEvent[]
  recordNoun?: string
}) {
  return (
    <Box>
      {events.map((event) => {
        const { lines, note } = humaniseAuditEvent(event, { recordNoun })
        const actor = event.actorDisplayName ?? "System"
        return (
          <Box
            key={event.id}
            sx={{ py: 0.75, borderBottom: "1px solid", borderColor: "divider" }}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="baseline"
              justifyContent="space-between"
            >
              <Typography
                sx={{ fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.5 }}
              >
                <Box component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
                  {actor}
                </Box>{" "}
                {lines[0]}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.6875rem",
                  color: "text.tertiary",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {formatRelativeTime(event.createdAt)}
              </Typography>
            </Stack>

            {lines.slice(1).map((line, i) => (
              <Typography
                key={i}
                sx={{ fontSize: "0.8125rem", color: "text.secondary", pl: 0.5, lineHeight: 1.5 }}
              >
                {line}
              </Typography>
            ))}

            {note ? (
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  color: "text.tertiary",
                  pl: 0.5,
                  mt: 0.25,
                  fontStyle: "italic",
                }}
              >
                “{note}”
              </Typography>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}
