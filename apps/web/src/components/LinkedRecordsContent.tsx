import React from "react"
import { useNavigate } from "react-router-dom"
import { Box, Button, IconButton, Tooltip, Typography, useTheme } from "@mui/material"
import AddIcon from "@mui/icons-material/Add"
import LinkOffIcon from "@mui/icons-material/LinkOff"
import { ResolvedLink, routeForLink, navSegmentForType } from "../lib/linkedRecords"
import { useDrillNav } from "../lib/drillNav"
import { accentToken, type ThemeMode } from "./shared/tokens/colors"
import { RecordTypeBadge } from "./RecordTypeBadge"
import { isHistoricalStatus, partitionByHistory } from "../lib/recordStatus"

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
function statusTone(status: string, mode: ThemeMode): { bg: string; fg: string } {
  if (isHistoricalStatus(status)) {
    return mode === "dark" ? { bg: "#1e293b", fg: "#94a3b8" } : { bg: "#eef2f6", fg: "#475569" }
  }
  // active tone = the blue identity wash (light value is byte-identical to the prior #e6f1fb/#185fa5)
  const blue = accentToken("blue", mode)
  return { bg: blue.bg, fg: blue.text }
}

export const LinkedRecordsContent = React.memo(function LinkedRecordsContent({
  links,
  onAddLink,
  onUnlink,
  showAddButton = true,
}: LinkedRecordsContentProps) {
  const navigate = useNavigate()
  const theme = useTheme()
  // Inside the Service Desk navigator, a row drills to depth 2 (in place);
  // standalone (no provider) it navigates to the record's own detail route.
  const drill = useDrillNav()
  const [view, setView] = React.useState<"live" | "history">("live")

  // Split active from closed (terminal-status) links so history stays accessible
  // without burying live work. Only surface the Live/History switch when there IS
  // history to show (keeps the common all-live panel clean).
  const { live, historical } = React.useMemo(() => partitionByHistory(links, (l) => l.status), [links])
  const shown = view === "live" ? live : historical

  return (
    <Box>
      {links.length === 0 ? (
        <Typography variant="caption" sx={{ color: "text.tertiary", display: "block", py: 0.5 }}>
          No linked records
        </Typography>
      ) : (
        <>
          {historical.length > 0 ? (
            <Box sx={{ display: "flex", gap: 1.5, mb: 0.5, borderBottom: "1px solid", borderColor: "divider" }}>
              {(["live", "history"] as const).map((v) => {
                const active = view === v
                const count = v === "live" ? live.length : historical.length
                return (
                  <Box
                    key={v}
                    onClick={() => setView(v)}
                    sx={{
                      py: 0.5, cursor: "pointer", fontSize: 11, fontWeight: 600, mb: "-1px",
                      color: active ? "primary.main" : "text.tertiary",
                      borderBottom: "2px solid", borderBottomColor: active ? "primary.main" : "transparent",
                    }}
                  >
                    {(v === "live" ? "Live" : "History") + ` (${count})`}
                  </Box>
                )
              })}
            </Box>
          ) : null}

          {shown.map((link) => {
          const tone = statusTone(link.status, theme.palette.mode)
          return (
            <Box
              key={link.linkId || `${link.type}:${link.id}`}
              onClick={() =>
                drill
                  ? drill(navSegmentForType(link.type), link.id, link.linkId)
                  : navigate(routeForLink(link))
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
              <RecordTypeBadge type={link.type} />
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
                    color: "text.tertiary",
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
              {/* Inline one-click remove — shown ONLY when the row does NOT drill into
                  the peek drawer (i.e. standalone pages with no drawer). When a row
                  drills (Service Desk navigator), removal moves to that drawer's ⋯
                  overflow menu (the deliberate gate), so no inline button here.
                  linkId is empty for hard-relation rows (e.g. a Task's parent
                  incident) — those are shown but not unlinkable. */}
              {!drill && link.linkId ? (
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
        })}
        </>
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
