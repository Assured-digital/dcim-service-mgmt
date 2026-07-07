import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Stack, Tooltip, Typography
} from "@mui/material"
import { FormDialog, EnumSelect, DateField, AssigneePicker, FormTextField } from "../components/fields"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline"
import EventIcon from "@mui/icons-material/Event"
import EditNoteIcon from "@mui/icons-material/EditNote"
import HistoryIcon from "@mui/icons-material/History"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { semanticToken } from "../components/shared"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getCurrentUser } from "../lib/auth"
import { useAssignableUsers } from "../lib/useAssignableUsers"
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
  const qc = useQueryClient()
  const { notify } = useNotification()
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
  const [templateId, setTemplateId] = React.useState("")
  const [siteId, setSiteId] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [scheduledAt, setScheduledAt] = React.useState("")
  const [scopeNotes, setScopeNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)

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

  // Assignee picker source ("Assign engineer") — operational-callable &
  // client-scoped, replacing admin-only GET /users. value = id, label = displayName.
  const { data: users } = useAssignableUsers()

  const all = data ?? []
  const queues = React.useMemo(() => partitionChecks(all, view, meId), [all, view, meId])
  const totalActive = queues.review.length + queues.progress.length + queues.upcoming.length + queues.drafts.length

  const openCheck = (id: string) => navigate(`/checks/${id}`)

  async function handleCreate() {
    if (!templateId || !siteId) return
    setSaving(true)
    try {
      const res = await api.post("/checks", {
        templateId,
        siteId,
        assigneeId: assigneeId || undefined,
        scheduledAt: scheduledAt || undefined,
        scopeNotes: scopeNotes || undefined
      })
      setCreateOpen(false)
      setTemplateId(""); setSiteId(""); setAssigneeId("")
      setScheduledAt(""); setScopeNotes("")
      qc.invalidateQueries({ queryKey: ["checks"] })
      // Navigates to the new check, so the toast (app-level) is the lasting confirmation.
      notify.success("Check scheduled")
      navigate(`/checks/${res.data.id}`)
    } catch {
      // Was fully silent on failure (dialog just stayed open) — surface it.
      notify.error("Couldn't schedule the check — please try again")
    } finally {
      setSaving(false)
    }
  }

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

      <FormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="sm"
        title="Schedule engineering check"
        submitLabel="Schedule check"
        submittingLabel="Creating…"
        submitting={saving}
        canSubmit={!!templateId && !!siteId}
        onSubmit={handleCreate}
      >
        <EnumSelect span="full" label="Template" required value={templateId}
          onChange={setTemplateId} includeEmpty="Select a template..."
          options={(templates ?? []).map(t => ({ value: t.id, label: `${t.name} — ${t.checkType}` }))} />
        <EnumSelect span="full" label="Site" required value={siteId}
          onChange={setSiteId} includeEmpty="Select a site..."
          options={(sites ?? []).map(s => ({ value: s.id, label: s.name }))} />
        <AssigneePicker span="full" label="Assign engineer (optional)" value={assigneeId} onChange={setAssigneeId} />
        <DateField span="full" label="Scheduled date (optional)" value={scheduledAt} onChange={setScheduledAt} />
        <FormTextField span="full" label="Scope notes (optional)" multiline rows={2}
          value={scopeNotes} onChange={(e) => setScopeNotes(e.target.value)} />
      </FormDialog>
    </Box>
  )
}
