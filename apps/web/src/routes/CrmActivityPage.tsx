import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Autocomplete, Box, Button, Card, Chip, Drawer, MenuItem, Stack, TextField, Typography
} from "@mui/material"
import AddCommentIcon from "@mui/icons-material/AddComment"
import CallIcon from "@mui/icons-material/Call"
import GroupsIcon from "@mui/icons-material/Groups"
import MailOutlineIcon from "@mui/icons-material/MailOutline"
import PlaceIcon from "@mui/icons-material/Place"
import StickyNote2OutlinedIcon from "@mui/icons-material/StickyNote2Outlined"
import EditIcon from "@mui/icons-material/Edit"
import AddTaskIcon from "@mui/icons-material/AddTask"
import { EmptyState, ErrorState, LoadingState } from "../components/PageState"
import { useThemeMode } from "../lib/theme"
import { getCurrentUser } from "../lib/auth"
import { ORG_SUPER_ROLES } from "../lib/rbac"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { type ApiError } from "../lib/api"
import {
  ACTIVITY_TYPES, ACTIVITY_TYPE_LABELS, contactDisplayName,
  createActivity, createActivityFollowUp, listActivities, listContacts, updateActivity,
  type ActivityInput, type ActivityView, type FollowUpInput
} from "../lib/crm"

const TYPE_ICONS: Record<string, React.ReactNode> = {
  CALL: <CallIcon sx={{ fontSize: 16 }} />,
  MEETING: <GroupsIcon sx={{ fontSize: 16 }} />,
  EMAIL: <MailOutlineIcon sx={{ fontSize: 16 }} />,
  SITE_VISIT: <PlaceIcon sx={{ fontSize: 16 }} />,
  NOTE: <StickyNote2OutlinedIcon sx={{ fontSize: 16 }} />
}

// ── Log/edit drawer ────────────────────────────────────────────────────────
type DrawerState = { open: boolean; activity: ActivityView | null }

