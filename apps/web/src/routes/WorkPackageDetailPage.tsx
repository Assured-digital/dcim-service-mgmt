import React from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, LinearProgress, MenuItem, Stack, Switch, TextField, Typography
} from "@mui/material"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import AddIcon from "@mui/icons-material/Add"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import AutorenewIcon from "@mui/icons-material/Autorenew"
import { StatusPill, entityStatusIntent } from "../components/shared"
import { ErrorState, LoadingState } from "../components/PageState"
import { useNotification } from "../components/NotificationProvider"
import { useBreadcrumb } from "./Shell"
import { hasAnyRole, ORG_SUPER_ROLES, ROLES } from "../lib/rbac"
import { useAssignableUsers } from "../lib/useAssignableUsers"
import { FormDialog, FormTextField, EnumSelect, DateField, AssigneePicker } from "../components/fields"
import { formatMoney } from "../lib/crm"
import {
  WP_STATUS_LABELS, WP_STATUSES, WP_TYPE_LABELS, createWorkPackageTask, daysUntilRenewal,
  getWorkPackage, updateWorkPackage, type WorkPackagePatch, type WorkPackageView
} from "../lib/workPackages"

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"
}

function RenewalBadge({ wp }: { wp: WorkPackageView }) {
  const days = daysUntilRenewal(wp)
  if (days === null) return null
  const overdue = days < 0
  const soon = days >= 0 && days <= 90
  return (
    <Chip size="small" icon={<AutorenewIcon sx={{ fontSize: 14 }} />}
      label={overdue ? `Renewal overdue ${-days}d` : `Renews in ${days}d`}
      sx={{
        fontSize: 11, height: 22,
        bgcolor: overdue ? "rgba(220,38,38,0.1)" : soon ? "rgba(234,179,8,0.12)" : "rgba(100,116,139,0.1)",
        color: overdue ? "#dc2626" : soon ? "#a16207" : "var(--color-text-muted)"
      }} />
  )
}

