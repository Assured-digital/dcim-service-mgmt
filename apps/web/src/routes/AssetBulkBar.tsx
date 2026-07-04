import React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography
} from "@mui/material"
import CloseIcon from "@mui/icons-material/Close"
import { api } from "../lib/api"
import { useNotification } from "../components/NotificationProvider"
import { Asset, Site, getApiErrorMessage } from "../lib/infrastructure"
import { AssetCustomField } from "../lib/customFields"
import { exportAssetsCsv } from "./assetRegisterFilters"
import { ToolbarButton } from "../components/shared/ListToolbar"

const LIFECYCLES = ["ACTIVE", "STAGING", "PLANNED", "PROCUREMENT", "RETIRED"] as const
const LIFECYCLE_LABEL: Record<string, string> = {
  ACTIVE: "Active", STAGING: "Staging", PLANNED: "Planned", PROCUREMENT: "Procurement", RETIRED: "Retired",
}

type BulkKind = "lifecycle" | "property" | "move"

// Selection strip shown above the register table when ≥1 asset is ticked.
// Bulk edits loop PUT /assets/:id (no bulk endpoint); Export selection reuses
// the register CSV over just the ticked rows.
export function AssetBulkBar({ selected, customFields, canManage, onClear }: {
  selected: Asset[]
  customFields: AssetCustomField[]
  canManage: boolean
  onClear: () => void
}) {
  const [dialog, setDialog] = React.useState<BulkKind | null>(null)
  const n = selected.length

  return (
    <Box sx={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 1, px: "12px", py: "7px",
      bgcolor: "var(--color-primary-soft, rgba(29,78,216,.08))", borderBottom: "1px solid", borderColor: "divider" }}>
      <Button size="small" onClick={onClear} startIcon={<CloseIcon sx={{ fontSize: "16px !important" }} />}
        sx={{ textTransform: "none", fontSize: 12, minWidth: 0, color: "text.secondary" }}>Clear</Button>
      <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{n} selected</Typography>
      <Box sx={{ flex: 1 }} />
      {canManage ? <ToolbarButton onClick={() => setDialog("lifecycle")}>Change lifecycle</ToolbarButton> : null}
      {canManage && customFields.length > 0 ? <ToolbarButton onClick={() => setDialog("property")}>Set property</ToolbarButton> : null}
      {canManage ? <ToolbarButton onClick={() => setDialog("move")}>Move</ToolbarButton> : null}
      <ToolbarButton onClick={() => exportAssetsCsv(selected, customFields)}>Export selection</ToolbarButton>

      {dialog === "lifecycle" ? <BulkLifecycleDialog selected={selected} onClose={() => setDialog(null)} onDone={onClear} /> : null}
      {dialog === "property" ? <BulkPropertyDialog selected={selected} customFields={customFields} onClose={() => setDialog(null)} onDone={onClear} /> : null}
      {dialog === "move" ? <BulkMoveDialog selected={selected} onClose={() => setDialog(null)} onDone={onClear} /> : null}
    </Box>
  )
}

// Loop a patch over the selection, reporting partial failure honestly.
function useBulkPatch(onSuccessMsg: (ok: number) => string, onDone: () => void, onClose: () => void) {
  const qc = useQueryClient()
  const { notify } = useNotification()
  return useMutation({
    mutationFn: async (jobs: { id: string; body: Record<string, unknown> }[]) => {
      let ok = 0; const failed: string[] = []
      for (const j of jobs) {
        try { await api.put(`/assets/${j.id}`, j.body); ok++ }
        catch { failed.push(j.id) }
      }
      return { ok, failed }
    },
    onSuccess: ({ ok, failed }) => {
      qc.invalidateQueries({ queryKey: ["assets"] })
      if (failed.length) notify.error(`${onSuccessMsg(ok)} — ${failed.length} failed`)
      else notify.success(onSuccessMsg(ok))
      onClose(); onDone()
    },
    onError: (e: unknown) => notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Bulk update failed")),
  })
}

