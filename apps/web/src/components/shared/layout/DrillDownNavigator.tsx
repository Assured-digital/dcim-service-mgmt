import * as React from "react"
import { useNavigate } from "react-router-dom"
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material"
import { useBreadcrumb } from "../../../routes/Shell"
import type { ThemeMode } from "../tokens/colors"

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
  /**
   * Opt-in theme mode for the compressed-rail chrome. Defaults to "light" → the
   * exact prior literal values, so callers that don't pass it (e.g. Risks &
   * Issues) are unchanged. Service Desk passes the live mode for dark support.
   */
  mode?: ThemeMode
}

// True for anything rendered inside the navigator. Lets a shared detail page
// (RecordDetailShell) drop its own "Back" button when the navigator already
// provides the back path (the rail header) — without per-page wiring. Default
// false, so standalone detail routes keep their Back button.
const DrillDownNavigatorContext = React.createContext(false)
export const useInDrillDownNavigator = () => React.useContext(DrillDownNavigatorContext)

// ── Enter-on-mount transition ──────────────────────────────────────────────
// Fades (and optionally slides) the wrapped content in over ~180ms when it
// mounts. ENTER-ONLY: outgoing content is replaced underneath with no exit
// animation. Re-fires whenever React remounts it via a changing `key` — the
// navigator keys the full panel on the depth boundary, so a drill-in/out
// re-triggers the enter while a same-depth param change (e.g. switching tickets
// or filters) does NOT remount it, keeping the warm component mounted and
// flash-free. `slideFrom` is the px x-offset to slide in from (+ = from the
// right / drilling in, − = from the left / drilling out, 0 = fade only).
// Honours prefers-reduced-motion (instant, no slide).
function PanelEnter({ slideFrom, children }: { slideFrom: number; children: React.ReactNode }) {
  const [entered, setEntered] = React.useState(false)
  React.useEffect(() => {
    // Double rAF: guarantees one painted frame at the initial (offset/transparent)
    // state before flipping, so the transition actually runs rather than snapping.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true))
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [])
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: entered ? 1 : 0,
        transform: entered ? "translateX(0)" : `translateX(${slideFrom}px)`,
        transition: "opacity 180ms ease-out, transform 180ms ease-out",
        "@media (prefers-reduced-motion: reduce)": { transition: "none", transform: "none" },
      }}
    >
      {children}
    </Box>
  )
}

export function DrillDownNavigator({ panels, railWidth = 56, mode = "light" }: DrillDownNavigatorProps) {
  const navigate = useNavigate()
  const theme = useTheme()
  const { setPageFullBleed, setNavCollapsed } = useBreadcrumb()
  // Compressed-rail chrome palette — light branch = the prior literals exactly.
  const dark = mode === "dark"
  const railBg = dark ? "#1e293b" : "#fff"
  const railBorder = dark ? "#334155" : "#e2e8f0"
  const railHover = dark ? "#172033" : "#f1f5f9"
  const railTitleColor = dark ? "#94a3b8" : "#475569"
  // Match Shell's `isMobile` breakpoint so the responsive renderer and the
  // shell's mobile layout flip at the same point (no flicker band).
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"))

  const depth = panels.length - 1

  // Enter-transition wiring. Key the full panel on the depth BOUNDARY (queue vs
  // record), not raw depth or the panel id: this fires the enter on 0→1 / 1→0
  // (which remount anyway — table and detail are different component types) but
  // not on a same-depth param change (ticket switch keeps the warm detail page
  // mounted → no flash) nor on opening the depth-2 drawer (which slides itself).
  const enterKey = depth >= 1 ? "rec" : "queue"
  // Direction from the depth delta: drilling in slides from the right, drilling
  // back from the left. Tracked across renders via a ref.
  const prevDepthRef = React.useRef(depth)
  const slideFrom = depth >= prevDepthRef.current ? 10 : -10
  React.useEffect(() => { prevDepthRef.current = depth }, [depth])

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
          <PanelEnter key={enterKey} slideFrom={slideFrom}>{last?.content}</PanelEnter>
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
              borderRight: `1px solid ${railBorder}`,
              bgcolor: railBg,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* Fade-only (slideFrom 0): the narrow strip shouldn't shift sideways.
                No key → mounts once when the rail first appears (0→1) and stays
                mounted across 1→2, so it animates in once and doesn't re-fire. */}
            <PanelEnter slideFrom={0}>{rail.railContent}</PanelEnter>
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
              borderRight: `1px solid ${railBorder}`,
              bgcolor: railBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.12s",
              "&:hover": { bgcolor: railHover },
            }}
          >
            <Typography
              sx={{
                writingMode: "vertical-rl",
                transform: "rotate(180deg)",
                fontSize: 12,
                fontWeight: 600,
                color: railTitleColor,
                whiteSpace: "nowrap",
                userSelect: "none",
              }}
            >
              {rail.railTitle}
            </Typography>
          </Box>
        )
      )}
      <PanelEnter key={enterKey} slideFrom={slideFrom}>
        {last?.content}
      </PanelEnter>
    </Box>
    </DrillDownNavigatorContext.Provider>
  )
}
