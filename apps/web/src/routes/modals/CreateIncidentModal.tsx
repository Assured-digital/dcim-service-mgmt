import React from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { useNotification } from "../../components/NotificationProvider"
import { FormTextField, EnumSelect, AssigneePicker, FormDialog } from "../../components/fields"

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
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      title="Log incident"
      submitLabel="Log incident"
      submitting={saving}
      canSubmit={!!title.trim() && !!description.trim()}
      onSubmit={handleCreate}
    >
      <FormTextField span="full" label="Title" value={title} onChange={e => setTitle(e.target.value)} required />
      <FormTextField span="full" label="Description" value={description} onChange={e => setDescription(e.target.value)} required multiline rows={3} />
      <EnumSelect label="Severity" value={severity} onChange={setSeverity}
        options={SEVERITIES.map(v => ({ value: v, label: v }))} />
      <EnumSelect label="Priority" value={priority} onChange={setPriority}
        options={PRIORITIES.map(v => ({ value: v, label: capitalize(v) }))} />
      <AssigneePicker span="full" value={assigneeId} onChange={setAssigneeId} />
    </FormDialog>
  )
}
