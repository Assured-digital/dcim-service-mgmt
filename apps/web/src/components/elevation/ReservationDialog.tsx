import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography
} from "@mui/material"
import { api } from "../../lib/api"
import { useNotification } from "../NotificationProvider"
import { CabinetReservation, getApiErrorMessage } from "../../lib/infrastructure"

// Create/edit an advisory U-range reservation (A3, spec §2). Expiry defaults to
// +1 month (the server default); clearing the date makes it open-ended. Editing
// offers Release (delete) — reservations are meant to be short-lived holds.
export function ReservationDialog({
  siteId, cabinetId, totalU, startingUnit, existing, defaultUStart, onClose, onChanged
}: {
  siteId: string
  cabinetId: string
  totalU: number
  startingUnit: number
  existing: CabinetReservation | null
  defaultUStart?: number
  onClose: () => void
  onChanged: () => void
}) {
  const { notify } = useNotification()
  const plusOneMonth = React.useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  }, [])

  const [name, setName] = React.useState(existing?.name ?? "")
  const [uStart, setUStart] = React.useState(String(existing?.uStart ?? defaultUStart ?? ""))
  const [uHeight, setUHeight] = React.useState(String(existing?.uHeight ?? 1))
  const [rackSide, setRackSide] = React.useState<string>(existing?.rackSide ?? "BOTH")
  const [expires, setExpires] = React.useState(
    existing ? (existing.expiresAt ? existing.expiresAt.slice(0, 10) : "") : plusOneMonth
  )
  const [notes, setNotes] = React.useState(existing?.notes ?? "")
  const [saving, setSaving] = React.useState(false)

  const base = `/sites/${siteId}/cabinets/${cabinetId}/reservations`
  const topU = startingUnit + totalU - 1

  async function handleSave() {
    const u = parseInt(uStart, 10)
    const h = Math.max(1, parseInt(uHeight, 10) || 1)
    if (!name.trim() || !u) { notify.error("Name and start U are required"); return }
    setSaving(true)
    try {
      const payload = {
        uStart: u,
        uHeight: h,
        rackSide: rackSide === "BOTH" ? null : rackSide,
        name: name.trim(),
        notes: notes.trim() || undefined,
        expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null
      }
      if (existing) await api.patch(`${base}/${existing.id}`, payload)
      else await api.post(base, payload)
      notify.success(existing ? "Reservation updated" : `Reserved U${u}–${u + h - 1}`)
      onChanged(); onClose()
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to save reservation"))
    } finally { setSaving(false) }
  }

  async function handleRelease() {
    if (!existing) return
    setSaving(true)
    try {
      await api.delete(`${base}/${existing.id}`)
      notify.success("Reservation released")
      onChanged(); onClose()
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to release reservation"))
    } finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>
        {existing ? "Edit reservation" : "Reserve space"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField autoFocus size="small" label="Reserved for" placeholder="Project or purpose" value={name} onChange={e => setName(e.target.value)} required />
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Start U" type="number" value={uStart} onChange={e => setUStart(e.target.value)}
              inputProps={{ min: startingUnit, max: topU }} sx={{ flex: 1 }} required />
            <TextField size="small" label="Height (U)" type="number" value={uHeight} onChange={e => setUHeight(e.target.value)}
              inputProps={{ min: 1, max: totalU }} sx={{ flex: 1 }} />
            <TextField size="small" select label="Face" value={rackSide} onChange={e => setRackSide(e.target.value)} sx={{ flex: 1 }}>
              <MenuItem value="BOTH">Both</MenuItem>
              <MenuItem value="FRONT">Front</MenuItem>
              <MenuItem value="REAR">Rear</MenuItem>
            </TextField>
          </Stack>
          <TextField size="small" label="Expires" type="date" value={expires} onChange={e => setExpires(e.target.value)}
            InputLabelProps={{ shrink: true }} helperText="Leave empty for an open-ended hold — expired holds free their space automatically" />
          <TextField size="small" label="Notes" value={notes} onChange={e => setNotes(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {existing ? (
          <Button size="small" color="error" onClick={handleRelease} disabled={saving} sx={{ mr: "auto", textTransform: "none" }}>
            Release reservation
          </Button>
        ) : null}
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSave} disabled={saving} sx={{ textTransform: "none" }}>
          {existing ? "Save" : "Reserve"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