export default function WorkPackageDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { setPageFullBleed } = useBreadcrumb()
  const canWrite = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER])
  const canAddTask = hasAnyRole([...ORG_SUPER_ROLES, ROLES.SERVICE_MANAGER, ROLES.SERVICE_DESK_ANALYST, ROLES.ENGINEER])

  React.useEffect(() => {
    setPageFullBleed(false)
  }, [setPageFullBleed])

  const [editOpen, setEditOpen] = React.useState(false)
  const [taskOpen, setTaskOpen] = React.useState(false)

  const { data: wp, isLoading } = useQuery({
    queryKey: ["work-package-detail", id],
    queryFn: () => getWorkPackage(id!),
    enabled: !!id,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["work-package-detail", id] })
    qc.invalidateQueries({ queryKey: ["work-packages"] })
  }

  if (isLoading) return <LoadingState />
  if (!wp) return <ErrorState title="Work package not found" />

  const pct = wp.taskSummary?.percentComplete
  const hasValue = wp.value !== undefined

  return (
    <Box sx={{ maxWidth: 1000, mx: "auto" }}>
      <Button size="small" startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
        onClick={() => navigate("/work-packages")} sx={{ mb: 1.5 }}>
        Service scope
      </Button>

      {/* Header */}
      <Card sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: "var(--color-text-muted)", fontFamily: "monospace" }}>{wp.reference}</Typography>
              <Chip size="small" label={WP_TYPE_LABELS[wp.type] ?? wp.type} sx={{ fontSize: 11, height: 20 }} />
              <StatusPill intent={entityStatusIntent(wp.status)} label={WP_STATUS_LABELS[wp.status] ?? wp.status.toLowerCase()} size="sm" />
              <RenewalBadge wp={wp} />
            </Box>
            <Typography sx={{ fontSize: 18, fontWeight: 700, mt: 0.5 }}>{wp.title}</Typography>
            {wp.description ? <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)", mt: 0.5 }}>{wp.description}</Typography> : null}
          </Box>
          {canWrite ? (
            <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 15 }} />}
              onClick={() => setEditOpen(true)}>Edit</Button>
          ) : null}
        </Box>
      </Card>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
        {/* Commercial + contract */}
        <Card sx={{ p: 2 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1.5 }}>Commercial &amp; contract</Typography>
          <Stack spacing={1}>
            <Row label="Start" value={fmtDate(wp.startDate)} />
            <Row label="End" value={fmtDate(wp.endDate)} />
            {hasValue ? <Row label="Value" value={formatMoney(wp.value) ?? "—"} bold /> : null}
            <Row label="Renewal date" value={fmtDate(wp.renewalDate)} />
            <Row label="Notice period" value={wp.noticePeriodDays != null ? `${wp.noticePeriodDays} days` : "—"} />
            <Row label="Auto-renews" value={wp.autoRenews ? "Yes" : "No"} />
            {wp.commercialNotes ? (
              <Box sx={{ pt: 0.5 }}>
                <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>Commercial notes</Typography>
                <Typography sx={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{wp.commercialNotes}</Typography>
              </Box>
            ) : null}
            {wp.sites?.length ? (
              <Row label="Sites" value={wp.sites.map(s => s.site.name).join(", ")} />
            ) : null}
          </Stack>
        </Card>

        {/* Project / tasks */}
        <Card sx={{ p: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Project work</Typography>
            {canAddTask ? (
              <Button size="small" startIcon={<AddIcon sx={{ fontSize: 15 }} />} onClick={() => setTaskOpen(true)}>Add task</Button>
            ) : null}
          </Box>

          {pct !== null && pct !== undefined ? (
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography sx={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {wp.taskSummary!.done} of {wp.taskSummary!.total} done
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{pct}%</Typography>
              </Box>
              <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
            </Box>
          ) : null}

          {(wp.tasks ?? []).length === 0 ? (
            <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              No tasks yet. Add project tasks to track delivery here.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {(wp.tasks ?? []).map(t => (
                <Box key={t.id} onClick={() => navigate(`/service-desk/task/${t.id}`)}
                  sx={{
                    display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.75, borderRadius: "6px", cursor: "pointer",
                    "&:hover": { bgcolor: "rgba(29,78,216,0.05)" }
                  }}>
                  <StatusPill intent={entityStatusIntent(t.status)} label={t.status.toLowerCase().replace("_", " ")} size="sm" />
                  <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }} noWrap>{t.title}</Typography>
                  {t.dueAt ? (
                    <Typography sx={{ fontSize: 11.5, color: "var(--color-text-muted)" }}>{fmtDate(t.dueAt)}</Typography>
                  ) : null}
                </Box>
              ))}
            </Stack>
          )}
        </Card>
      </Box>

      {canWrite ? <EditWorkPackageDialog wp={wp} open={editOpen} onClose={() => setEditOpen(false)} onSaved={invalidate} /> : null}
      {canAddTask ? (
        <AddTaskDialog workPackageId={wp.id} open={taskOpen} onClose={() => setTaskOpen(false)}
          onCreated={() => { notify.success("Task added"); invalidate() }} />
      ) : null}
    </Box>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography sx={{ fontSize: 13, color: "var(--color-text-muted)" }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: bold ? 700 : 500, textAlign: "right", color: bold ? "#1d4ed8" : undefined }}>{value}</Typography>
    </Box>
  )
}

