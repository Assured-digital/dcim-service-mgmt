import React from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { useNotification } from "../../components/NotificationProvider"
import { FormTextField, EnumSelect, AssigneePicker, DateField, FormDialog } from "../../components/fields"

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
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      title="Log change"
      submitLabel="Log change"
      submitting={saving}
      canSubmit={!!title.trim() && !!description.trim()}
      onSubmit={handleCreate}
    >
      <FormTextField span="full" label="Title" value={title} onChange={e => setTitle(e.target.value)} required />
      <FormTextField span="full" label="Description" value={description} onChange={e => setDescription(e.target.value)} required multiline rows={3} />
      <EnumSelect label="Change type" value={changeType} onChange={setChangeType}
        options={CHANGE_TYPES.map(v => ({ value: v, label: v }))} />
      <EnumSelect label="Priority" value={priority} onChange={setPriority}
        options={PRIORITIES.map(v => ({ value: v, label: capitalize(v) }))} />
      <DateField label="Scheduled start" type="datetime-local" value={scheduledStart} onChange={setScheduledStart} />
      <DateField label="Scheduled end" type="datetime-local" value={scheduledEnd} onChange={setScheduledEnd} />
      <AssigneePicker span="full" value={assigneeId} onChange={setAssigneeId} />
      <FormTextField span="full" label="Reason" value={reason} onChange={e => setReason(e.target.value)} multiline rows={2} />
      <FormTextField span="full" label="Impact assessment" value={impactAssessment} onChange={e => setImpactAssessment(e.target.value)} multiline rows={2} />
      <FormTextField span="full" label="Rollback plan" value={rollbackPlan} onChange={e => setRollbackPlan(e.target.value)} multiline rows={2} />
    </FormDialog>
  )
}
