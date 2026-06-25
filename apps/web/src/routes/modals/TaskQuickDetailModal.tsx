import React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, Tab, Tabs, TextField, Typography
} from "@mui/material"
import { api } from "../../lib/api"
import { useNotification } from "../../components/NotificationProvider"
import { StatusPill, PriorityPill } from "../../components/shared"
import { ActivityFeedItem, type FeedEvent, type ResolvedMention } from "../../components/detail"
import { formatDateTime } from "../../lib/format"
import { type AssignableUser } from "../../lib/useAssignableUsers"

// ── Types ──────────────────────────────────────────────────────────────────
type Task = {
  id: string
  reference: string
  title: string
  description: string | null
  status: string
  priority: string
  dueAt: string | null
  createdAt: string
  updatedAt: string
  assigneeId: string | null
  assignee: { id: string; displayName: string } | null
  linkedEntityType: string | null
  linkedEntityId: string | null
  incident: { id: string; reference: string; title: string } | null
}

type TaskAuditEvent = {
  id: string
  action: string
  actorDisplayName?: string | null
  createdAt: string
  data?: { from?: string; to?: string; fields?: string[] } | null
}
type TaskComment = {
  id: string
  body: string
  bodyJson?: Record<string, unknown> | null
  mentions?: ResolvedMention[]
  createdAt: string
  author: { id: string; displayName: string }
  // Two-level threading: a post's replies are themselves comments (same shape).
  replies?: TaskComment[]
}

// ── Constants ──────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open", IN_PROGRESS: "In Progress", BLOCKED: "Blocked", DONE: "Done"
}
const ALL_STATUSES = ["OPEN", "IN_PROGRESS", "BLOCKED", "DONE"]
const ALL_PRIORITIES = ["critical", "high", "medium", "low"]

// ── Helpers ────────────────────────────────────────────────────────────────
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

function linkedLabel(task: Task) {
  if (task.incident) return `INC · ${task.incident.reference}`
  if (task.linkedEntityType) return task.linkedEntityType.replace(/([A-Z])/g, " $1").trim()
  return null
}

