import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, Step, StepLabel, Stepper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography
} from "@mui/material"
import UploadIcon from "@mui/icons-material/Upload"
import { api } from "../../lib/api"
import { useNotification } from "../NotificationProvider"
import { getApiErrorMessage } from "../../lib/infrastructure"
import { FloorPlanRoom, updateRoomSettings } from "../../lib/floorPlan"

// Floor-plan setup paths (DCIM_DESIGN_BRIEF §6 "edit mode — setup"):
//  - RoomSetupDialog: typed dimensions + snap grid (the "draw a simple room"
//    light path — rectangle via width/depth) + plan-image backdrop upload.
//  - CsvImportDialog: paste/upload a spreadsheet → map columns → preview →
//    bulk-create cabinets (idempotent server-side dedupe; mapping saved for
//    repeat imports via ImportMapping).

export function RoomSetupDialog({ roomId, room, onClose, onChanged }: {
  roomId: string
  room: FloorPlanRoom
  onClose: () => void
  onChanged: () => void
}) {
  const { notify } = useNotification()
  const [widthMm, setWidthMm] = React.useState(room.widthMm != null ? String(room.widthMm) : "")
  const [depthMm, setDepthMm] = React.useState(room.depthMm != null ? String(room.depthMm) : "")
  const [gridCols, setGridCols] = React.useState(String(room.gridCols ?? 16))
  const [gridRows, setGridRows] = React.useState(String(room.gridRows ?? 12))
  const [opacity, setOpacity] = React.useState(String(Math.round((room.backgroundOpacity ?? 0.4) * 100)))
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  async function handleSave() {
    setSaving(true)
    try {
      await updateRoomSettings(roomId, {
        widthMm: widthMm.trim() === "" ? null : parseInt(widthMm, 10),
        depthMm: depthMm.trim() === "" ? null : parseInt(depthMm, 10),
        gridCols: Math.max(2, parseInt(gridCols, 10) || 16),
        gridRows: Math.max(2, parseInt(gridRows, 10) || 12),
        backgroundOpacity: Math.max(0.05, Math.min(1, (parseInt(opacity, 10) || 40) / 100)),
        shellType: room.shellType ?? "DRAWN",
      })
      notify.success("Room updated")
      onChanged(); onClose()
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to update the room"))
    } finally { setSaving(false) }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append("file", file)
      await api.put(`/rooms/${roomId}/floor-plan/background`, form)
      notify.success("Plan image uploaded — plot cabinets over the backdrop")
      onChanged()
    } catch (err: unknown) {
      notify.error(getApiErrorMessage((err as any)?.response?.data ?? err, "Upload failed"))
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Room setup</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Width (mm)" type="number" value={widthMm} onChange={e => setWidthMm(e.target.value)} sx={{ flex: 1 }} />
            <TextField size="small" label="Depth (mm)" type="number" value={depthMm} onChange={e => setDepthMm(e.target.value)} sx={{ flex: 1 }} />
          </Stack>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Grid columns" type="number" value={gridCols} onChange={e => setGridCols(e.target.value)} inputProps={{ min: 2, max: 60 }} sx={{ flex: 1 }} />
            <TextField size="small" label="Grid rows" type="number" value={gridRows} onChange={e => setGridRows(e.target.value)} inputProps={{ min: 2, max: 60 }} sx={{ flex: 1 }} />
          </Stack>
          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary", mb: 0.5 }}>Plan image backdrop</Typography>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleUpload} />
              <Button size="small" variant="outlined" startIcon={<UploadIcon sx={{ fontSize: 14 }} />} disabled={uploading}
                onClick={() => fileRef.current?.click()} sx={{ textTransform: "none" }}>
                {uploading ? "Uploading…" : room.hasBackgroundImage ? "Replace image" : "Upload image"}
              </Button>
              <TextField size="small" label="Opacity %" type="number" value={opacity} onChange={e => setOpacity(e.target.value)} inputProps={{ min: 5, max: 100 }} sx={{ width: 110 }} />
            </Stack>
            <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>
              PNG or JPEG of the room plan — shown dimmed under the grid so you can plot cabinets on top. No CAD needed.
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={handleSave} disabled={saving} sx={{ textTransform: "none" }}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── CSV import wizard ────────────────────────────────────────────────────────

const TARGET_FIELDS: { key: string; label: string; required?: boolean; guess: RegExp }[] = [
  { key: "name", label: "Cabinet name", required: true, guess: /name|cabinet|rack/i },
  { key: "row", label: "Row", guess: /^row$|row.?label/i },
  { key: "positionInRow", label: "Position in row", guess: /pos|slot|position/i },
  { key: "totalU", label: "Total U", guess: /total.?u|height|^u$|size/i },
  { key: "powerKw", label: "Power (kW)", guess: /power|kw|feed/i },
]

// Minimal CSV parser: handles quoted fields + commas-in-quotes; good for the
// rack spreadsheets this targets (not a general-purpose RFC 4180 machine).
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = "", inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (ch === '"') inQ = false
        else cur += ch
      } else if (ch === '"') inQ = true
      else if (ch === ",") { cells.push(cur); cur = "" }
      else cur += ch
    }
    cells.push(cur)
    rows.push(cells.map(c => c.trim()))
  }
  return rows
}

