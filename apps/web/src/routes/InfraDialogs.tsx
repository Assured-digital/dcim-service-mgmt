import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography
} from "@mui/material"
import BusinessIcon from "@mui/icons-material/Business"
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom"
import StorageIcon from "@mui/icons-material/Storage"
import ArrowForwardIcon from "@mui/icons-material/ArrowForward"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import { Room, ROOM_TYPE_LABELS, ASSET_LIFECYCLE_OPTIONS, ElevationSide, Cabinet, Site } from "../lib/infrastructure"
import { useAssignableUsers } from "../lib/useAssignableUsers"

// User-friendly labels for the MaintenanceWorkType prisma enum
const MAINTENANCE_WORK_TYPES: { value: string; label: string }[] = [
  { value: "INSPECTION", label: "Inspection" },
  { value: "PAT_INSPECTION", label: "PAT inspection" },
  { value: "COOLING_CHECK", label: "Cooling check" },
  { value: "CABLE_AUDIT", label: "Cable audit" },
  { value: "PSU_REPLACEMENT", label: "PSU replacement" },
  { value: "REPAIR", label: "Repair" },
  { value: "FIRMWARE_UPGRADE", label: "Firmware upgrade" },
  { value: "UPGRADE", label: "Upgrade" },
  { value: "OTHER", label: "Other" },
]

// ─── Add site ──────────────────────────────────────────────────────────────

export function AddSiteDialog({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { name: string; address?: string; city?: string; postcode?: string; notes?: string }) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [postcode, setPostcode] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave({ name: name.trim(), address: address || undefined, city: city || undefined, postcode: postcode || undefined, notes: notes || undefined }); onClose() }
    catch { /* error handled by parent */ }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add site</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Site name" value={name} onChange={e => setName(e.target.value)} required fullWidth autoFocus />
          <TextField label="Address" value={address} onChange={e => setAddress(e.target.value)} fullWidth />
          <Stack direction="row" spacing={2}><TextField label="City" value={city} onChange={e => setCity(e.target.value)} fullWidth /><TextField label="Postcode" value={postcode} onChange={e => setPostcode(e.target.value)} fullWidth /></Stack>
          <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)} multiline rows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Creating..." : "Create site"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Edit site ─────────────────────────────────────────────────────────────

export function EditSiteDialog({ site, onClose, onSave }: {
  site: { name: string; address: string | null; city: string | null; postcode: string | null; country: string; notes: string | null }
  onClose: () => void
  onSave: (data: { name: string; address?: string; city?: string; postcode?: string; country?: string; notes?: string }) => Promise<void>
}) {
  const [name, setName] = React.useState(site.name ?? "")
  const [address, setAddress] = React.useState(site.address ?? "")
  const [city, setCity] = React.useState(site.city ?? "")
  const [postcode, setPostcode] = React.useState(site.postcode ?? "")
  const [country, setCountry] = React.useState(site.country ?? "UK")
  const [notes, setNotes] = React.useState(site.notes ?? "")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave({ name: name.trim(), address: address || undefined, city: city || undefined, postcode: postcode || undefined, country: country || undefined, notes: notes || undefined }); onClose() }
    catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit site</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Site name" value={name} onChange={e => setName(e.target.value)} required fullWidth />
          <TextField label="Address" value={address} onChange={e => setAddress(e.target.value)} fullWidth />
          <Stack direction="row" spacing={2}><TextField label="City" value={city} onChange={e => setCity(e.target.value)} fullWidth /><TextField label="Postcode" value={postcode} onChange={e => setPostcode(e.target.value)} fullWidth /></Stack>
          <TextField label="Country" value={country} onChange={e => setCountry(e.target.value)} fullWidth />
          <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)} multiline rows={2} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Save changes"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Add room ──────────────────────────────────────────────────────────────