function ActivityFormDrawer({ state, onClose }: { state: DrawerState; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!state.activity
  const a = state.activity

  const [form, setForm] = React.useState<ActivityInput>({ type: "CALL", subject: "" })

  React.useEffect(() => {
    if (!state.open) return
    setForm(a ? {
      type: a.type,
      subject: a.subject,
      body: a.body ?? undefined,
      occurredAt: a.occurredAt,
      contactIds: a.contacts.map(c => c.id)
    } : { type: "CALL", subject: "" })
  }, [state.open, a])

  const contacts = useQuery({
    queryKey: ["contacts", { forPicker: true }],
    queryFn: () => listContacts({ status: "ACTIVE" }),
    enabled: state.open
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const dto: ActivityInput = { ...form, subject: form.subject.trim() }
      return isEdit && a ? updateActivity(a.id, dto) : createActivity(dto)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["activities"] })
      onClose()
    }
  })

  const err = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(err?.message) ? err.message.join(", ") : err?.message

  const set = (patch: Partial<ActivityInput>) => setForm(f => ({ ...f, ...patch }))
  const canSubmit = form.subject.trim().length >= 2 && !mutation.isPending
  const selectedContacts = (contacts.data ?? []).filter(c => form.contactIds?.includes(c.id))

  return (
    <Drawer anchor="right" open={state.open} onClose={onClose}>
      <Box sx={{ width: { xs: 340, sm: 440 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
          {isEdit ? "Edit activity" : "Log activity"}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
          {isEdit ? "Correct this log entry." : "Record a call, meeting, email or site visit with this client."}
        </Typography>

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <TextField select label="Type" value={form.type} onChange={e => set({ type: e.target.value })}
            fullWidth InputLabelProps={{ shrink: true }}>
            {ACTIVITY_TYPES.map(t => <MenuItem key={t} value={t}>{ACTIVITY_TYPE_LABELS[t]}</MenuItem>)}
          </TextField>

          <TextField label="Subject" value={form.subject} onChange={e => set({ subject: e.target.value })}
            required fullWidth InputLabelProps={{ shrink: true }} />

          <TextField label="When" type="datetime-local"
            value={form.occurredAt ? form.occurredAt.slice(0, 16) : ""}
            onChange={e => set({ occurredAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
            fullWidth InputLabelProps={{ shrink: true }}
            helperText="Leave blank for now" />

          <Autocomplete
            multiple
            options={contacts.data ?? []}
            value={selectedContacts}
            onChange={(_e, v) => set({ contactIds: v.map(c => c.id) })}
            getOptionLabel={c => contactDisplayName(c)}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={params => <TextField {...params} label="Contacts involved" InputLabelProps={{ shrink: true }} />}
            size="small"
          />

          <TextField label="Notes" value={form.body ?? ""} onChange={e => set({ body: e.target.value || undefined })}
            fullWidth multiline minRows={4} InputLabelProps={{ shrink: true }} />

          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>Cancel</Button>
          <Button variant="contained" onClick={() => mutation.mutate()} disabled={!canSubmit} fullWidth>
            {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Log activity"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

// ── Follow-up drawer (creates a Task linked via crm_activity parent context) ──
function FollowUpDrawer({ activity, onClose }: { activity: ActivityView | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: assignable } = useAssignableUsers()
  const [form, setForm] = React.useState<FollowUpInput>({ title: "" })

  React.useEffect(() => {
    if (activity) setForm({ title: `Follow up: ${activity.subject}` })
  }, [activity])

  const mutation = useMutation({
    mutationFn: async () => createActivityFollowUp(activity!.id, { ...form, title: form.title.trim() }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks"] })
      onClose()
    }
  })

  const err = [mutation.error].find(Boolean) as ApiError | undefined
  const errorMessage = Array.isArray(err?.message) ? err.message.join(", ") : err?.message

  return (
    <Drawer anchor="right" open={!!activity} onClose={onClose}>
      <Box sx={{ width: { xs: 340, sm: 420 }, p: 2.5, display: "flex", flexDirection: "column", height: "100%" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>Raise follow-up</Typography>
        <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>
          Creates a Task linked to this activity — it gets the full task lifecycle (assignee, due date, status).
        </Typography>

        <Stack spacing={2} sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          <TextField label="Task title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            required fullWidth InputLabelProps={{ shrink: true }} />
          <TextField label="Due" type="date" value={form.dueAt ? form.dueAt.slice(0, 10) : ""}
            onChange={e => setForm(f => ({ ...f, dueAt: e.target.value ? new Date(e.target.value).toISOString() : undefined }))}
            fullWidth InputLabelProps={{ shrink: true }} />
          <TextField select label="Assignee" value={form.assigneeId ?? ""}
            onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value || undefined }))}
            fullWidth InputLabelProps={{ shrink: true }}>
            <MenuItem value="">— Unassigned —</MenuItem>
            {(assignable ?? []).map(u => <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>)}
          </TextField>
          <TextField label="Details" value={form.description ?? ""}
            onChange={e => setForm(f => ({ ...f, description: e.target.value || undefined }))}
            fullWidth multiline minRows={3} InputLabelProps={{ shrink: true }} />
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>

        <Stack direction="row" spacing={1.2} sx={{ mt: 2, pt: 2, borderTop: "1px solid", borderColor: "divider" }}>
          <Button variant="outlined" onClick={onClose} disabled={mutation.isPending} fullWidth>Cancel</Button>
          <Button variant="contained" onClick={() => mutation.mutate()}
            disabled={form.title.trim().length < 3 || mutation.isPending} fullWidth>
            {mutation.isPending ? "Creating…" : "Create task"}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function CrmActivityPage() {
  const { mode: themeMode } = useThemeMode()
  const currentUser = getCurrentUser()
  const isOrgSuper = !!currentUser?.role && (ORG_SUPER_ROLES as readonly string[]).includes(currentUser.role)

  const [typeFilter, setTypeFilter] = React.useState<string | null>(null)
  const [drawer, setDrawer] = React.useState<DrawerState>({ open: false, activity: null })
  const [followUpFor, setFollowUpFor] = React.useState<ActivityView | null>(null)

  const activities = useQuery({
    queryKey: ["activities", { typeFilter }],
    queryFn: () => listActivities(typeFilter ? { type: typeFilter } : undefined)
  })

  const canEdit = (a: ActivityView) => a.source === "MANUAL" && (isOrgSuper || a.createdById === currentUser?.userId)

  return (
    <Box>
      <Card>
        <Box sx={{
          borderBottom: "1px solid", borderColor: "divider", px: 2, py: 1.25,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5, flexWrap: "wrap"
        }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: themeMode === "dark" ? "#e2e8f0" : "#334155", mr: 1 }}>
              Activity
            </Typography>
            {ACTIVITY_TYPES.map(t => {
              const active = typeFilter === t
              return (
                <Chip key={t} size="small" icon={<Box sx={{ display: "flex", pl: 0.5 }}>{TYPE_ICONS[t]}</Box>}
                  label={ACTIVITY_TYPE_LABELS[t]}
                  onClick={() => setTypeFilter(active ? null : t)}
                  sx={{
                    fontSize: 11.5, height: 24, cursor: "pointer",
                    bgcolor: active ? "rgba(29,78,216,0.14)" : "transparent",
                    color: active ? "#1d4ed8" : "var(--color-text-muted)",
                    border: "1px solid", borderColor: active ? "rgba(29,78,216,0.35)" : "divider"
                  }} />
              )
            })}
          </Box>
          <Button size="small" variant="contained" startIcon={<AddCommentIcon sx={{ fontSize: 16 }} />}
            onClick={() => setDrawer({ open: true, activity: null })}>
            Log Activity
          </Button>
        </Box>

        {activities.isError ? (
          <Box sx={{ p: 2 }}><ErrorState title="Failed to load activity" /></Box>
        ) : activities.isLoading ? (
          <Box sx={{ p: 2 }}><LoadingState /></Box>
        ) : (activities.data ?? []).length === 0 ? (
          <Box sx={{ p: 2 }}>
            <EmptyState title="No activity logged yet"
              detail="Calls, meetings, emails and site visits recorded here build the relationship history for this client." />
          </Box>
        ) : (
          <Box sx={{ maxHeight: 640, overflowY: "auto" }}>
            {(activities.data ?? []).map(a => (
              <Box key={a.id} sx={{
                px: 2, py: 1.5, borderBottom: "1px solid", borderColor: "divider",
                display: "flex", gap: 1.5, alignItems: "flex-start",
                "&:hover .activity-actions": { opacity: 1 }
              }}>
                <Box sx={{
                  mt: 0.25, width: 28, height: 28, borderRadius: "8px", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  bgcolor: "rgba(29,78,216,0.08)", color: "#1d4ed8"
                }}>
                  {TYPE_ICONS[a.type] ?? TYPE_ICONS.NOTE}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{a.subject}</Typography>
                    <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {new Date(a.occurredAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    </Typography>
                    {a.source !== "MANUAL" ? (
                      <Chip size="small" label="synced" sx={{ fontSize: 10.5, height: 18 }} />
                    ) : null}
                  </Box>
                  {a.body ? (
                    <Typography sx={{ fontSize: 12.5, color: "var(--color-text-muted)", mt: 0.25, whiteSpace: "pre-wrap" }}>
                      {a.body}
                    </Typography>
                  ) : null}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, flexWrap: "wrap" }}>
                    {a.contacts.map(c => (
                      <Chip key={c.id} size="small" label={contactDisplayName(c)}
                        sx={{ fontSize: 10.5, height: 18, bgcolor: "rgba(100,116,139,0.1)" }} />
                    ))}
                    {a.createdBy?.displayName ? (
                      <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>
                        logged by {a.createdBy.displayName}
                      </Typography>
                    ) : null}
                  </Box>
                </Box>
                <Box className="activity-actions" sx={{ display: "flex", gap: 0.5, opacity: 0, transition: "opacity 0.15s", flexShrink: 0 }}>
                  <Button size="small" variant="outlined" startIcon={<AddTaskIcon sx={{ fontSize: 14 }} />}
                    onClick={() => setFollowUpFor(a)} sx={{ fontSize: 11.5 }}>
                    Follow-up
                  </Button>
                  {canEdit(a) ? (
                    <Button size="small" variant="outlined" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                      onClick={() => setDrawer({ open: true, activity: a })} sx={{ fontSize: 11.5 }}>
                      Edit
                    </Button>
                  ) : null}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Card>

      <ActivityFormDrawer state={drawer} onClose={() => setDrawer({ open: false, activity: null })} />
      <FollowUpDrawer activity={followUpFor} onClose={() => setFollowUpFor(null)} />
    </Box>
  )
}
