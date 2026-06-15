import React from "react"
import { Routes, Route, useParams, useNavigate, useSearchParams } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Drawer, Box, IconButton } from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import { DrillDownNavigator, type DrillDownPanel } from "../components/shared"
import { RisksIssuesQueueBody } from "./RisksIssuesPage"
import { RisksIssuesQueueRail } from "./RisksIssuesQueueRail"
import RiskDetailPage from "./RiskDetailPage"
import IssueDetailPage from "./IssueDetailPage"
import ServiceRequestDetailPage from "./ServiceRequestDetailPage"
import IncidentDetailPage from "./IncidentDetailPage"
import ChangeDetailPage from "./ChangeDetailPage"
import TaskDetailPage from "./TaskDetailPage"
import { DrillNavContext, type DrillFn } from "../lib/drillNav"
import { DetailNarrowProvider, DetailDrawerChromeProvider } from "../components/detail"
import { routeForSegment, deleteRecordLink } from "../lib/linkedRecords"

// ── Risks & Issues drill-down adopter ──────────────────────────────────────
//
// Second adopter of the shared DrillDownNavigator (mirrors ServiceDeskNavigator).
// The URL is the single source of truth — this component holds NO stack state, it
// recomputes the panel stack from the path on every render:
//
//   /risks-issues                                  → depth 0 (list)
//   /risks-issues/:type/:id                        → depth 1 (record open)
//   /risks-issues/:type/:id/:assocType/:assocId    → depth 2 (association open, cap)
//
// :type is the existing risks|issues prefix, so detailPath and the detail pages'
// useParams().id stay untouched. :assocType extends to all six work-item types
// (sr|inc|chg|task|risk|issue) — see navSegmentForType in lib/linkedRecords.

const REF_LABEL: Record<string, string> = {
  risks: "RISK",
  issues: "ISSUE",
}

// React Query key for the depth-1 record's detail query, so removing a link from the
// drawer can refresh the parent's "Linked records" list. Keyed by the depth-1 :type
// segment (only risks|issues open at depth 1).
const DETAIL_QUERY_KEY: Record<string, string> = {
  risks: "risk-detail",
  issues: "issue-detail",
}

