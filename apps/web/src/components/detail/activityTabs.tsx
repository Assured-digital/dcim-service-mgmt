import * as React from "react"
import { Tab, Tabs } from "@mui/material"
import type { FeedEvent } from "./ActivityFeedItem"

// ─────────────────────────────────────────────────────────────────────────────
// Activity filter — shared config + tab bar.
//
// Single source of truth for the activity section's filter tabs, used by every
// record detail page. Two tabs only: Comments (the comment/work-note thread) and
// History (internal value "all" — the unified audit stream). The old Status and
// Assignments tabs were removed: History now renders the audit stream directly via
// the shared AuditHistoryList/humaniseAuditEvent, which supersedes those slices.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityFilter = "comment" | "all"

export const FILTER_VALUES: readonly ActivityFilter[] = ["comment", "all"]

export const DEFAULT_ACTIVITY_FILTER: ActivityFilter = "comment"

export const FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "comment", label: "Comments" },
  { value: "all", label: "History" },
]

// Maps the selected tab → the visible feed slice for the COMMENTS tab only. History
// ("all") no longer flows through here — it renders the audit stream directly via
// AuditHistoryList — so the "all" branch is effectively unused (it just yields the
// non-comment remainder, which is now empty since pages only build comment feed events).
export function filterFeedEvents(
  events: FeedEvent[],
  filter: ActivityFilter
): FeedEvent[] {
  if (filter === "all") return events.filter((e) => e.type !== "comment")
  return events.filter((e) => e.type === filter)
}

interface ActivityTabsProps {
  value: ActivityFilter
  onChange: (filter: ActivityFilter) => void
}

export const ActivityTabs = React.memo(function ActivityTabs({
  value,
  onChange,
}: ActivityTabsProps) {
  const handleChange = React.useCallback(
    (_e: React.SyntheticEvent, next: ActivityFilter) => onChange(next),
    [onChange]
  )

  return (
    <Tabs
      value={value}
      onChange={handleChange}
      variant="standard"
      sx={{
        mb: 1.5,
        minHeight: 36,
        borderBottom: "1px solid",
        borderColor: "divider",
        "& .MuiTabs-indicator": { height: 2, backgroundColor: "primary.main" },
        "& .MuiTab-root": {
          minHeight: 36,
          minWidth: 0,
          px: 0,
          mr: 2.5,
          py: 0.75,
          fontSize: 13,
          fontWeight: 600,
          textTransform: "none",
          color: "text.secondary",
        },
        "& .MuiTab-root.Mui-selected": { color: "primary.main" },
      }}
    >
      {FILTER_OPTIONS.map((opt) => (
        <Tab key={opt.value} value={opt.value} label={opt.label} disableRipple />
      ))}
    </Tabs>
  )
})