export function AddRoomDialog({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { name: string; type: string }) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState("DATA_HALL")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave({ name: name.trim(), type }); onClose() }
    catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add room</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Room name" value={name} onChange={e => setName(e.target.value)} required fullWidth autoFocus />
          <TextField select label="Type" value={type} onChange={e => setType(e.target.value)} fullWidth>{Object.entries(ROOM_TYPE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Creating..." : "Create room"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Edit room ─────────────────────────────────────────────────────────────

export function EditRoomDialog({ room, onClose, onSave }: {
  room: Room
  onClose: () => void
  onSave: (data: { name: string; type: string }) => Promise<void>
}) {
  const [name, setName] = React.useState(room.name ?? "")
  const [type, setType] = React.useState(room.type ?? "DATA_HALL")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave({ name: name.trim(), type }); onClose() }
    catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit room</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Room name" value={name} onChange={e => setName(e.target.value)} required fullWidth />
          <TextField select label="Type" value={type} onChange={e => setType(e.target.value)} fullWidth>{Object.entries(ROOM_TYPE_LABELS).map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}</TextField>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Save changes"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Add cabinet ───────────────────────────────────────────────────────────

export function AddCabinetDialog({ rooms, defaultRoomId, contextLabel, onClose, onSave }: {
  rooms: Room[]
  defaultRoomId?: string
  contextLabel?: string
  onClose: () => void
  onSave: (data: { name: string; type: string; totalU?: number; powerKw?: number; roomId?: string }) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState("RACK")
  const [totalU, setTotalU] = React.useState("")
  const [powerKw, setPowerKw] = React.useState("")
  const [roomId, setRoomId] = React.useState(defaultRoomId ?? "")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave({ name: name.trim(), type, totalU: totalU ? parseInt(totalU) : undefined, powerKw: powerKw ? parseFloat(powerKw) : undefined, roomId: roomId || undefined }); onClose() }
    catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add cabinet{contextLabel ? ` to ${contextLabel}` : ""}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Cabinet name" value={name} onChange={e => setName(e.target.value)} required fullWidth autoFocus />
          <TextField select label="Type" value={type} onChange={e => setType(e.target.value)} fullWidth><MenuItem value="RACK">Cabinet</MenuItem><MenuItem value="WALL_MOUNT">Wall mount</MenuItem><MenuItem value="OPEN_FRAME">Open frame</MenuItem></TextField>
          <TextField select label="Room" value={roomId} onChange={e => setRoomId(e.target.value)} fullWidth><MenuItem value="">Unassigned</MenuItem>{rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}</TextField>
          <Stack direction="row" spacing={2}><TextField label="Total U" type="number" value={totalU} onChange={e => setTotalU(e.target.value)} fullWidth /><TextField label="Power (kW)" type="number" value={powerKw} onChange={e => setPowerKw(e.target.value)} fullWidth /></Stack>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Creating..." : "Create cabinet"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Edit cabinet ──────────────────────────────────────────────────────────

export function EditCabinetDialog({ cabinet, rooms, onClose, onSave }: {
  cabinet: Cabinet
  rooms: Room[]
  onClose: () => void
  onSave: (data: { name: string; type: string; totalU?: number; powerKw?: number; roomId: string | null }) => Promise<void>
}) {
  const [name, setName] = React.useState(cabinet.name ?? "")
  const [type, setType] = React.useState(cabinet.type ?? "RACK")
  const [totalU, setTotalU] = React.useState(cabinet.totalU != null ? String(cabinet.totalU) : "")
  const [powerKw, setPowerKw] = React.useState(cabinet.powerKw != null ? String(cabinet.powerKw) : "")
  const [roomId, setRoomId] = React.useState(cabinet.roomId ?? "")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try { await onSave({ name: name.trim(), type, totalU: totalU ? parseInt(totalU) : undefined, powerKw: powerKw ? parseFloat(powerKw) : undefined, roomId: roomId || null }); onClose() }
    catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit cabinet</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Cabinet name" value={name} onChange={e => setName(e.target.value)} required fullWidth />
          <TextField select label="Type" value={type} onChange={e => setType(e.target.value)} fullWidth><MenuItem value="RACK">Cabinet</MenuItem><MenuItem value="WALL_MOUNT">Wall mount</MenuItem><MenuItem value="OPEN_FRAME">Open frame</MenuItem></TextField>
          <TextField select label="Room" value={roomId} onChange={e => setRoomId(e.target.value)} fullWidth><MenuItem value="">Unassigned</MenuItem>{rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}</TextField>
          <Stack direction="row" spacing={2}><TextField label="Total U" type="number" value={totalU} onChange={e => setTotalU(e.target.value)} fullWidth /><TextField label="Power (kW)" type="number" value={powerKw} onChange={e => setPowerKw(e.target.value)} fullWidth /></Stack>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Save changes"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Add asset ─────────────────────────────────────────────────────────────

export function AddAssetDialog({ cabinets, defaultCabinetId, contextLabel, onClose, onSave }: {
  cabinets: Cabinet[]
  defaultCabinetId?: string
  contextLabel?: string
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [assetTag, setAssetTag] = React.useState("")
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState("")
  const [manufacturer, setManufacturer] = React.useState("")
  const [model, setModel] = React.useState("")
  const [serial, setSerial] = React.useState("")
  const [ip, setIp] = React.useState("")
  const [uPos, setUPos] = React.useState("")
  const [uHeight, setUHeight] = React.useState("")
  const [power, setPower] = React.useState("")
  const [rackSide, setRackSide] = React.useState<ElevationSide>("FRONT")
  const [cabinetId, setCabinetId] = React.useState(defaultCabinetId ?? "")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!assetTag.trim() || !name.trim() || !type.trim()) return
    setSaving(true)
    try {
      await onSave({
        assetTag: assetTag.trim(), name: name.trim(), assetType: type.trim(),
        cabinetId: cabinetId || undefined, manufacturer: manufacturer || undefined,
        modelNumber: model || undefined, serialNumber: serial || undefined,
        ipAddress: ip || undefined, uPosition: uPos ? parseInt(uPos) : undefined,
        uHeight: uHeight ? parseInt(uHeight) : undefined,
        powerDrawW: power ? parseFloat(power) : undefined, rackSide,
      })
      onClose()
    } catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add asset{contextLabel ? ` to ${contextLabel}` : ""}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={2}><TextField label="Asset tag" value={assetTag} onChange={e => setAssetTag(e.target.value)} required fullWidth autoFocus /><TextField label="Name" value={name} onChange={e => setName(e.target.value)} required fullWidth /></Stack>
          <TextField label="Type" value={type} onChange={e => setType(e.target.value)} required fullWidth />
          <TextField select label="Cabinet" value={cabinetId} onChange={e => setCabinetId(e.target.value)} fullWidth><MenuItem value="">Unassigned</MenuItem>{cabinets.map(cab => <MenuItem key={cab.id} value={cab.id}>{cab.name}</MenuItem>)}</TextField>
          <Stack direction="row" spacing={2}><TextField label="Manufacturer" value={manufacturer} onChange={e => setManufacturer(e.target.value)} fullWidth /><TextField label="Model" value={model} onChange={e => setModel(e.target.value)} fullWidth /></Stack>
          <Stack direction="row" spacing={2}><TextField label="Serial number" value={serial} onChange={e => setSerial(e.target.value)} fullWidth /><TextField label="IP address" value={ip} onChange={e => setIp(e.target.value)} fullWidth /></Stack>
          <Stack direction="row" spacing={2}><TextField label="U position" type="number" value={uPos} onChange={e => setUPos(e.target.value)} fullWidth /><TextField label="U height" type="number" value={uHeight} onChange={e => setUHeight(e.target.value)} fullWidth /><TextField label="Power draw (W)" type="number" value={power} onChange={e => setPower(e.target.value)} fullWidth /></Stack>
          <TextField select label="Cabinet side" value={rackSide} onChange={e => setRackSide(e.target.value as ElevationSide)} fullWidth><MenuItem value="FRONT">Front</MenuItem><MenuItem value="REAR">Rear</MenuItem></TextField>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !assetTag.trim() || !name.trim() || !type.trim()}>{saving ? "Creating..." : "Add asset"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Edit asset ────────────────────────────────────────────────────────────

export function EditAssetDialog({ asset, cabinets, onClose, onSave }: {
  asset: { assetTag: string; name: string; assetType: string; manufacturer: string | null; modelNumber: string | null; serialNumber: string | null; ipAddress: string | null; uPosition: number | null; uHeight: number | null; powerDrawW: number | null; rackSide: "FRONT" | "REAR" | null; lifecycleState: string; status: string; cabinetId: string | null }
  cabinets: Cabinet[]
  onClose: () => void
  onSave: (data: any) => Promise<void>
}) {
  const [assetTag, setAssetTag] = React.useState(asset.assetTag ?? "")
  const [name, setName] = React.useState(asset.name ?? "")
  const [type, setType] = React.useState(asset.assetType ?? "")
  const [manufacturer, setManufacturer] = React.useState(asset.manufacturer ?? "")
  const [model, setModel] = React.useState(asset.modelNumber ?? "")
  const [serial, setSerial] = React.useState(asset.serialNumber ?? "")
  const [ip, setIp] = React.useState(asset.ipAddress ?? "")
  const [uPos, setUPos] = React.useState(asset.uPosition != null ? String(asset.uPosition) : "")
  const [uHeight, setUHeight] = React.useState(asset.uHeight != null ? String(asset.uHeight) : "")
  const [power, setPower] = React.useState(asset.powerDrawW != null ? String(asset.powerDrawW) : "")
  const [rackSide, setRackSide] = React.useState<ElevationSide>(asset.rackSide === "REAR" ? "REAR" : "FRONT")
  const [lifecycle, setLifecycle] = React.useState(asset.lifecycleState ?? "ACTIVE")
  const [status, setStatus] = React.useState(asset.status ?? "ACTIVE")
  const [cabinetId, setCabinetId] = React.useState(asset.cabinetId ?? "")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!assetTag.trim() || !name.trim() || !type.trim()) return
    setSaving(true)
    try {
      await onSave({
        assetTag: assetTag.trim(), name: name.trim(), assetType: type.trim(),
        manufacturer: manufacturer || undefined, modelNumber: model || undefined,
        serialNumber: serial || undefined, ipAddress: ip || undefined,
        uPosition: uPos ? parseInt(uPos) : null, uHeight: uHeight ? parseInt(uHeight) : null,
        powerDrawW: power ? parseFloat(power) : null, rackSide, lifecycleState: lifecycle,
        status: status || undefined, cabinetId: cabinetId || null,
      })
      onClose()
    } catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit asset</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={2}><TextField label="Asset tag" value={assetTag} onChange={e => setAssetTag(e.target.value)} required fullWidth /><TextField label="Name" value={name} onChange={e => setName(e.target.value)} required fullWidth /></Stack>
          <TextField label="Type" value={type} onChange={e => setType(e.target.value)} required fullWidth />
          <TextField select label="Cabinet" value={cabinetId} onChange={e => setCabinetId(e.target.value)} fullWidth><MenuItem value="">Unassigned</MenuItem>{cabinets.map(cab => <MenuItem key={cab.id} value={cab.id}>{cab.name}</MenuItem>)}</TextField>
          <Stack direction="row" spacing={2}><TextField label="Manufacturer" value={manufacturer} onChange={e => setManufacturer(e.target.value)} fullWidth /><TextField label="Model" value={model} onChange={e => setModel(e.target.value)} fullWidth /></Stack>
          <Stack direction="row" spacing={2}><TextField label="Serial number" value={serial} onChange={e => setSerial(e.target.value)} fullWidth /><TextField label="IP address" value={ip} onChange={e => setIp(e.target.value)} fullWidth /></Stack>
          <Stack direction="row" spacing={2}><TextField label="U position" type="number" value={uPos} onChange={e => setUPos(e.target.value)} fullWidth /><TextField label="U height" type="number" value={uHeight} onChange={e => setUHeight(e.target.value)} fullWidth /><TextField label="Power draw (W)" type="number" value={power} onChange={e => setPower(e.target.value)} fullWidth /></Stack>
          <Stack direction="row" spacing={2}><TextField select label="Cabinet side" value={rackSide} onChange={e => setRackSide(e.target.value as ElevationSide)} fullWidth><MenuItem value="FRONT">Front</MenuItem><MenuItem value="REAR">Rear</MenuItem></TextField><TextField select label="Lifecycle" value={lifecycle} onChange={e => setLifecycle(e.target.value)} fullWidth>{ASSET_LIFECYCLE_OPTIONS.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}</TextField><TextField label="Status" value={status} onChange={e => setStatus(e.target.value)} fullWidth /></Stack>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving || !assetTag.trim() || !name.trim() || !type.trim()}>{saving ? "Saving..." : "Save changes"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Delete confirm ────────────────────────────────────────────────────────

export function DeleteConfirmDialog({ type, label, onClose, onConfirm }: {
  type: string
  label: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [deleting, setDeleting] = React.useState(false)

  async function handleDelete() {
    setDeleting(true)
    try { await onConfirm(); onClose() }
    catch { }
    finally { setDeleting(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Confirm delete</DialogTitle>
      <DialogContent><Typography variant="body2" sx={{ mt: 0.5 }}>Delete {type} <strong>{label}</strong>? This cannot be undone.</Typography></DialogContent>
      <DialogActions><Button onClick={onClose} disabled={deleting}>Cancel</Button><Button color="error" variant="contained" onClick={handleDelete} disabled={deleting}>{deleting ? "Deleting..." : "Delete"}</Button></DialogActions>
    </Dialog>
  )
}

// ─── Change asset status ───────────────────────────────────────────────────

export function ChangeAssetStatusDialog({ asset, onClose, onSave }: {
  asset: { lifecycleState: string; status: string }
  onClose: () => void
  onSave: (data: { lifecycleState: string; status: string }) => Promise<void>
}) {
  const [lifecycle, setLifecycle] = React.useState(asset.lifecycleState ?? "ACTIVE")
  const [status, setStatus] = React.useState(asset.status ?? "ACTIVE")
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    setSaving(true)
    try { await onSave({ lifecycleState: lifecycle, status: status || "ACTIVE" }); onClose() }
    catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change asset status</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField select label="Lifecycle" value={lifecycle} onChange={e => setLifecycle(e.target.value)} fullWidth>
            {ASSET_LIFECYCLE_OPTIONS.map(v => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <TextField label="Status" value={status} onChange={e => setStatus(e.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Move asset ────────────────────────────────────────────────────────────

type MoveAssetSnapshot = {
  siteId: string | null
  siteName?: string | null
  cabinetId: string | null
  cabinetName?: string | null
  uPosition: number | null
  rackSide: "FRONT" | "REAR" | null
  cabinet?: { roomId: string | null; room?: { id: string; name: string } | null } | null
}

function LocationLevelRow({ icon, label, value, muted = false }: {
  icon: React.ReactNode
  label: string
  value: string | null | undefined
  muted?: boolean
}) {
  const display = value && value.trim() ? value : "—"
  const textColor = muted || !value ? "#94a3b8" : "#0f172a"
  return (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ py: "6px" }}>
      <Box sx={{ width: 24, height: 24, borderRadius: "6px", bgcolor: "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#1d4ed8" }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 9.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", lineHeight: 1 }}>{label}</Typography>
        <Typography sx={{ fontSize: 12.5, color: textColor, fontWeight: 500, mt: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {display}
        </Typography>
      </Box>
    </Stack>
  )
}

export function MoveAssetDialog({ asset, onClose, onSave }: {
  asset: MoveAssetSnapshot
  onClose: () => void
  onSave: (data: { siteId: string; cabinetId: string | null; uPosition: number | null; rackSide: ElevationSide }) => Promise<void>
}) {
  const [siteId, setSiteId] = React.useState<string>(asset.siteId ?? "")
  const [roomId, setRoomId] = React.useState<string>(asset.cabinet?.roomId ?? "")
  const [cabinetId, setCabinetId] = React.useState<string>(asset.cabinetId ?? "")
  const [uPosition, setUPosition] = React.useState<string>(asset.uPosition != null ? String(asset.uPosition) : "")
  const [rackSide, setRackSide] = React.useState<ElevationSide>(asset.rackSide === "REAR" ? "REAR" : "FRONT")
  const [saving, setSaving] = React.useState(false)

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => (await api.get<Site[]>("/sites")).data
  })
  const { data: rooms = [] } = useQuery({
    queryKey: ["site-rooms", siteId],
    queryFn: async () => (await api.get<Room[]>(`/sites/${siteId}/rooms`)).data,
    enabled: !!siteId
  })
  const { data: cabinets = [] } = useQuery({
    queryKey: ["site-cabinets", siteId],
    queryFn: async () => (await api.get<Cabinet[]>(`/sites/${siteId}/cabinets`)).data,
    enabled: !!siteId
  })

  const visibleCabinets = React.useMemo(
    () => roomId ? cabinets.filter(c => c.roomId === roomId) : cabinets,
    [cabinets, roomId]
  )

  const unchanged =
    (siteId || null) === (asset.siteId ?? null) &&
    (cabinetId || null) === (asset.cabinetId ?? null) &&
    (uPosition ? parseInt(uPosition) : null) === (asset.uPosition ?? null) &&
    rackSide === (asset.rackSide ?? "FRONT")

  function handleSiteChange(next: string) {
    setSiteId(next)
    setRoomId("")
    setCabinetId("")
  }
  function handleRoomChange(next: string) {
    setRoomId(next)
    setCabinetId("")
  }

  async function handleSave() {
    if (!siteId || unchanged) return
    setSaving(true)
    try {
      await onSave({
        siteId,
        cabinetId: cabinetId || null,
        uPosition: uPosition ? parseInt(uPosition) : null,
        rackSide
      })
      onClose()
    } catch { }
    finally { setSaving(false) }
  }

  const currentPosition = asset.uPosition != null
    ? `U${asset.uPosition}${asset.rackSide ? ` · ${asset.rackSide.toLowerCase()}` : ""}`
    : null

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Move asset</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "18px", alignItems: "stretch", mt: 0.5 }}>

          {/* Current location (read-only) */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", mb: "8px" }}>
              Current location
            </Typography>
            <Box sx={{ bgcolor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", p: "10px 14px" }}>
              <LocationLevelRow icon={<BusinessIcon sx={{ fontSize: 14 }} />} label="Site" value={asset.siteName ?? null} />
              <LocationLevelRow icon={<MeetingRoomIcon sx={{ fontSize: 14 }} />} label="Room" value={asset.cabinet?.room?.name ?? null} />
              <LocationLevelRow icon={<StorageIcon sx={{ fontSize: 14 }} />} label="Cabinet" value={asset.cabinetName ?? null} />
              <LocationLevelRow icon={<Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#1d4ed8" }} />} label="Position" value={currentPosition} />
            </Box>
          </Box>

          {/* Arrow column */}
          <Stack alignItems="center" justifyContent="center" sx={{ minWidth: 64 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", mb: "8px" }}>
              Move to
            </Typography>
            <Box sx={{ width: 40, height: 40, borderRadius: "50%", bgcolor: "#e8f1ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowForwardIcon sx={{ fontSize: 22, color: "#1d4ed8" }} />
            </Box>
          </Stack>

          {/* New location (form) */}
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", mb: "8px" }}>
              New location
            </Typography>
            <Stack spacing={1.5}>
              <TextField size="small" select label="Site" value={siteId} onChange={e => handleSiteChange(e.target.value)} required fullWidth>
                {sites.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
              </TextField>
              <TextField size="small" select label="Room" value={roomId} onChange={e => handleRoomChange(e.target.value)} fullWidth disabled={!siteId}>
                <MenuItem value="">Unassigned</MenuItem>
                {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
              </TextField>
              <TextField size="small" select label="Cabinet" value={cabinetId} onChange={e => setCabinetId(e.target.value)} fullWidth disabled={!siteId}>
                <MenuItem value="">Unpositioned</MenuItem>
                {visibleCabinets.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              </TextField>
              <Stack direction="row" spacing={1.25}>
                <TextField size="small" label="U position" type="number" value={uPosition} onChange={e => setUPosition(e.target.value)} fullWidth disabled={!cabinetId} />
                <TextField size="small" select label="Side" value={rackSide} onChange={e => setRackSide(e.target.value as ElevationSide)} fullWidth disabled={!cabinetId}>
                  <MenuItem value="FRONT">Front</MenuItem>
                  <MenuItem value="REAR">Rear</MenuItem>
                </TextField>
              </Stack>
            </Stack>
          </Box>

        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !siteId || unchanged}>{saving ? "Moving..." : "Move asset"}</Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Log maintenance ───────────────────────────────────────────────────────

export function LogMaintenanceDialog({ onClose, onSave }: {
  onClose: () => void
  onSave: (data: { workType: string; workTypeOther?: string; performedAt: string; performedById?: string; notes?: string; nextDueAt?: string }) => Promise<void>
}) {
  const [workType, setWorkType] = React.useState("INSPECTION")
  const [workTypeOther, setWorkTypeOther] = React.useState("")
  const [performedAt, setPerformedAt] = React.useState(() => new Date().toISOString().split("T")[0])
  const [performedById, setPerformedById] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [nextDueAt, setNextDueAt] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Assignee picker source ("Performed by") — operational-callable &
  // client-scoped, replacing admin-only GET /users. value = id, label = displayName.
  const { data: users = [] } = useAssignableUsers()

  async function handleSave() {
    if (!performedAt) return
    setSaving(true)
    try {
      await onSave({
        workType,
        workTypeOther: workType === "OTHER" && workTypeOther ? workTypeOther : undefined,
        performedAt: new Date(performedAt).toISOString(),
        performedById: performedById || undefined,
        notes: notes || undefined,
        nextDueAt: nextDueAt ? new Date(nextDueAt).toISOString() : undefined
      })
      onClose()
    } catch { }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Log maintenance</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField select label="Work type" value={workType} onChange={e => setWorkType(e.target.value)} fullWidth>
            {MAINTENANCE_WORK_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          {workType === "OTHER" ? (
            <TextField label="Describe the work" value={workTypeOther} onChange={e => setWorkTypeOther(e.target.value)} fullWidth />
          ) : null}
          <Stack direction="row" spacing={2}>
            <TextField label="Performed at" type="date" InputLabelProps={{ shrink: true }} value={performedAt} onChange={e => setPerformedAt(e.target.value)} required fullWidth />
            <TextField label="Next due" type="date" InputLabelProps={{ shrink: true }} value={nextDueAt} onChange={e => setNextDueAt(e.target.value)} fullWidth />
          </Stack>
          <TextField select label="Performed by" value={performedById} onChange={e => setPerformedById(e.target.value)} fullWidth>
            <MenuItem value="">(current user)</MenuItem>
            {users.map(u => <MenuItem key={u.id} value={u.id}>{u.displayName}</MenuItem>)}
          </TextField>
          <TextField label="Notes" value={notes} onChange={e => setNotes(e.target.value)} multiline rows={3} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || !performedAt}>{saving ? "Saving..." : "Log maintenance"}</Button>
      </DialogActions>
    </Dialog>
  )
}