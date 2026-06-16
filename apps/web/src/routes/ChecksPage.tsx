import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import {
  Box, Button, Dialog, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Tooltip, Typography
} from "@mui/material"
import FactCheckIcon from "@mui/icons-material/FactCheck"
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline"
import EventIcon from "@mui/icons-material/Event"
import EditNoteIcon from "@mui/icons-material/EditNote"
import HistoryIcon from "@mui/icons-material/History"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { semanticTokens } from "../components/shared"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { getCurrentUser } from "../lib/auth"
import { useAssignableUsers } from "../lib/useAssignableUsers"
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
  const { setPageFullBleed } = useBreadcrumb()

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
      navigate(`/checks/${res.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box>
      <Box sx={{ p: { xs: 1.5, sm: 2.5 }, display: "flex", flexDirection: "column", gap: 2.5 }}>
        {/* Header — title + History (Part 2) + Schedule check */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={1.5}
        >
          <Typography
            sx={{ fontFamily: "Space Grotesk, Manrope", fontSize: 20, fontWeight: 700, color: "#0f172a", flex: 1 }}
          >
            Engineering checks
          </Typography>
          <Tooltip title="Completed-check history — coming soon">
            <span>
              <Button
                size="small"
                variant="outlined"
                disabled
                startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
                sx={{ fontSize: 12 }}
              >
                History
              </Button>
            </span>
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
                icon={<FactCheckIcon sx={{ fontSize: 18, color: semanticTokens.warning.text }} />}
              >
                {queues.review.map((c) => (
                  <CheckCard key={c.id} check={c} variant="review" onOpen={openCheck} />
                ))}
              </QueueSection>
            ) : null}

            <QueueSection
              title={view === "engineer" ? "Your active work" : "In progress"}
              count={queues.progress.length}
              icon={<PlayCircleOutlineIcon sx={{ fontSize: 18, color: semanticTokens.active.text }} />}
            >
              {queues.progress.map((c) => (
                <CheckCard key={c.id} check={c} variant="progress" onOpen={openCheck} />
              ))}
            </QueueSection>

            <QueueSection
              title="Upcoming"
              count={queues.upcoming.length}
              icon={<EventIcon sx={{ fontSize: 18, color: semanticTokens.neutral.text }} />}
            >
              {queues.upcoming.map((c) => (
                <CheckCard key={c.id} check={c} variant="upcoming" onOpen={openCheck} />
              ))}
            </QueueSection>

            {view === "manager" ? (
              <QueueSection
                title="Drafts"
                count={queues.drafts.length}
                icon={<EditNoteIcon sx={{ fontSize: 18, color: semanticTokens.neutral.text }} />}
              >
                {queues.drafts.map((c) => (
                  <CheckCard key={c.id} check={c} variant="draft" onOpen={openCheck} />
                ))}
              </QueueSection>
            ) : null}
          </Stack>
        ) : null}
      </Box>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Schedule engineering check</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Template" value={templateId}
              onChange={(e) => setTemplateId(e.target.value)} required fullWidth>
              <MenuItem value="">Select a template...</MenuItem>
              {(templates ?? []).map(t => (
                <MenuItem key={t.id} value={t.id}>{t.name} — {t.checkType}</MenuItem>
              ))}
            </TextField>
            <TextField select label="Site" value={siteId}
              onChange={(e) => setSiteId(e.target.value)} required fullWidth>
              <MenuItem value="">Select a site...</MenuItem>
              {(sites ?? []).map(s => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </TextField>
            <TextField select label="Assign engineer (optional)" value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)} fullWidth>
              <MenuItem value="">Unassigned</MenuItem>
              {(users ?? []).map(u => (
                <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>
              ))}
            </TextField>
            <TextField type="date" label="Scheduled date (optional)"
              InputLabelProps={{ shrink: true }}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)} fullWidth />
            <TextField label="Scope notes (optional)" multiline rows={2}
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)} fullWidth />
            <Stack direction="row" justifyContent="flex-end" spacing={1}>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleCreate}
                disabled={saving || !templateId || !siteId}>
                {saving ? "Creating..." : "Schedule check"}
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
      </Dialog>
    </Box>
  )
}