export function CsvImportDialog({ roomId, onClose, onImported }: {
  roomId: string
  onClose: () => void
  onImported: () => void
}) {
  const { notify } = useNotification()
  const [step, setStep] = React.useState(0)
  const [raw, setRaw] = React.useState("")
  const [headers, setHeaders] = React.useState<string[]>([])
  const [rows, setRows] = React.useState<string[][]>([])
  const [mapping, setMapping] = React.useState<Record<string, string>>({})
  const [mappingName, setMappingName] = React.useState("")
  const [importing, setImporting] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  function handleParse(text: string) {
    const parsed = parseCsv(text)
    if (parsed.length < 2) { notify.error("Need a header row plus at least one data row"); return }
    const hdrs = parsed[0]
    setHeaders(hdrs); setRows(parsed.slice(1)); setRaw(text)
    // Auto-guess the column mapping from header names.
    const guessed: Record<string, string> = {}
    for (const f of TARGET_FIELDS) {
      const hit = hdrs.find(h => f.guess.test(h))
      if (hit) guessed[f.key] = hit
    }
    setMapping(guessed)
    setStep(1)
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    file.text().then(handleParse).catch(() => notify.error("Could not read the file"))
    if (fileRef.current) fileRef.current.value = ""
  }

  const mapped = React.useMemo(() => {
    const idx: Record<string, number> = {}
    for (const [key, col] of Object.entries(mapping)) {
      const i = headers.indexOf(col)
      if (i >= 0) idx[key] = i
    }
    return rows.map(r => ({
      name: idx.name != null ? r[idx.name] : "",
      row: idx.row != null ? r[idx.row] || undefined : undefined,
      positionInRow: idx.positionInRow != null && r[idx.positionInRow] ? parseInt(r[idx.positionInRow], 10) || undefined : undefined,
      totalU: idx.totalU != null && r[idx.totalU] ? parseInt(r[idx.totalU], 10) || undefined : undefined,
      powerKw: idx.powerKw != null && r[idx.powerKw] ? parseFloat(r[idx.powerKw]) || undefined : undefined,
    })).filter(r => r.name)
  }, [rows, headers, mapping])

  async function handleImport() {
    setImporting(true)
    try {
      const res = await api.post(`/rooms/${roomId}/cabinet-import`, {
        rows: mapped,
        ...(mappingName.trim() ? { mappingName: mappingName.trim(), columnMap: mapping } : {}),
      })
      const { created, skipped } = res.data as { created: number; skipped: number }
      notify.success(`Imported ${created} cabinet(s)${skipped ? `, ${skipped} skipped (already exist)` : ""}`)
      onImported(); onClose()
    } catch (e: unknown) {
      notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Import failed"))
    } finally { setImporting(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Import cabinets from a spreadsheet</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 2.5, mt: 0.5 }}>
          {["Paste or upload", "Map columns", "Preview & import"].map(l => <Step key={l}><StepLabel>{l}</StepLabel></Step>)}
        </Stepper>

        {step === 0 ? (
          <Stack spacing={1.5}>
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
              Paste your rack sheet as CSV (first row = headers), or upload a .csv file. Cabinets that already exist are skipped, so re-importing is safe.
            </Typography>
            <TextField multiline minRows={7} maxRows={14} value={raw} onChange={e => setRaw(e.target.value)}
              placeholder={"Rack Name,Row,Position,Total U,Power kW\nCAB-A-01,R1,1,42,8\nCAB-A-02,R1,2,42,8"}
              sx={{ "& textarea": { fontFamily: "monospace", fontSize: 12 } }} />
            <Stack direction="row" spacing={1}>
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
              <Button size="small" variant="outlined" onClick={() => fileRef.current?.click()} sx={{ textTransform: "none" }}>Upload .csv</Button>
              <Box sx={{ flex: 1 }} />
              <Button size="small" variant="contained" disabled={!raw.trim()} onClick={() => handleParse(raw)} sx={{ textTransform: "none" }}>Next — map columns</Button>
            </Stack>
          </Stack>
        ) : null}

        {step === 1 ? (
          <Stack spacing={1.5}>
            {TARGET_FIELDS.map(f => (
              <Stack key={f.key} direction="row" spacing={1.5} alignItems="center">
                <Typography sx={{ fontSize: 12.5, width: 140, flexShrink: 0 }}>{f.label}{f.required ? " *" : ""}</Typography>
                <TextField select size="small" value={mapping[f.key] ?? ""} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))} sx={{ flex: 1 }}>
                  <MenuItem value="">— not in this sheet —</MenuItem>
                  {headers.map(h => <MenuItem key={h} value={h}>{h}</MenuItem>)}
                </TextField>
              </Stack>
            ))}
            <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
              <Button size="small" onClick={() => setStep(0)} sx={{ textTransform: "none" }}>Back</Button>
              <Box sx={{ flex: 1 }} />
              <Button size="small" variant="contained" disabled={!mapping.name} onClick={() => setStep(2)} sx={{ textTransform: "none" }}>Next — preview</Button>
            </Stack>
          </Stack>
        ) : null}

        {step === 2 ? (
          <Stack spacing={1.5}>
            <Typography sx={{ fontSize: 12.5 }}>
              <b>{mapped.length}</b> cabinet(s) ready to import{mapped.some(r => r.row) ? " — rows without coordinates are laid out by row/position automatically" : ""}.
            </Typography>
            <TableContainer sx={{ maxHeight: 260, border: "1px solid", borderColor: "divider", borderRadius: "8px" }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>
                  <TableCell>Name</TableCell><TableCell>Row</TableCell><TableCell align="right">Pos</TableCell><TableCell align="right">U</TableCell><TableCell align="right">kW</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {mapped.slice(0, 12).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontSize: 12 }}>{r.name}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{r.row ?? "—"}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{r.positionInRow ?? "—"}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{r.totalU ?? "—"}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 12 }}>{r.powerKw ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {mapped.length > 12 ? <TableRow><TableCell colSpan={5} sx={{ fontSize: 11.5, color: "text.secondary" }}>…and {mapped.length - 12} more</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </TableContainer>
            <TextField size="small" label="Save this mapping as (optional)" placeholder="e.g. Cardiff rack sheet" value={mappingName} onChange={e => setMappingName(e.target.value)}
              helperText="Saved mappings make the next import of the same spreadsheet one click" />
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => setStep(1)} sx={{ textTransform: "none" }}>Back</Button>
              <Box sx={{ flex: 1 }} />
              <Button size="small" variant="contained" disabled={!mapped.length || importing} onClick={handleImport} sx={{ textTransform: "none" }}>
                {importing ? "Importing…" : `Import ${mapped.length} cabinet(s)`}
              </Button>
            </Stack>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} sx={{ textTransform: "none" }}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
