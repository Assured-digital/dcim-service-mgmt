import * as React from "react"
import { Tab, Tabs } from "@mui/material"
import type { FeedEvent } from "./ActivityFeedItem"

// ─────────────────────────────────────────────────────────────────────────────
// Activity filter — shared config + tab bar.
//
// Single source of truth for the activity section's filter tabs, used by every
// record detail page. The internal value "all" is deliberately preserved (it is
// LABELLED "History") so each page's existing filter logic — `activeFilter === "all"`
// returns the full feed — stays untouched. The underlying feed event mapping still
// emits "link" events; they simply have no dedicated tab and surface under History.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityFilter = "comment" | "all" | "status" | "assignment"

export const FILTER_VALUES: readonly ActivityFilter[] = [
  "comment",
  "all",
  "status",
  "assignment",
]

export const DEFAULT_ACTIVITY_FILTER: ActivityFilter = "comment"

export const FILTER_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "comment", label: "Comments" },
  { value: "all", label: "History" },
  { value: "status", label: "Status" },
  { value: "assignment", label: "Assignments" },
]

// Single source of truth for mapping the selected tab → the visible feed slice.
// Every detail page routes its feed through this so the tabs stay consistent.
//
// "History" (internal value "all") shows system/audit events ONLY — it deliberately
// EXCLUDES comment posts. Comment events carry their own threads + inline reply
// fields (see ActivityFeedItem threading), so dropping `type === "comment"` here
// removes comments, replies AND reply fields from History in one cut. Comments live
// solely on the Comments tab. The other tabs match their event type directly.
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
