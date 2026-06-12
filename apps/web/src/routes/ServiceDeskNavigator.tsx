import React from "react"
import { Routes, Route, useParams, useNavigate, useSearchParams } from "react-router-dom"
import { Drawer, Box, IconButton, Button } from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import { DrillDownNavigator, type DrillDownPanel } from "../components/shared"
import { ServiceDeskQueueBody } from "./ServiceDeskPage"
import { ServiceDeskQueueRail } from "./ServiceDeskQueueRail"
import ServiceRequestDetailPage from "./ServiceRequestDetailPage"
import IncidentDetailPage from "./IncidentDetailPage"
import ChangeDetailPage from "./ChangeDetailPage"
import TaskDetailPage from "./TaskDetailPage"
import RiskDetailPage from "./RiskDetailPage"
import IssueDetailPage from "./IssueDetailPage"
import { DrillNavContext, type DrillFn } from "../lib/drillNav"
import { routeForSegment } from "../lib/linkedRecords"

// ── Service Desk drill-down adopter ────────────────────────────────────────
//
// First adopter of the shared DrillDownNavigator. The URL is the single source
// of truth — this component holds NO stack state, it recomputes the panel stack
// from the path on every render:
//
//   /service-desk                                  → depth 0 (queue)
//   /service-desk/:type/:id                        → depth 1 (record open)
//   /service-desk/:type/:id/:assocType/:assocId    → depth 2 (association open, cap)
//
// :type is the existing sr|inc|chg prefix, so detailPath and the detail pages'
// useParams().id stay untouched. :assocType extends to all six work-item types
// (sr|inc|chg|task|risk|issue) — see navSegmentForType in lib/linkedRecords.

const REF_LABEL: Record<string, string> = {
  sr: "SR",
  inc: "INC",
  chg: "CHG",
  task: "TASK",
  risk: "RISK",
  issue: "ISSUE",
}

export default function ServiceDeskNavigator() {
  const params = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const segments = (params["*"] ?? "").split("/").filter(Boolean)
  const [type, id, assocType, assocId] = segments
  const depth = !type ? 0 : assocType ? 2 : 1

  // Drill-down from a depth-1 record's right column: PUSH a depth-2 URL so back
  // returns to the ticket. The filter query string is preserved so the queue
  // rail keeps its working-set context.
  const search = searchParams.toString()
  const drillPush = React.useCallback<DrillFn>(
    (nt, aid) => navigate({ pathname: `/service-desk/${type}/${id}/${nt}/${aid}`, search }),
    [navigate, type, id, search]
  )
  // Closing the depth-2 drawer returns to the depth-1 ticket, preserving the
  // filter query string. (Escape/backdrop and the X button both call this.)
  const closeDrawer = React.useCallback(
    () => navigate({ pathname: `/service-desk/${type}/${id}`, search }),
    [navigate, type, id, search]
  )

  const panels: DrillDownPanel[] = [
    {
      key: "queue",
      railTitle: "Queue",
      path: "/service-desk",
      content: <ServiceDeskQueueBody />,
      // When compressed (depth ≥ 1) the queue rail becomes the working-queue
      // ticket selector — same filtered/sorted set as the table, driven by the
      // URL params. `id` is the open ticket so it can be marked active.
      railContent: <ServiceDeskQueueRail activeId={id} />,
      railWidth: 280,
    },
  ]

  if (depth >= 1) {
    panels.push({
      key: `rec:${type}:${id}`,
      railTitle: REF_LABEL[type] ?? "REC",
      path: `/service-desk/${type}/${id}`,
      // Descendant <Routes> re-establishes the :id param so the UNCHANGED detail
      // pages keep working. The `/*` suffix lets depth-2 URLs still match here
      // (id resolves; the trailing assoc segments are absorbed by the splat).
      // Wrapped in the PUSH drill provider so right-column rows open depth 2.
      content: (
        <DrillNavContext.Provider value={drillPush}>
          <Routes>
            <Route path="sr/:id/*" element={<ServiceRequestDetailPage />} />
            <Route path="inc/:id/*" element={<IncidentDetailPage />} />
            <Route path="chg/:id/*" element={<ChangeDetailPage />} />
          </Routes>
        </DrillNavContext.Provider>
      ),
    })
  }

  // Depth 2 no longer pushes a third panel — the depth-1 view renders normally
  // (queue rail + full ticket) and the association opens in a modal drawer over
  // it. The drawer reuses the SAME descendant <Routes> the panel used, but is
  // intentionally NOT wrapped in a DrillNavContext provider: with no provider,
  // useDrillNav() returns null inside the drawer so its own rows fall back to
  // standalone navigation — the drawer is a drill dead-end (no drawer-opens-drawer,
  // hence the depth cap). "Open full" navigates to the record's own route.
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
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                borderBottom: "1px solid #e2e8f0",
                flexShrink: 0,
              }}
            >
              <IconButton aria-label="Close" size="small" onClick={closeDrawer}>
                <CloseIcon fontSize="small" />
              </IconButton>
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                onClick={() => navigate({ pathname: routeForSegment(assocType, assocId), search })}
              >
                Open full
              </Button>
            </Box>
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
          </>
        )}
      </Drawer>
    </>
  )
}
