import { createContext, useContext } from "react"

// Drill-down navigation for records rendered INSIDE the Service Desk navigator.
//
// The navigator owns the URL shape (queue → ticket → association, capped at
// depth 2). Rows in a detail page's right column (linked records, tasks) can't
// know that shape on their own — they only have a `(navType, id)`. So the
// navigator supplies a `drillTo` via context:
//   - depth-1 provider → PUSH a new depth-2 URL.
//   - depth-2 provider → REPLACE, reusing the fixed depth-1 prefix, so a click
//     on a depth-2 record's own associations swaps the viewer in place and can
//     never reach depth 3 (the cap).
// No provider (standalone Task/Risk/Issue/Maintenance pages) → null, and the row
// falls back to its existing absolute-route navigation.
//
// Optional `linkId`: when a linked-record row drills, it passes the id of the link
// it represents so the navigator can offer "Remove link" in the peek drawer's
// overflow menu (the removal needs the link identity, which only the row holds).

export type DrillFn = (navType: string, id: string, linkId?: string) => void

export const DrillNavContext = createContext<DrillFn | null>(null)

export function useDrillNav(): DrillFn | null {
  return useContext(DrillNavContext)
}
