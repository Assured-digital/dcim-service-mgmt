import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button, Dialog, DialogContent, DialogTitle, MenuItem, Stack, TextField
} from "@mui/material"
import { api } from "../../lib/api"
import { useNotification } from "../../components/NotificationProvider"

type User = { id: string; email: string }

const CHANGE_TYPES = ["STANDARD", "NORMAL", "EMERGENCY"]
const PRIORITIES = ["low", "medium", "high", "critical"]

function capitalize(v: string) {
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
}

export function CreateChangeModal({
  open,
  onClose,
  onSuccess,
  navigateAfterCreate = true,
}: {
  open: boolean
  onClose: () => void
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useNotification()

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [changeType, setChangeType] = React.useState("NORMAL")
  const [priority, setPriority] = React.useState("medium")
  const [reason, setReason] = React.useState("")
  const [impactAssessment, setImpactAssessment] = React.useState("")
  const [rollbackPlan, setRollbackPlan] = React.useState("")
  const [scheduledStart, setScheduledStart] = React.useState("")
  const [scheduledEnd, setScheduledEnd] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get<User[]>("/users")).data,
    enabled: open,
  })

  async function handleCreate() {
    if (!title.trim() || !description.trim()) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>("/changes", {
        title: title.trim(),
        description: description.trim(),
        changeType,
        priority,
        reason: reason.trim() || undefined,
        impactAssessment: impactAssessment.trim() || undefined,
        rollbackPlan: rollbackPlan.trim() || undefined,
        scheduledStart: scheduledStart || undefined,
        scheduledEnd: scheduledEnd || undefined,
        assigneeId: assigneeId || undefined,
      })
      onClose()
      setTitle(""); setDescription(""); setChangeType("NORMAL"); setPriority("medium")
      setReason(""); setImpactAssessment(""); setRollbackPlan("")
      setScheduledStart(""); setScheduledEnd(""); setAssigneeId("")
      qc.invalidateQueries({ queryKey: ["tickets"] })
      await onSuccess?.()
      if (navigateAfterCreate) navigate(`/service-desk/chg/${res.data.id}`)
      notify.success("Change logged")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to log change")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Log change</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} required fullWidth />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} required fullWidth multiline rows={3} />
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField select label="Change type" value={changeType} onChange={e => setChangeType(e.target.value)} fullWidth>
              {CHANGE_TYPES.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
            <TextField select label="Priority" value={priority} onChange={e => setPriority(e.target.value)} fullWidth>
              {PRIORITIES.map(v => <MenuItem key={v} value={v}>{capitalize(v)}</MenuItem>)}
            </TextField>
            <TextField select label="Assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} fullWidth>
              <MenuItem value="">Unassigned</MenuItem>
              {users.map(u => <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField
              label="Scheduled start" type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={scheduledStart} onChange={e => setScheduledStart(e.target.value)}
              fullWidth
            />
            <TextField
              label="Scheduled end" type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={scheduledEnd} onChange={e => setScheduledEnd(e.target.value)}
              fullWidth
            />
          </Stack>
          <TextField label="Reason" value={reason} onChange={e => setReason(e.target.value)} fullWidth multiline rows={2} />
          <TextField label="Impact assessment" value={impactAssessment} onChange={e => setImpactAssessment(e.target.value)} fullWidth multiline rows={2} />
          <TextField label="Rollback plan" value={rollbackPlan} onChange={e => setRollbackPlan(e.target.value)} fullWidth multiline rows={2} />
          <Stack direction="row" justifyContent="flex-end" gap={1}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()}>
              {saving ? "Saving..." : "Log change"}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
