import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material"
import { useBreadcrumb } from "../../../routes/Shell"

// ── Drill-down navigator (shared layout primitive) ─────────────────────────
//
// A column-stacking navigator: the last panel renders FULL; every earlier panel
// is compressed into a narrow, clickable title-only rail. Drilling in / out is
// pure URL navigation — this component holds NO stack state. The adopter
// recomputes the `panels` array from the URL on every render and hands it in;
// clicking a rail navigates to that panel's own `path`.
//
// Phase 1 is structure + navigation only. Rails do NOT mount their `content`
// (only the full panel does), which keeps detail pages from mounting while
// compressed and avoids breadcrumb churn.

export interface DrillDownPanel {
  /** Stable React key, e.g. "queue" | "rec:sr:123". */
  key: string
  /** Title shown when this panel is compressed into a title-only rail. */
  railTitle: string
  /** Navigate target when this panel's rail is clicked (title-only rails only). */
  path: string
  /** Rendered ONLY when this is the last (full) panel. */
  content: React.ReactNode
  /**
   * Optional rich rail content. When set, it is rendered IN PLACE of the
   * vertical title while this panel is compressed into a rail, and the rail's
   * default click-to-navigate behaviour is dropped (the content owns its own
   * interactions). Keeps the primitive generic — adopters supply the markup.
   */
  railContent?: React.ReactNode
  /** Per-panel rail width override (px). Defaults to the navigator railWidth. */
  railWidth?: number
}

export interface DrillDownNavigatorProps {
  /** Ordered stack: last = full panel, earlier = compressed rails. */
  panels: DrillDownPanel[]
  /** Rail width in px. Default 56 matches the collapsed app sidebar. */
  railWidth?: number
}

// True for anything rendered inside the navigator. Lets a shared detail page
// (RecordDetailShell) drop its own "Back" button when the navigator already
// provides the back path (the rail header) — without per-page wiring. Default
// false, so standalone detail routes keep their Back button.
const DrillDownNavigatorContext = React.createContext(false)
export const useInDrillDownNavigator = () => React.useContext(DrillDownNavigatorContext)

export function DrillDownNavigator({ panels, railWidth = 56 }: DrillDownNavigatorProps) {
  const navigate = useNavigate()
  const theme = useTheme()
  const { setPageFullBleed, setNavCollapsed } = useBreadcrumb()
  // Match Shell's `isMobile` breakpoint so the responsive renderer and the
  // shell's mobile layout flip at the same point (no flicker band).
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"))

  const depth = panels.length - 1

  // Own the shell chrome: full-bleed while mounted, restored on unmount. The
  // Shell no longer resets full-bleed on pathname changes, so this mount-once
  // assertion holds across drill-in/out (the navigator stays mounted for the
  // whole /service-desk/* subtree).
  React.useEffect(() => {
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [setPageFullBleed])

  // Collapse the app sidebar once a record (or deeper) is open; restore at depth 0
  // and on unmount (leaving the navigator entirely).
  React.useEffect(() => {
    setNavCollapsed(depth >= 1)
    return () => setNavCollapsed(false)
  }, [depth, setNavCollapsed])

  const last = panels[panels.length - 1]
  const rails = panels.slice(0, -1)

  // Narrow viewport: only the deepest panel shows; back button pops a segment
  // via the URL. No rail compression (rails are a wide-viewport affordance).
  if (isNarrow) {
    return (
      <DrillDownNavigatorContext.Provider value={true}>
        <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {last?.content}
        </Box>
      </DrillDownNavigatorContext.Provider>
    )
  }

  return (
    <DrillDownNavigatorContext.Provider value={true}>
    <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {rails.map(rail =>
        rail.railContent ? (
          // Rich rail: adopter-provided content owns its own width + interactions.
          <Box
            key={rail.key}
            sx={{
              width: rail.railWidth ?? railWidth,
              flexShrink: 0,
              borderRight: "1px solid #e2e8f0",
              bgcolor: "#fff",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {rail.railContent}
          </Box>
        ) : (
          // Title-only rail: the whole strip is a back button.
          <Box
            key={rail.key}
            role="button"
            tabIndex={0}
            aria-label={`Back to ${rail.railTitle}`}
            onClick={() => navigate(rail.path)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(rail.path) } }}
            sx={{
              width: rail.railWidth ?? railWidth,
              flexShrink: 0,
              cursor: "pointer",
              borderRight: "1px solid #e2e8f0",
              bgcolor: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.12s",
              "&:hover": { bgcolor: "#f1f5f9" },
            }}
          >
            <Typography
              sx={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                fontSize: 12,
                fontWeight: 600,
                color: "#475569",
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              {rail.railTitle}
            </Typography>
          </Box>
        )
      )}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {last?.content}
      </Box>
    </Box>
    </DrillDownNavigatorContext.Provider>
  )
}
