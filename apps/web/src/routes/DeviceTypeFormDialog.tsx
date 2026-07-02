import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Stack, Switch, TextField, Typography
} from "@mui/material"
import { useNotification } from "../components/NotificationProvider"
import {
  AIRFLOW_LABELS, DeviceAirflow, DeviceType,
  createDeviceType, updateDeviceType,
} from "../lib/deviceTypes"
import { getApiErrorMessage } from "../lib/infrastructure"

// Create OR edit a device type (DCIM spec §3). Editing never rewrites the assets
// that reference the type (the API enforces this) — this is the spec master. On
// create, manufacturer is a find-or-create text field; on edit it's fixed.
export function DeviceTypeFormDialog({ existing, onClose, onSaved }: {
  existing: DeviceType | null
  onClose: () => void
  onSaved: (dt: DeviceType) => void
}) {
  const { notify } = useNotification()
  const isEdit = !!existing

  const [manufacturerName, setManufacturerName] = React.useState(existing?.manufacturer.name ?? "")
  const [model, setModel] = React.useState(existing?.model ?? "")
  const [category, setCategory] = React.useState(existing?.category ?? "")
  const [uHeight, setUHeight] = React.useState(existing?.uHeight != null ? String(existing.uHeight) : "")
  const [isFullDepth, setIsFullDepth] = React.useState(existing?.isFullDepth ?? true)
  const [powerDrawW, setPowerDrawW] = React.useState(existing?.powerDrawW != null ? String(existing.powerDrawW) : "")
  const [weightKg, setWeightKg] = React.useState(existing?.weightKg != null ? String(existing.weightKg) : "")
  const [airflow, setAirflow] = React.useState<string>(existing?.airflow ?? "")
  const [deratePct, setDeratePct] = React.useState(existing?.deratePct != null ? String(existing.deratePct) : "")
  const [partNumber, setPartNumber] = React.useState(existing?.partNumber ?? "")
  const [excludeFromUtilization, setExcludeFromUtilization] = React.useState(existing?.excludeFromUtilization ?? false)
  const [saving, setSaving] = React.useState(false)

  const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s))

  async function handleSave() {
    if (!model.trim()) { notify.error("Model is required"); return }
    if (!isEdit && !manufacturerName.trim()) { notify.error("Manufacturer is required"); return }
    setSaving(true)
    try {
      const common = {
        model: model.trim(),
        uHeight: numOrNull(uHeight),
        isFullDepth,
        powerDrawW: numOrNull(powerDrawW),
        weightKg: numOrNull(weightKg),
        airflow: (airflow || null) as DeviceAirflow | null,
        category: category.trim() || null,
        deratePct: numOrNull(deratePct),
        partNumber: partNumber.trim() || null,
        excludeFromUtilization,
      }
      const dt = isEdit
        ? await updateDeviceType(existing!.id, common)
        : await createDeviceType({
            manufacturerName: manufacturerName.trim(),
            model: common.model,
            uHeight: common.uHeight ?? undefined,
            isFullDepth,
            powerDrawW: common.powerDrawW ?? undefined,
            weightKg: common.weightKg ?? undefined,
            airflow: common.airflow ?? undefined,
            category: common.category ?? undefined,
            deratePct: common.deratePct ?? undefined,
            partNumber: common.partNumber ?? undefined,
            excludeFromUtilization,
          })
      notify.success(isEdit ? "Device type updated" : "Device type created")
      onSaved(dt); onClose()
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to save device type"))
    } finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>
        {isEdit ? `Edit ${existing!.model}` : "New device type"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {isEdit ? (
            <Box>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Manufacturer</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{existing!.manufacturer.name}</Typography>
            </Box>
          ) : (
            <TextField autoFocus size="small" label="Manufacturer" placeholder="Dell, Cisco, in-house…"
              value={manufacturerName} onChange={e => setManufacturerName(e.target.value)}
              helperText="Matched to an existing manufacturer, or created if new" required />
          )}
          <TextField size="small" label="Model" value={model} onChange={e => setModel(e.target.value)} required />
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Category" placeholder="Server, Switch, PDU…" value={category} onChange={e => setCategory(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" label="Part number" value={partNumber} onChange={e => setPartNumber(e.target.value)} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="U height" type="number" value={uHeight} onChange={e => setUHeight(e.target.value)}
              inputProps={{ min: 0, step: 0.5 }} sx={{ flex: 1 }} />
            <TextField size="small" label="Power (W)" type="number" value={powerDrawW} onChange={e => setPowerDrawW(e.target.value)}
              inputProps={{ min: 0 }} sx={{ flex: 1 }} />
            <TextField size="small" label="Weight (kg)" type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)}
              inputProps={{ min: 0, step: 0.1 }} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" select label="Airflow" value={airflow} onChange={e => setAirflow(e.target.value)} sx={{ flex: 1 }}>
              <MenuItem value="">—</MenuItem>
              {Object.entries(AIRFLOW_LABELS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Power derate %" type="number" value={deratePct} onChange={e => setDeratePct(e.target.value)}
              inputProps={{ min: 1, max: 100 }} helperText="Blank = default 60%" sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={3}>
            <FormControlLabel control={<Switch size="small" checked={isFullDepth} onChange={e => setIsFullDepth(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 13 }}>Full depth</Typography>} />
            <FormControlLabel control={<Switch size="small" checked={excludeFromUtilization} onChange={e => setExcludeFromUtilization(e.target.checked)} />}
              label={<Typography sx={{ fontSize: 13 }}>Exclude from fill %</Typography>} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSave} disabled={saving} sx={{ textTransform: "none" }}>
          {isEdit ? "Save changes" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
