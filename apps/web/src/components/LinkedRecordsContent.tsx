import React from "react"
import { useNavigate } from "react-router-dom"
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import LinkOffIcon from "@mui/icons-material/LinkOff"
import { ResolvedLink, routeForLink, navSegmentForType, visualForType } from "../lib/linkedRecords"
import { useDrillNav } from "../lib/drillNav"

interface LinkedRecordsContentProps {
  links: ResolvedLink[]
  onAddLink: () => void
  onUnlink: (linkId: string) => void
  // Inline "Link record" button below the list. Shell pages hoist the add action
  // to the section header "+", so they pass false; non-shell consumers keep default.
  showAddButton?: boolean
}

// Coarse semantic tone for a status pill — terminal states read as "done" (slate),
// everything else as active (blue). Avoids a per-type status colour map while still
// giving the spec's coloured badge.
const TERMINAL = /(closed|resolved|done|complete|completed|cancelled|canceled|rejected|retired|implemented)/i

function statusTone(status: string): { bg: string; fg: string } {
  return TERMINAL.test(status)
    ? { bg: "#eef2f6", fg: "#475569" }
    : { bg: "#e6f1fb", fg: "#185fa5" }
}

export const LinkedRecordsContent = React.memo(function LinkedRecordsContent({
  links,
  onAddLink,
  onUnlink,
  showAddButton = true,
}: LinkedRecordsContentProps) {
  const navigate = useNavigate()
  // Inside the Service Desk navigator, a row drills to depth 2 (in place);
  // standalone (no provider) it navigates to the record's own detail route.
  const drill = useDrillNav()

  return (
    <Box>
      {links.length === 0 ? (
        <Typography variant="caption" sx={{ color: "var(--color-text-tertiary)", display: "block", py: 0.5 }}>
          No linked records
        </Typography>
      ) : (
        links.map((link) => {
          const visual = visualForType(link.type)
          const Icon = visual.Icon
          const tone = statusTone(link.status)
          return (
            <Box
              key={link.linkId}
              onClick={() =>
                drill ? drill(navSegmentForType(link.type), link.id) : navigate(routeForLink(link))
              }
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 0.625,
                borderRadius: 1,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
                "&:hover .rl-unlink": { opacity: 1 },
              }}
            >
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: 1,
                  bgcolor: visual.bg,
                  color: visual.fg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon sx={{ fontSize: 14 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 12,
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "text.primary",
                  }}
                >
                  {link.title}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: "var(--color-text-tertiary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {link.reference}
                </Typography>
              </Box>
              {link.status ? (
                <Box
                  sx={{
                    flexShrink: 0,
                    fontSize: 10,
                    fontWeight: 600,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: 0.75,
                    bgcolor: tone.bg,
                    color: tone.fg,
                    textTransform: "uppercase",
                    letterSpacing: 0.2,
                  }}
                >
                  {link.status}
                </Box>
              ) : null}
              {/* linkId is empty for hard-relation rows (e.g. a Task's parent
                  incident) — those are shown but not unlinkable here. */}
              {link.linkId ? (
                <Tooltip title="Remove link">
                  <IconButton
                    className="rl-unlink"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      onUnlink(link.linkId)
                    }}
                    sx={{ opacity: 0, transition: "opacity 0.15s", flexShrink: 0, p: 0.25 }}
                  >
                    <LinkOffIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Box>
          )
        })
      )}
      {showAddButton ? (
        <Button
          variant="text"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 14 }} />}
          onClick={onAddLink}
          sx={{ textTransform: "none", mt: 0.25 }}
        >
          Link record
        </Button>
      ) : null}
    </Box>
  )
})
