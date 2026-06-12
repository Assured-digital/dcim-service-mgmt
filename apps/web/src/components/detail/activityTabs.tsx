import * as React from "react"
import { Tab, Tabs } from "@mui/material"

// ─────────────────────────────────────────────────────────────────────────────
// Activity filter — shared config + Jira-style tab bar.
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
        "& .MuiTabs-indicator": { height: 2, backgroundColor: "#1d4ed8" },
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
        "& .MuiTab-root.Mui-selected": { color: "#1d4ed8" },
      }}
    >
      {FILTER_OPTIONS.map((opt) => (
        <Tab key={opt.value} value={opt.value} label={opt.label} disableRipple />
      ))}
    </Tabs>
  )
})
