import * as React from "react"
import {
  DEFAULT_ACTIVITY_FILTER,
  type ActivityFilter,
} from "../components/detail/activityTabs"

// ─────────────────────────────────────────────────────────────────────────────
// Per-instance Activity-section tab state.
//
// Each detail page instance owns its own selected filter via local component
// state, so two detail pages mounted at once keep INDEPENDENT Activity tabs —
// e.g. the navigator's depth-1 ticket rendered behind the association-peek
// drawer's detail page. Previously the selected tab was backed by the router's
// `?activity=` URL search param, a single global value shared by every mounted
// instance, so switching one page's tab switched the other's too.
//
// The filter VALUES and tab visuals are unchanged — this only scopes WHERE the
// selection lives.
// ─────────────────────────────────────────────────────────────────────────────
export function useActivityFilter() {
  const [activeFilter, setActiveFilter] =
    React.useState<ActivityFilter>(DEFAULT_ACTIVITY_FILTER)

  const handleFilterChange = React.useCallback(
    (filter: ActivityFilter) => setActiveFilter(filter),
    []
  )

  // After posting a comment/work-note, surface it by dropping back to the
  // default (Comments) tab — unless the user is viewing the full History feed
  // ("all"), which already includes the new note. Mirrors the prior
  // `delete("activity")` reset behaviour.
  const resetFilterAfterComment = React.useCallback(() => {
    setActiveFilter((prev) => (prev !== "all" ? DEFAULT_ACTIVITY_FILTER : prev))
  }, [])

  return { activeFilter, handleFilterChange, resetFilterAfterComment }
}
