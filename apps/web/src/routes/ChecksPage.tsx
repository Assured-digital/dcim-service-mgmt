import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Stack, Tooltip, Typography
} from "@mui/material"
import { CreateRecordModal } from "../components/create/CreateRecordModal"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline"
import EventIcon from "@mui/icons-material/Event"
import EditNoteIcon from "@mui/icons-material/EditNote"
import HistoryIcon from "@mui/icons-material/History"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { semanticToken } from "../components/shared"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getCurrentUser } from "../lib/auth"
import { PAGE_GUTTER } from "../lib/layout"
import { useThemeMode } from "../lib/theme"
import { useBreadcrumb } from "./Shell"
import {
  CheckCard,
  QueueSection,
  partitionChecks,
  type Check,
  type CheckView,
} from "../components/checks/CheckCard"

type Template = { id: string; name: string; checkType: string }
type Site = { id: string; name: string }

export default function ChecksPage() {
  const navigate = useNavigate()
  const { setPageFullBleed } = useBreadcrumb()
  const { mode } = useThemeMode()

  // Schedule-check gate == manager-tier, matching the controller's create role set
  // (ORG_SUPER + SERVICE_MANAGER + SERVICE_DESK_ANALYST) so the UI never offers an
  // action the API rejects.
  const isManagerTier = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST])
  const isEngineer = hasAnyRole([ROLES.ENGINEER])
  const canManage = isManagerTier
  const view: CheckView = isManagerTier ? "manager" : isEngineer ? "engineer" : "viewer"
  const meId = getCurrentUser()?.userId ?? ""

  const [createOpen, setCreateOpen] = React.useState(false)

  // Active workday landing — a list page, so claim full-bleed (Shell drops its padding).
  React.useEffect(() => {
    setPageFullBleed(true)
    return () => setPageFullBleed(false)
  }, [setPageFullBleed])

  const { data, isLoading, error } = useQuery({
    queryKey: ["checks"],
    queryFn: async () => (await api.get<Check[]>("/checks")).data
  })

  const { data: templates } = useQuery({
    queryKey: ["check-templates"],
    queryFn: async () => (await api.get<Template[]>("/checks/templates")).data
  })

  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/sites")).data
  })

  // Template + Site options for the shared create surface's asyncEnum fields.
  const templateOptions = React.useMemo(
    () => (templates ?? []).map((t) => ({ value: t.id, label: `${t.name} — ${t.checkType}` })),
    [templates]
  )
  const siteOptions = React.useMemo(
    () => (sites ?? []).map((s) => ({ value: s.id, label: s.name })),
    [sites]
  )

  const all = data ?? []
  const queues = React.useMemo(() => partitionChecks(all, view, meId), [all, view, meId])
  const totalActive = queues.review.length + queues.progress.length + queues.upcoming.length + queues.drafts.length

  const openCheck = (id: string) => navigate(`/checks/${id}`)

  return (
    <Box>
      {/* Full-bleed page re-adds the standard gutter for its card content — via the
          shared constant so it matches the Shell value AND breakpoint (md, not sm). */}
      <Box sx={{ p: PAGE_GUTTER, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {/* Header — title + History (Part 2) + Schedule check */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={1.5}
        >
          <Typography
            sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 20, fontWeight: 700, color: "text.primary", flex: 1 }}
          >
            Engineering checks
          </Typography>
          <Tooltip title="Completed & closed check history">
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate("/checks/history")}
              startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
              sx={{ fontSize: 12 }}
            >
              History
            </Button>
          </Tooltip>
          {canManage ? (
            <Button size="small" variant="contained" onClick={() => setCreateOpen(true)} sx={{ fontSize: 12 }}>
              Schedule check
            </Button>
          ) : null}
        </Stack>

        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorState title="Failed to load engineering checks" /> : null}

        {!isLoading && !error && totalActive === 0 ? (
          <EmptyState
            title="You're all caught up"
            detail={canManage ? "No active checks. Schedule a check to get started." : "No active checks right now."}
          />
        ) : null}

        {!isLoading && !error && totalActive > 0 ? (
          <Stack spacing={2.5}>
            {view === "manager" ? (
              <QueueSection
                title="Awaiting your review"
                count={queues.review.length}
                icon={<FactCheckIcon sx={{ fontSize: 18, color: semanticToken("warning", mode).text }} />}
              >
                {queues.review.map((c) => (
                  <CheckCard key={c.id} check={c} variant="review" onOpen={openCheck} />
                ))}
              </QueueSection>
            ) : null}

            <QueueSection
              title={view === "engineer" ? "Your active work" : "In progress"}
              count={queues.progress.length}
              icon={<PlayCircleOutlineIcon sx={{ fontSize: 18, color: semanticToken("active", mode).text }} />}
            >
              {queues.progress.map((c) => (
                <CheckCard key={c.id} check={c} variant="progress" onOpen={openCheck} />
              ))}
            </QueueSection>

            <QueueSection
              title="Upcoming"
              count={queues.upcoming.length}
              icon={<EventIcon sx={{ fontSize: 18, color: semanticToken("neutral", mode).text }} />}
            >
              {queues.upcoming.map((c) => (
                <CheckCard key={c.id} check={c} variant="upcoming" onOpen={openCheck} />
              ))}
            </QueueSection>

            {view === "manager" ? (
              <QueueSection
                title="Drafts"
                count={queues.drafts.length}
                icon={<EditNoteIcon sx={{ fontSize: 18, color: semanticToken("neutral", mode).text }} />}
              >
                {queues.drafts.map((c) => (
                  <CheckCard key={c.id} check={c} variant="draft" onOpen={openCheck} />
                ))}
              </QueueSection>
            ) : null}
          </Stack>
        ) : null}
      </Box>

      <CreateRecordModal
        recordType="check"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        asyncOptions={{ templates: templateOptions, sites: siteOptions }}
      />
    </Box>
  )
}