function BulkLifecycleDialog({ selected, onClose, onDone }: { selected: Asset[]; onClose: () => void; onDone: () => void }) {
  const [state, setState] = React.useState<string>("ACTIVE")
  const mut = useBulkPatch(ok => `${ok} asset${ok === 1 ? "" : "s"} set to ${LIFECYCLE_LABEL[state]}`, onDone, onClose)
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Change lifecycle</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>Set the lifecycle state for {selected.length} selected asset{selected.length === 1 ? "" : "s"}.</Typography>
        <TextField size="small" select fullWidth label="Lifecycle" value={state} onChange={e => setState(e.target.value)}>
          {LIFECYCLES.map(lc => <MenuItem key={lc} value={lc}>{LIFECYCLE_LABEL[lc]}</MenuItem>)}
        </TextField>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={mut.isPending} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" disabled={mut.isPending}
          onClick={() => mut.mutate(selected.map(a => ({ id: a.id, body: { lifecycleState: state } })))}
          sx={{ textTransform: "none" }}>Apply</Button>
      </DialogActions>
    </Dialog>
  )
}

function BulkPropertyDialog({ selected, customFields, onClose, onDone }: {
  selected: Asset[]; customFields: AssetCustomField[]; onClose: () => void; onDone: () => void
}) {
  const [fieldId, setFieldId] = React.useState(customFields[0]?.id ?? "")
  const [value, setValue] = React.useState("")
  const field = customFields.find(f => f.id === fieldId)
  const mut = useBulkPatch(ok => `${field?.label} set on ${ok} asset${ok === 1 ? "" : "s"}`, onDone, onClose)
  React.useEffect(() => { setValue("") }, [fieldId])
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Set custom property</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>Apply one custom field value to {selected.length} selected asset{selected.length === 1 ? "" : "s"}. Blank clears it.</Typography>
        <Stack spacing={1.5}>
          <TextField size="small" select fullWidth label="Field" value={fieldId} onChange={e => setFieldId(e.target.value)}>
            {customFields.map(f => <MenuItem key={f.id} value={f.id}>{f.label}</MenuItem>)}
          </TextField>
          {field ? (
            field.type === "select" ? (
              <TextField size="small" select fullWidth label="Value" value={value} onChange={e => setValue(e.target.value)}>
                <MenuItem value="">— (clear)</MenuItem>
                {field.options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            ) : (
              <TextField size="small" fullWidth label="Value" value={value} onChange={e => setValue(e.target.value)}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                InputLabelProps={field.type === "date" ? { shrink: true } : undefined} />
            )
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={mut.isPending} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" disabled={!field || mut.isPending}
          onClick={() => field && mut.mutate(selected.map(a => ({ id: a.id, body: { customValues: { [field.key]: value.trim() ? value : null } } })))}
          sx={{ textTransform: "none" }}>Apply</Button>
      </DialogActions>
    </Dialog>
  )
}

function BulkMoveDialog({ selected, onClose, onDone }: { selected: Asset[]; onClose: () => void; onDone: () => void }) {
  const { data: sites = [] } = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get<Site[]>("/sites")).data })
  const [siteId, setSiteId] = React.useState("")
  const mut = useBulkPatch(ok => `${ok} asset${ok === 1 ? "" : "s"} moved`, onDone, onClose)
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Move assets</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
          Move {selected.length} selected asset{selected.length === 1 ? "" : "s"} to another site. They'll be
          <strong> unplaced</strong> (cabinet &amp; U position cleared) — reposition them from the cabinet view.
        </Typography>
        <TextField size="small" select fullWidth label="Target site" value={siteId} onChange={e => setSiteId(e.target.value)}>
          {sites.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={mut.isPending} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" disabled={!siteId || mut.isPending}
          onClick={() => mut.mutate(selected.map(a => ({ id: a.id, body: { siteId, cabinetId: null, uPosition: null, rackSide: "FRONT" } })))}
          sx={{ textTransform: "none" }}>Move</Button>
      </DialogActions>
    </Dialog>
  )
}