export function TaskQuickDetailModal({
  open,
  taskId,
  users,
  canManage,
  onClose,
  onOpenFull,
  onPatchTask,
  onUpdateStatus
}: {
  open: boolean
  taskId: string | null
  users: AssignableUser[]
  canManage: boolean
  onClose: () => void
  // eslint-disable-next-line no-unused-vars
  onOpenFull: (taskId: string) => void
  // eslint-disable-next-line no-unused-vars
  onPatchTask: (taskId: string, patch: Record<string, any>) => Promise<void>
  // eslint-disable-next-line no-unused-vars
  onUpdateStatus: (taskId: string, status: string) => Promise<void>
}) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [activeTab, setActiveTab] = React.useState<"details" | "work-notes" | "history">("details")
  const [saving, setSaving] = React.useState(false)
  const [newNote, setNewNote] = React.useState("")
  const [savingNote, setSavingNote] = React.useState(false)

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [priority, setPriority] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [dueAt, setDueAt] = React.useState("")

  const { data: task } = useQuery({
    queryKey: ["task-detail", taskId],
    queryFn: async () => (await api.get<Task>(`/tasks/${taskId}`)).data,
    enabled: open && !!taskId
  })
  const { data: auditEvents = [] } = useQuery({
    queryKey: ["audit-task", taskId],
    queryFn: async () => (await api.get<TaskAuditEvent[]>(`/audit-events/entity/Task/${taskId}`)).data,
    enabled: open && !!taskId,
    refetchOnMount: "always"
  })
  const { data: workNotes = [] } = useQuery({
    queryKey: ["work-notes-task", taskId],
    queryFn: async () => (await api.get<TaskComment[]>(`/comments/Task/${taskId}/work-notes`)).data,
    enabled: open && !!taskId
  })

  React.useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description ?? "")
    setStatus(task.status)
    setPriority(task.priority)
    setAssigneeId(task.assigneeId ?? "")
    setDueAt(task.dueAt ? task.dueAt.slice(0, 10) : "")
  }, [task])

  async function handleSave() {
    if (!task || !canManage) return
    setSaving(true)
    try {
      if (status !== task.status) {
        await onUpdateStatus(task.id, status)
      }
      await onPatchTask(task.id, {
        title,
        description: description || undefined,
        priority,
        assigneeId: assigneeId || null,
        dueAt: dueAt || null
      })
      await qc.invalidateQueries({ queryKey: ["task-detail", task.id] })
      await qc.invalidateQueries({ queryKey: ["audit-task", task.id] })
      await qc.invalidateQueries({ queryKey: ["tasks"] })
      notify.success("Task updated")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to save task changes")
    } finally {
      setSaving(false)
    }
  }

  async function handleAddNote() {
    if (!taskId || !newNote.trim()) return
    setSavingNote(true)
    try {
      await api.post("/comments/work-note", { entityType: "Task", entityId: taskId, body: newNote.trim() })
      setNewNote("")
      await qc.invalidateQueries({ queryKey: ["work-notes-task", taskId] })
      notify.success("Note added")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to add note")
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
          pt: { xs: 1.5, md: 3 }
        }
      }}
      PaperProps={{
        sx: {
          maxHeight: { xs: "88vh", md: "80vh" },
          display: "flex",
          flexDirection: "column"
        }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography sx={{ fontFamily: "monospace", fontSize: 12, color: "#64748b" }}>
              {task?.reference ?? "Task"}
            </Typography>
            {task ? <StatusPill value={task.status} label={STATUS_LABELS[task.status] ?? task.status} /> : null}
            {task ? <PriorityPill priority={task.priority} label={capitalize(task.priority)} /> : null}
          </Stack>
          {taskId ? (
            <Button size="small" onClick={() => onOpenFull(taskId)}>
              Open full task
            </Button>
          ) : null}
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1, pb: 1.5 }}>
        <Box>
          <Tabs value={activeTab} onChange={(_event: React.SyntheticEvent, v: string) => setActiveTab(v as "details" | "work-notes" | "history")} sx={{ minHeight: 38 }}>
            <Tab value="details" label="Details" sx={{ minHeight: 38 }} />
            <Tab value="work-notes" label={`Work notes (${workNotes.length})`} sx={{ minHeight: 38 }} />
            <Tab value="history" label={`History (${auditEvents.length})`} sx={{ minHeight: 38 }} />
          </Tabs>
        </Box>

        <Box sx={{ maxHeight: { xs: "48vh", md: "44vh" }, overflowY: "auto", pr: 0.5, pt: 0.5 }}>
          {activeTab === "details" ? (
            <Stack spacing={1.5} sx={{ pt: 0.5 }}>
              <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} fullWidth />
              <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={3} fullWidth />
              <Stack direction="row" spacing={1.5}>
                <TextField
                  select
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  fullWidth
                  disabled={!canManage}
                >
                  {ALL_STATUSES.map((s) => <MenuItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</MenuItem>)}
                </TextField>
                <TextField
                  select
                  label="Priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  fullWidth
                  disabled={!canManage}
                >
                  {ALL_PRIORITIES.map((p) => <MenuItem key={p} value={p}>{capitalize(p)}</MenuItem>)}
                </TextField>
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  select
                  label="Assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  fullWidth
                  disabled={!canManage}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {users.map((u) => <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>)}
                </TextField>
                <TextField
                  type="date"
                  label="Due date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  disabled={!canManage}
                />
              </Stack>
              {task?.linkedEntityType ? (
                <Typography variant="caption" color="text.secondary">
                  Linked to: {linkedLabel(task)}
                </Typography>
              ) : null}
            </Stack>
          ) : null}

          {activeTab === "work-notes" ? (
            <Stack spacing={1.5}>
              {canManage ? (
                <Stack spacing={1}>
                  <TextField
                    size="small"
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Add work note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                  />
                  <Stack direction="row" justifyContent="flex-end">
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleAddNote}
                      disabled={savingNote || !newNote.trim()}
                    >
                      Add note
                    </Button>
                  </Stack>
                </Stack>
              ) : null}
              {(workNotes ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No work notes yet.</Typography>
              ) : (
                // Render via the shared ActivityFeedItem so the drawer's notes get the
                // same rich body + reply threads (Reply affordance opens the rich
                // composer inline; replies collapse beyond 3) as the detail pages. The
                // drawer keeps its own plain top-level add-note box above.
                (workNotes ?? [])
                  .map<FeedEvent>((note) => ({
                    id: `note-${note.id}`,
                    type: "comment",
                    actor: note.author.displayName,
                    text: null,
                    note: note.body,
                    bodyJson: note.bodyJson,
                    mentions: note.mentions,
                    time: formatDateTime(note.createdAt) ?? "",
                    createdAt: note.createdAt,
                    commentId: note.id,
                    entityId: taskId ?? undefined,
                    replies: (note.replies ?? []).map((r) => ({
                      id: r.id,
                      actor: r.author.displayName,
                      note: r.body,
                      bodyJson: r.bodyJson,
                      mentions: r.mentions,
                      time: formatDateTime(r.createdAt) ?? "",
                    })),
                  }))
                  .reverse()
                  .map((event, idx, arr) => (
                    <ActivityFeedItem key={event.id} event={event} isLast={idx === arr.length - 1} />
                  ))
              )}
            </Stack>
          ) : null}

          {activeTab === "history" ? (
            <Stack spacing={1}>
              {(auditEvents ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No history yet.</Typography>
              ) : (
                (auditEvents ?? []).map(event => (
                  <Box key={event.id} sx={{ border: "1px solid #e2e8f0", borderRadius: 1.5, p: 1.25 }}>
                    <Typography variant="caption" sx={{ color: "#64748b" }}>
                      {event.action.toLowerCase().replaceAll("_", " ")} · {event.actorDisplayName ?? "system"} · {new Date(event.createdAt).toLocaleString("en-GB")}
                    </Typography>
                    {event.data ? (
                      <Typography variant="caption" sx={{ display: "block", mt: 0.5, color: "#475569" }}>
                        {JSON.stringify(event.data)}
                      </Typography>
                    ) : null}
                  </Box>
                ))
              )}
            </Stack>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions sx={{ pt: 1, pb: 1.5 }}>
        <Button onClick={onClose}>Close</Button>
        {canManage ? (
          <Button variant="contained" onClick={handleSave} disabled={saving || !task}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}
