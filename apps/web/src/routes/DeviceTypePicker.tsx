import React from "react"
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, Stack, Switch, TextField, Typography
} from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import { useQuery } from "@tanstack/react-query"
import {
  DeviceType, createDeviceType, deviceTypeSpecLine, formatU, searchDeviceTypes
} from "../lib/deviceTypes"

// Device-type picker — search + browse the global catalogue, with a first-class
// manual-create path for kit that isn't in the library. Selecting a type hands it
// back to the caller (the add-asset flow), which copies its specs onto the asset.
export function DeviceTypePicker({ onSelect, onClose }: {
  onSelect: (dt: DeviceType) => void
  onClose: () => void
}) {
  const [mode, setMode] = React.useState<"browse" | "create">("browse")
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [pending, setPending] = React.useState<DeviceType | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(t)
  }, [search])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["device-types", debounced],
    queryFn: () => searchDeviceTypes(debounced || undefined),
    enabled: mode === "browse",
  })

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {mode === "browse" ? "Choose a device type" : "Create a device type"}
      </DialogTitle>

      {mode === "browse" ? (
        <>
          <DialogContent sx={{ pt: 1 }}>
            <TextField
              size="small"
              fullWidth
              autoFocus
              placeholder="Search by model or manufacturer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ fontSize: 16, color: "#94a3b8", mr: 1 }} />,
              }}
            />

            <Box sx={{ mt: 1.5, maxHeight: 320, overflowY: "auto" }}>
              {results.length === 0 && !isFetching && (
                <Typography variant="body2" sx={{ color: "#64748b", px: 0.5, py: 2 }}>
                  {debounced ? "No matching device types." : "No device types yet."}
                </Typography>
              )}
              <Stack spacing={0.5}>
                {results.map(dt => {
                  const selected = pending?.id === dt.id
                  return (
                    <Box
                      key={dt.id}
                      onClick={() => setPending(dt)}
                      sx={{
                        px: 1.25, py: 1, borderRadius: 1.5, cursor: "pointer",
                        border: "1px solid",
                        borderColor: selected ? "#1d4ed8" : "#e2e8f0",
                        bgcolor: selected ? "rgba(29,78,216,0.06)" : "transparent",
                        "&:hover": { borderColor: selected ? "#1d4ed8" : "#cbd5e1" },
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{dt.model}</Typography>
                      <Typography variant="caption" sx={{ color: "#64748b" }}>
                        {dt.manufacturer.name}
                        {deviceTypeSpecLine(dt) ? ` · ${deviceTypeSpecLine(dt)}` : ""}
                      </Typography>
                    </Box>
                  )
                })}
              </Stack>
            </Box>

            <Divider sx={{ my: 1.5 }} />
            <Button size="small" variant="text" onClick={() => setMode("create")} sx={{ textTransform: "none" }}>
              Not in the library? Create a device type
            </Button>

            {pending && (
              <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1.5, bgcolor: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <Typography variant="caption" sx={{ color: "#64748b" }}>This will auto-fill</Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {pending.manufacturer.name} {pending.model}
                  {pending.uHeight != null ? ` · ${formatU(pending.uHeight)}` : ""}
                  {pending.powerDrawW != null ? ` · ${pending.powerDrawW} W` : ""}
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} sx={{ textTransform: "none" }}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!pending}
              onClick={() => pending && onSelect(pending)}
              sx={{ textTransform: "none" }}
            >
              Use this device type
            </Button>
          </DialogActions>
        </>
      ) : (
        <CreateDeviceTypeForm
          onCancel={() => setMode("browse")}
          onCreated={onSelect}
          onFindExisting={(model) => { setSearch(model); setMode("browse") }}
        />
      )}
    </Dialog>
  )
}

// ─── Manual device-type creation (data-sheet form) ──────────────────────────

function CreateDeviceTypeForm({ onCancel, onCreated, onFindExisting }: {
  onCancel: () => void
  onCreated: (dt: DeviceType) => void
  onFindExisting: (model: string) => void
}) {
  const [manufacturer, setManufacturer] = React.useState("")
  const [model, setModel] = React.useState("")
  const [uHeight, setUHeight] = React.useState("")
  const [power, setPower] = React.useState("")
  const [fullDepth, setFullDepth] = React.useState(true)
  const [partNumber, setPartNumber] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [duplicate, setDuplicate] = React.useState(false)

  const canSave = manufacturer.trim().length > 0 && model.trim().length > 0

  async function handleCreate() {
    if (!canSave) return
    setSaving(true); setError(null); setDuplicate(false)
    try {
      const dt = await createDeviceType({
        manufacturerName: manufacturer.trim(),
        model: model.trim(),
        uHeight: uHeight ? parseFloat(uHeight) : undefined,
        powerDrawW: power ? parseFloat(power) : undefined,
        isFullDepth: fullDepth,
        partNumber: partNumber.trim() || undefined,
      })
      onCreated(dt)
    } catch (e: any) {
      const msg = Array.isArray(e?.message) ? e.message.join(", ") : (e?.message ?? "Could not create device type.")
      setError(msg)
      // The API returns a 400 with an "already exists" message on a duplicate —
      // offer to jump to the library and select the existing type instead.
      if (e?.statusCode === 400 && /already exists/i.test(String(msg))) setDuplicate(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogContent sx={{ pt: 1 }}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="caption" sx={{ color: "#64748b" }}>
            For in-house or OT kit not in any library. Use "In-house" as the manufacturer where relevant.
          </Typography>
          <Stack direction="row" spacing={2}>
            <TextField label="Manufacturer" value={manufacturer} onChange={e => setManufacturer(e.target.value)} required fullWidth autoFocus />
            <TextField label="Model" value={model} onChange={e => setModel(e.target.value)} required fullWidth />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="U height"
              type="number"
              value={uHeight}
              onChange={e => setUHeight(e.target.value)}
              inputProps={{ step: 0.5, min: 0 }}
              helperText="0.5 increments"
              fullWidth
            />
            <TextField label="Power draw (W)" type="number" value={power} onChange={e => setPower(e.target.value)} inputProps={{ min: 0 }} fullWidth />
          </Stack>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField label="Part number" value={partNumber} onChange={e => setPartNumber(e.target.value)} fullWidth />
            <FormControlLabel
              control={<Switch checked={fullDepth} onChange={e => setFullDepth(e.target.checked)} />}
              label="Full depth"
              sx={{ whiteSpace: "nowrap" }}
            />
          </Stack>
          {error && (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <Typography variant="body2" sx={{ color: "#b91c1c" }}>{error}</Typography>
              {duplicate && (
                <Button size="small" variant="text" onClick={() => onFindExisting(model.trim())} sx={{ textTransform: "none", mt: 0.5, px: 0 }}>
                  Select the existing type
                </Button>
              )}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} sx={{ textTransform: "none" }}>Back</Button>
        <Button variant="contained" disabled={saving || !canSave} onClick={handleCreate} sx={{ textTransform: "none" }}>
          {saving ? "Creating…" : "Create and select"}
        </Button>
      </DialogActions>
    </>
  )
}
