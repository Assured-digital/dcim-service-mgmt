import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Box, Chip, Stack, Typography } from "@mui/material"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import { chipSx, TypeBadge } from "../components/shared"
import type { Ticket } from "../lib/tickets"
import { EmptyState } from "../components/PageState"

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString("en-GB")
}

export default function ServiceDeskInbox({ tickets }: { tickets: Ticket[] }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get("selected")

  const selected = React.useMemo(
    () => tickets.find(t => t.id === selectedId) ?? tickets[0] ?? null,
    [tickets, selectedId]
  )

  function selectTicket(t: Ticket) {
    const next = new URLSearchParams(searchParams)
    next.set("view", "inbox")
    next.set("selected", t.id)
    next.set("kind", t.kind)
    setSearchParams(next, { replace: true })
  }

  if (tickets.length === 0) {
    return <Box sx={{ p: 3 }}><EmptyState title="No tickets" detail="Adjust filters to see more." /></Box>
  }

  return (
    <Box sx={{ display: "flex", flex: 1, overflow: "hidden", bgcolor: "#f8fafc" }}>
      {/* Left list */}
      <Box sx={{
        width: 360, flexShrink: 0,
        borderRight: "1px solid #e2e8f0", bgcolor: "#fff",
        overflowY: "auto"
      }}>
        {tickets.map(t => {
          const isSelected = selected?.id === t.id
          return (
            <Box
              key={`${t.kind}-${t.id}`}
              onClick={() => selectTicket(t)}
              sx={{
                px: 1.75, py: 1.25,
                borderBottom: "1px solid #f1f5f9",
                borderLeft: t.overdue ? "3px solid #ef4444" : "3px solid transparent",
                bgcolor: isSelected ? "#e8f1ff" : "#fff",
                cursor: "pointer",
                "&:hover": { bgcolor: isSelected ? "#e8f1ff" : "#f8fafc" }
              }}
            >
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
                <TypeBadge kind={t.kind} />
                <Typography sx={{ fontFamily: "monospace", fontSize: 11.5, fontWeight: 700, color: "#475569" }}>
                  {t.reference}
                </Typography>
                <Typography sx={{
                  ml: "auto", fontSize: 11,
                  color: t.overdue ? "#b91c1c" : "#94a3b8",
                  fontWeight: t.overdue ? 600 : 400
                }}>
                  {formatRelative(t.updatedAt)}
                </Typography>
              </Stack>
              <Typography sx={{
                fontSize: 13, fontWeight: 600, color: "#0f172a",
                lineHeight: 1.35, mb: 0.75,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {t.subject}
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Chip
                  size="small"
                  sx={chipSx(t.overdue ? "OVERDUE" : t.status)}
                  label={t.overdue ? "overdue" : t.status.toLowerCase().replaceAll("_", " ")}
                />
                <Typography sx={{ fontSize: 11, color: "#64748b" }}>
                  {t.assignee ? t.assignee.email.split("@")[0] : "Unassigned"}
                </Typography>
              </Stack>
            </Box>
          )
        })}
      </Box>

      {/* Right pane — preview */}
      <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "#fff" }}>
        {selected ? (
          <Box sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <TypeBadge kind={selected.kind} />
              <Typography sx={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#475569" }}>
                {selected.reference}
              </Typography>
              <Chip
                size="small"
                sx={chipSx(selected.overdue ? "OVERDUE" : selected.status)}
                label={selected.overdue ? "overdue" : selected.status.toLowerCase().replaceAll("_", " ")}
              />
              <Box sx={{ ml: "auto" }}>
                <Chip
                  icon={<OpenInNewIcon sx={{ fontSize: "14px !important" }} />}
                  size="small" clickable
                  onClick={() => navigate(selected.detailPath)}
                  label="Open full detail"
                  sx={{ fontSize: 12, fontWeight: 600 }}
                />
              </Box>
            </Stack>
            <Typography sx={{
              fontFamily: "Space Grotesk, Manrope",
              fontSize: 22, fontWeight: 700, color: "#0f172a",
              letterSpacing: "-0.015em", mb: 1
            }}>
              {selected.subject}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "#64748b", mb: 3 }}>
              {selected.assignee ? `Assigned to ${selected.assignee.email.split("@")[0]}` : "Unassigned"}
              {" · "}
              Priority {selected.priority}
              {selected.severity ? ` · Severity ${selected.severity}` : ""}
              {selected.scheduledStart ? ` · Scheduled ${new Date(selected.scheduledStart).toLocaleDateString("en-GB")}` : ""}
            </Typography>
            <Box sx={{
              border: "1px dashed #cbd5e1", borderRadius: 1.5, p: 3,
              bgcolor: "#f8fafc", color: "#64748b", textAlign: "center"
            }}>
              <Typography sx={{ fontSize: 13 }}>
                Full conversation and properties available in the detail view.
              </Typography>
              <Typography sx={{ fontSize: 12, mt: 1 }}>
                Click <strong>Open full detail</strong> to view conversation thread, linked entities, and status controls.
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 3 }}>
            <EmptyState title="Select a ticket" detail="Pick a row from the list to preview it here." />
          </Box>
        )}
      </Box>
    </Box>
  )
}
