import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Button, Dialog, DialogContent, DialogTitle, MenuItem, Stack, TextField
} from "@mui/material"
import { api } from "../../lib/api"
import { useNotification } from "../../components/NotificationProvider"

type User = { id: string; email: string }

const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
const PRIORITIES = ["low", "medium", "high", "critical"]

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export function CreateIncidentModal({
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
  const [severity, setSeverity] = React.useState("MEDIUM")
  const [priority, setPriority] = React.useState("medium")
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
      const res = await api.post<{ id: string }>("/incidents", {
        title: title.trim(),
        description: description.trim(),
        severity,
        priority,
        assigneeId: assigneeId || undefined,
      })
      onClose()
      setTitle(""); setDescription(""); setSeverity("MEDIUM")
      setPriority("medium"); setAssigneeId("")
      qc.invalidateQueries({ queryKey: ["tickets"] })
      await onSuccess?.()
      if (navigateAfterCreate) navigate(`/service-desk/inc/${res.data.id}`)
      notify.success("Incident logged")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to log incident")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Log incident</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          <TextField label="Title" value={title} onChange={e => setTitle(e.target.value)} required fullWidth />
          <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} required fullWidth multiline rows={3} />
          <Stack direction={{ xs: "column", md: "row" }} gap={2}>
            <TextField select label="Severity" value={severity} onChange={e => setSeverity(e.target.value)} fullWidth>
              {SEVERITIES.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </TextField>
            <TextField select label="Priority" value={priority} onChange={e => setPriority(e.target.value)} fullWidth>
              {PRIORITIES.map(v => <MenuItem key={v} value={v}>{capitalize(v)}</MenuItem>)}
            </TextField>
          </Stack>
          <TextField select label="Assignee" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} fullWidth>
            <MenuItem value="">Unassigned</MenuItem>
            {users.map(u => <MenuItem key={u.id} value={u.id}>{u.email}</MenuItem>)}
          </TextField>
          <Stack direction="row" justifyContent="flex-end" gap={1}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim() || !description.trim()}>
              {saving ? "Saving..." : "Log incident"}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
