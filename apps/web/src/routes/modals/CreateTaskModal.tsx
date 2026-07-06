import React from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { Box, Typography } from "@mui/material"
import { api } from "../../lib/api"
import { useNotification } from "../../components/NotificationProvider"
import { FormTextField, EnumSelect, AssigneePicker, DateField, FormDialog } from "../../components/fields"
import { useThemeMode } from "../../lib/theme"

const PRIORITIES = ["low", "medium", "high", "critical"]

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

// Standalone task-create modal — the canonical home for the Task create form
// (sibling to CreateIncidentModal / CreateChangeModal). Used by the Service Desk
// queue's "New ticket → Task" flow (no parent → standalone queue task) and by the
// per-record detail pages (passing linkedEntityType/linkedEntityId +
// navigateAfterCreate={false} to stay on the record).
export function CreateTaskModal({
  open, onClose, linkedEntityType, linkedEntityId, linkedEntityLabel,
  onSuccess, navigateAfterCreate = true,
}: {
  open: boolean
  onClose: () => void
  linkedEntityType?: string
  linkedEntityId?: string
  linkedEntityLabel?: string
  onSuccess?: () => Promise<void> | void
  navigateAfterCreate?: boolean
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useNotification()
  const { mode } = useThemeMode()

  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState("medium")
  const [dueAt, setDueAt] = React.useState("")
  const [assigneeId, setAssigneeId] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Linked-entity info banner — light branch = the prior literals exactly.
  const bannerColors = mode === "dark"
    ? { bg: "#0c2a3a", border: "#164e63", text: "#7dd3fc" }
    : { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1" }

  async function handleCreate() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>("/tasks", {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueAt: dueAt || undefined,
        assigneeId: assigneeId || undefined,
        linkedEntityType: linkedEntityType || undefined,
        linkedEntityId: linkedEntityId || undefined,
      })
      onClose()
      setTitle(""); setDescription(""); setPriority("medium"); setDueAt(""); setAssigneeId("")
      // Refresh the unified queue feed and the legacy Tasks list.
      qc.invalidateQueries({ queryKey: ["tickets"] })
      qc.invalidateQueries({ queryKey: ["tasks"] })
      await onSuccess?.()
      if (navigateAfterCreate) navigate(`/service-desk/task/${res.data.id}`)
      notify.success("Task created")
    } catch (e: any) {
      notify.error(e?.message ?? "Failed to create task")
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      title="Create task"
      submitLabel="Create task"
      submittingLabel="Creating…"
      submitting={saving}
      canSubmit={!!title.trim()}
      onSubmit={handleCreate}
      banner={linkedEntityLabel ? (
        <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: bannerColors.bg, border: `1px solid ${bannerColors.border}` }}>
          <Typography variant="caption" color={bannerColors.text}>Linked to: <strong>{linkedEntityLabel}</strong></Typography>
        </Box>
      ) : undefined}
    >
      <FormTextField span="full" label="Title" value={title} onChange={e => setTitle(e.target.value)} required />
      <FormTextField span="full" label="Description" value={description} onChange={e => setDescription(e.target.value)} multiline rows={3} />
      <EnumSelect label="Priority" value={priority} onChange={setPriority}
        options={PRIORITIES.map(p => ({ value: p, label: capitalise(p) }))} />
      <DateField label="Due date" value={dueAt} onChange={setDueAt} />
      <AssigneePicker span="full" value={assigneeId} onChange={setAssigneeId} />
    </FormDialog>
  )
}