function EditWorkPackageDialog({ wp, open, onClose, onSaved }: { wp: WorkPackageView; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = React.useState<WorkPackagePatch>({})

  React.useEffect(() => {
    if (open) setForm({
      title: wp.title,
      status: wp.status,
      value: wp.value ?? undefined,
      startDate: wp.startDate ?? undefined,
      endDate: wp.endDate ?? undefined,
      renewalDate: wp.renewalDate ?? undefined,
      noticePeriodDays: wp.noticePeriodDays ?? undefined,
      autoRenews: wp.autoRenews,
      commercialNotes: wp.commercialNotes ?? undefined
    })
  }, [open, wp])

  const mutation = useMutation({
    mutationFn: async () => updateWorkPackage(wp.id, {
      ...form,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : undefined,
      endDate: form.endDate ? new Date(form.endDate).toISOString() : undefined,
      renewalDate: form.renewalDate ? new Date(form.renewalDate).toISOString() : undefined,
    }),
    onSuccess: () => { onSaved(); onClose() }
  })

  const set = (patch: WorkPackagePatch) => setForm(f => ({ ...f, ...patch }))
  const err = [mutation.error].find(Boolean) as { message?: string | string[] } | undefined
  const errorMessage = Array.isArray(err?.message) ? err.message.join(", ") : err?.message

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Edit work package</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Title" value={form.title ?? ""} onChange={e => set({ title: e.target.value })} fullWidth InputLabelProps={{ shrink: true }} />
          <TextField select label="Status" value={form.status ?? "ACTIVE"} onChange={e => set({ status: e.target.value })} fullWidth InputLabelProps={{ shrink: true }}>
            {WP_STATUSES.map(s => <MenuItem key={s} value={s}>{WP_STATUS_LABELS[s]}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Start" type="date" value={form.startDate ? form.startDate.slice(0, 10) : ""} onChange={e => set({ startDate: e.target.value || undefined })} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="End" type="date" value={form.endDate ? form.endDate.slice(0, 10) : ""} onChange={e => set({ endDate: e.target.value || undefined })} fullWidth InputLabelProps={{ shrink: true }} />
          </Stack>
          <TextField label="Value (£)" type="number" value={form.value ?? ""} onChange={e => set({ value: e.target.value === "" ? undefined : Number(e.target.value) })} fullWidth InputLabelProps={{ shrink: true }} />
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", pt: 0.5 }}>Renewal</Typography>
          <Stack direction="row" spacing={1.5}>
            <TextField label="Renewal date" type="date" value={form.renewalDate ? form.renewalDate.slice(0, 10) : ""} onChange={e => set({ renewalDate: e.target.value || undefined })} fullWidth InputLabelProps={{ shrink: true }} />
            <TextField label="Notice (days)" type="number" value={form.noticePeriodDays ?? ""} onChange={e => set({ noticePeriodDays: e.target.value === "" ? undefined : Number(e.target.value) })} sx={{ width: 150 }} InputLabelProps={{ shrink: true }} />
          </Stack>
          <FormControlLabel control={<Switch checked={form.autoRenews ?? false} onChange={e => set({ autoRenews: e.target.checked })} />}
            label={<Typography sx={{ fontSize: 13.5 }}>Auto-renews</Typography>} />
          <TextField label="Commercial notes" value={form.commercialNotes ?? ""} onChange={e => set({ commercialNotes: e.target.value || undefined })} fullWidth multiline minRows={2} InputLabelProps={{ shrink: true }} />
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function AddTaskDialog({ workPackageId, open, onClose, onCreated }: { workPackageId: string; open: boolean; onClose: () => void; onCreated: () => void }) {
  const { data: assignable } = useAssignableUsers()
  const [form, setForm] = React.useState<{ title: string; priority?: string; dueAt?: string; assigneeId?: string }>({ title: "" })

  React.useEffect(() => { if (open) setForm({ title: "", priority: "medium" }) }, [open])

  const mutation = useMutation({
    mutationFn: async () => createWorkPackageTask(workPackageId, {
      ...form,
      dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined
    }),
    onSuccess: () => { onCreated(); onClose() }
  })

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title="Add project task"
      submitLabel="Add task"
      submittingLabel="Adding…"
      submitting={mutation.isPending}
      canSubmit={form.title.trim().length >= 3}
      onSubmit={() => mutation.mutate()}
    >
      <FormTextField span="full" label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      <EnumSelect span="full" label="Priority" value={form.priority ?? "medium"} onChange={val => setForm(f => ({ ...f, priority: val }))}
        options={["low", "medium", "high", "critical"].map(p => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
      <DateField span="full" label="Due" value={form.dueAt ? form.dueAt.slice(0, 10) : ""} onChange={val => setForm(f => ({ ...f, dueAt: val || undefined }))} />
      <AssigneePicker span="full" label="Assignee" value={form.assigneeId ?? ""} onChange={val => setForm(f => ({ ...f, assigneeId: val || undefined }))} users={assignable} />
    </FormDialog>
  )
}