export default function RisksIssuesNavigator() {
  const params = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const segments = (params["*"] ?? "").split("/").filter(Boolean)
  const [type, id, assocType, assocId] = segments
  const depth = !type ? 0 : assocType ? 2 : 1

  // The id of the link being peeked, carried in the URL by the drilling row (`lid`)
  // so the drawer's "Remove link" knows which RecordLink to delete. `baseSearch` is
  // the filter query string WITHOUT it — used for clean back / open-full navigation.
  const linkId = searchParams.get("lid") ?? undefined
  const baseSearch = React.useMemo(() => {
    const sp = new URLSearchParams(searchParams)
    sp.delete("lid")
    return sp.toString()
  }, [searchParams])

  // Drill-down from a depth-1 record's right column: PUSH a depth-2 URL so back
  // returns to the record. The filter query string is preserved so the queue rail
  // keeps its working-set context; a linked-record row also stashes its `lid`.
  const drillPush = React.useCallback<DrillFn>(
    (nt, aid, lid) => {
      const sp = new URLSearchParams(searchParams)
      if (lid) sp.set("lid", lid)
      else sp.delete("lid")
      navigate({ pathname: `/risks-issues/${type}/${id}/${nt}/${aid}`, search: sp.toString() })
    },
    [navigate, type, id, searchParams]
  )
  // Closing the depth-2 drawer returns to the depth-1 record, preserving the
  // filter query string (minus the drawer-only `lid`). (Escape/backdrop and the X
  // button both call this.)
  const closeDrawer = React.useCallback(
    () => navigate({ pathname: `/risks-issues/${type}/${id}`, search: baseSearch }),
    [navigate, type, id, baseSearch]
  )

  // "Remove link" in the drawer's ⋯ menu: delete the link between the depth-1 record
  // and the one open in the drawer (reuses the shared deleteRecordLink), then refresh
  // the parent's "Linked records" list and close the drawer. Fires immediately — the
  // menu step IS the deliberate gate (no confirm).
  const removeLinkMutation = useMutation({
    mutationFn: (lid: string) => deleteRecordLink(lid),
    onSuccess: () => {
      const key = DETAIL_QUERY_KEY[type]
      if (key) qc.invalidateQueries({ queryKey: [key, id] })
      closeDrawer()
    },
  })
  const onRemoveLink = React.useCallback(() => {
    if (linkId) removeLinkMutation.mutate(linkId)
  }, [linkId, removeLinkMutation])

  // The drawer's detail shell portals its status control into this header slot, and
  // folds "Open full" into its overflow menu (see DetailDrawerChrome). The slot is a
  // DOM node published via state so the shell re-renders the portal once it mounts.
  const [headerSlot, setHeaderSlot] = React.useState<HTMLElement | null>(null)
  const onOpenFull = React.useCallback(
    () => navigate({ pathname: routeForSegment(assocType, assocId), search: baseSearch }),
    [navigate, assocType, assocId, baseSearch]
  )
  const drawerChrome = React.useMemo(
    // onRemoveLink only when the drawer was reached via a linked-record row (lid present).
    () => ({ headerSlot, onOpenFull, onRemoveLink: linkId ? onRemoveLink : undefined }),
    [headerSlot, onOpenFull, linkId, onRemoveLink]
  )

  const panels: DrillDownPanel[] = [
    {
      key: "list",
      railTitle: "List",
      path: "/risks-issues",
      content: <RisksIssuesQueueBody />,
      // When compressed (depth ≥ 1) the list rail becomes the working-queue record
      // selector — same filtered/sorted set as the grid, driven by the URL params.
      // `id` is the open record so it can be marked active.
      railContent: <RisksIssuesQueueRail activeId={id} />,
      railWidth: 280,
    },
  ]

  if (depth >= 1) {
    panels.push({
      key: `rec:${type}:${id}`,
      railTitle: REF_LABEL[type] ?? "REC",
      path: `/risks-issues/${type}/${id}`,
      // Descendant <Routes> re-establishes the :id param so the UNCHANGED detail
      // pages keep working. The `/*` suffix lets depth-2 URLs still match here
      // (id resolves; the trailing assoc segments are absorbed by the splat).
      // Wrapped in the PUSH drill provider so right-column rows open depth 2.
      content: (
        <DrillNavContext.Provider value={drillPush}>
          <Routes>
            <Route path="risks/:id/*" element={<RiskDetailPage />} />
            <Route path="issues/:id/*" element={<IssueDetailPage />} />
          </Routes>
        </DrillNavContext.Provider>
      ),
    })
  }

  // Depth 2 does not push a third panel — the depth-1 view renders normally (queue
  // rail + full record) and the association opens in a modal drawer over it. The
  // drawer reuses the SAME descendant <Routes> the panel used, but is intentionally
  // NOT wrapped in a DrillNavContext provider: with no provider, useDrillNav()
  // returns null inside the drawer so its own rows fall back to standalone navigation
  // — the drawer is a drill dead-end (no drawer-opens-drawer, hence the depth cap).
  // "Open full" navigates to the record's own route.
  return (
    <>
      <DrillDownNavigator panels={panels} />
      <Drawer
        anchor="right"
        open={depth === 2}
        onClose={closeDrawer}
        PaperProps={{
          sx: { width: { xs: "100%", sm: "50vw" }, display: "flex", flexDirection: "column" },
        }}
      >
        {depth === 2 && (
          <>
            {/* Drawer header: X (left) … status + ⋯ (right). The status cluster is
                portaled in by the detail shell via the headerSlot below; "Open full"
                is folded into that ⋯ overflow menu (no standalone button). */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                borderBottom: "1px solid #e2e8f0",
                flexShrink: 0,
                minHeight: 48,
              }}
            >
              <IconButton aria-label="Close" size="small" onClick={closeDrawer}>
                <CloseIcon fontSize="small" />
              </IconButton>
              <Box sx={{ flex: 1 }} />
              <Box ref={setHeaderSlot} sx={{ display: "flex", alignItems: "center" }} />
            </Box>
            {/* The drawer is half-width, so the detail shell stacks to a single
                column and drops its redundant inner top row. DetailNarrowProvider
                signals this; DetailDrawerChromeProvider bridges the status control up
                to the header slot. The main depth-1 panel is NOT wrapped → stays wide. */}
            <DetailNarrowProvider value={true}>
              <DetailDrawerChromeProvider value={drawerChrome}>
                <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                  <Routes>
                    <Route path=":t/:tid/sr/:id/*" element={<ServiceRequestDetailPage />} />
                    <Route path=":t/:tid/inc/:id/*" element={<IncidentDetailPage />} />
                    <Route path=":t/:tid/chg/:id/*" element={<ChangeDetailPage />} />
                    <Route path=":t/:tid/task/:id/*" element={<TaskDetailPage />} />
                    <Route path=":t/:tid/risk/:id/*" element={<RiskDetailPage />} />
                    <Route path=":t/:tid/issue/:id/*" element={<IssueDetailPage />} />
                  </Routes>
                </Box>
              </DetailDrawerChromeProvider>
            </DetailNarrowProvider>
          </>
        )}
      </Drawer>
    </>
  )
}
