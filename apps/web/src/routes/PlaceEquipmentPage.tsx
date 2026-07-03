import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Stack, TextField, Typography
} from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import { api } from "../lib/api"
import { useBreadcrumb } from "./Shell"
import { useNotification } from "../components/NotificationProvider"
import { useThemeMode } from "../lib/theme"
import { hasAnyRole, ROLES } from "../lib/rbac"
import { ListToolbar, ToolbarButton } from "../components/shared/ListToolbar"
import CabinetElevationV2 from "../components/elevation/CabinetElevationV2"
import { DeviceTypePicker } from "./DeviceTypePicker"
import { DeviceType } from "../lib/deviceTypes"
import { FindSpaceCandidate, findSpace, kw } from "../lib/capacity"
import { Cabinet, CabinetReservation, Site, barColor, getApiErrorMessage } from "../lib/infrastructure"

const DEFAULT_DERATE = 0.6

// Place or Reserve (DCIM_DESIGN_SPEC §6.1, Horizon 2) — the capacity-search
// placement workflow: constraints in → best-fit-ranked candidate cabinets →
// elevation preview of the proposed block → create a PLANNED asset (optionally
// raising a linked install Task — the first MAC↔ITSM stitch) or reserve the
// range. All writes go through the existing assets / reservations / tasks APIs.
export default function PlaceEquipmentPage() {
  const { setBreadcrumbs, setHideModuleLabel, setPageFullBleed } = useBreadcrumb()
  const { mode } = useThemeMode()
  const { notify } = useNotification()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const canManage = hasAnyRole([ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.ADMIN, ROLES.SERVICE_MANAGER, ROLES.ENGINEER])

  React.useEffect(() => {
    setHideModuleLabel(true); setPageFullBleed(true); setBreadcrumbs([{ label: "Place equipment" }])
    return () => { setHideModuleLabel(false); setPageFullBleed(false) }
  }, [setBreadcrumbs, setHideModuleLabel, setPageFullBleed])

  // ── Constraints ─────────────────────────────────────────────────────────
  const [uSize, setUSize] = React.useState("2")
  const [budgetW, setBudgetW] = React.useState("")
  const [weightKg, setWeightKg] = React.useState("")
  const [siteId, setSiteId] = React.useState<string>(params.get("siteId") ?? "")
  const [deviceType, setDeviceType] = React.useState<DeviceType | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<FindSpaceCandidate | null>(null)
  // Chosen start U within the selected candidate; null = the best-fit default.
  const [proposedU, setProposedU] = React.useState<number | null>(null)
  const [action, setAction] = React.useState<"place" | "reserve" | null>(null)

  const { data: sites = [] } = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get<Site[]>("/sites")).data })

  const search = useMutation({
    mutationFn: findSpace,
    onSuccess: (res) => { setSelected(res.candidates[0] ?? null); setProposedU(null) },
    onError: (e: unknown) => notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Search failed")),
  })

  const uSizeNum = Math.max(1, parseInt(uSize, 10) || 1)
  // The effective placement position: user-chosen, else the best-fit default.
  const placeU = selected ? (proposedU ?? selected.bestBlock.start) : null

  // A start U is valid when [u, u+uSize) sits inside one placeable block; a
  // click anywhere in a big-enough block snaps so the kit still fits.
  const snapToBlocks = React.useCallback((u: number): number | null => {
    if (!selected) return null
    const block = selected.blocks.find(b => u >= b.start && u <= b.start + b.size - 1)
    if (!block || block.size < uSizeNum) return null
    return Math.min(u, block.start + block.size - uSizeNum)
  }, [selected, uSizeNum])

  const proposeU = React.useCallback((u: number) => {
    const snapped = snapToBlocks(u)
    if (snapped == null) { notify.error(`No room for ${uSizeNum}U at U${u}`); return }
    setProposedU(snapped)
  }, [snapToBlocks, uSizeNum, notify])

  function runSearch() {
    const u = Math.max(1, parseInt(uSize, 10) || 1)
    const w = budgetW.trim() ? Number(budgetW) : undefined
    const kg = weightKg.trim() ? Number(weightKg) : undefined
    search.mutate({ uSize: u, budgetW: w, weightKg: kg, siteId: siteId || undefined })
  }

  function applyDeviceType(dt: DeviceType) {
    setDeviceType(dt)
    if (dt.uHeight != null) setUSize(String(Math.max(1, Math.ceil(dt.uHeight))))
    // Search against the BUDGETED draw (the same derate the capacity engine
    // applies once the asset is placed), not raw nameplate.
    if (dt.powerDrawW != null) setBudgetW(String(Math.round(dt.powerDrawW * DEFAULT_DERATE)))
    if (dt.weightKg != null) setWeightKg(String(dt.weightKg))
    setPickerOpen(false)
  }

  const result = search.data

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Constraints toolbar ─────────────────────────────────────────── */}
      <ListToolbar>
        <TextField size="small" label="U size" type="number" value={uSize} onChange={e => setUSize(e.target.value)}
          inputProps={{ min: 1, max: 60 }} sx={{ width: 90 }} />
        <TextField size="small" label="Power (W)" type="number" value={budgetW} onChange={e => setBudgetW(e.target.value)}
          inputProps={{ min: 0 }} sx={{ width: 110 }} />
        <TextField size="small" label="Weight (kg)" type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)}
          inputProps={{ min: 0 }} sx={{ width: 110 }} />
        <TextField select size="small" label="Site" value={siteId} onChange={e => setSiteId(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">All sites</MenuItem>
          {sites.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <ToolbarButton onClick={() => setPickerOpen(true)}>
          {deviceType ? `${deviceType.manufacturer.name} ${deviceType.model}` : "From catalogue…"}
        </ToolbarButton>
        {deviceType ? (
          <Button size="small" onClick={() => setDeviceType(null)} sx={{ textTransform: "none", fontSize: 11.5, minWidth: 0, px: "6px", color: "text.secondary" }}>✕</Button>
        ) : null}
        <ToolbarButton variant="primary" onClick={runSearch} disabled={search.isPending}
          startIcon={<SearchIcon sx={{ fontSize: "15px !important" }} />}>
          {search.isPending ? "Searching…" : "Find space"}
        </ToolbarButton>
        {result ? (
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", ml: 1 }}>
            {result.matched} of {result.scanned} cabinets fit
          </Typography>
        ) : null}
      </ListToolbar>

      {/* ── Results + preview ───────────────────────────────────────────── */}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        <Box sx={{ width: 400, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", overflowY: "auto", bgcolor: "background.paper" }}>
          {!result ? (
            <Typography sx={{ p: "20px", fontSize: 12.5, color: "text.secondary" }}>
              Set the space the kit needs (or pick it from the catalogue) and run Find space —
              cabinets are ranked best-fit: the tightest block that takes it, with power headroom.
            </Typography>
          ) : result.candidates.length === 0 ? (
            <Typography sx={{ p: "20px", fontSize: 12.5, color: "text.secondary" }}>
              No cabinet has a placeable {uSizeNum}U block within these constraints.
            </Typography>
          ) : (
            result.candidates.map((c, i) => (
              <CandidateRow key={c.cabinetId} c={c} rank={i + 1} uSize={uSizeNum} mode={mode}
                selected={selected?.cabinetId === c.cabinetId}
                onSelect={() => { setSelected(c); setProposedU(null) }} />
            ))
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, overflowY: "auto", p: "16px 20px" }}>
          {selected && placeU != null ? (
            <PlacementPreview
              candidate={selected} uSize={uSizeNum} canManage={canManage}
              placeU={placeU} onProposeU={proposeU}
              onReserve={() => setAction("reserve")} onPlace={() => setAction("place")}
            />
          ) : (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", p: 2 }}>
              {result ? "Select a candidate to preview the placement." : ""}
            </Typography>
          )}
        </Box>
      </Box>

      {pickerOpen ? <DeviceTypePicker onSelect={applyDeviceType} onClose={() => setPickerOpen(false)} /> : null}
      {action === "reserve" && selected && placeU != null ? (
        <ReserveDialog candidate={selected} uSize={uSizeNum} placeU={placeU}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); qc.invalidateQueries({ queryKey: ["site-cabinets"] }); runSearch(); notify.success("Range reserved") }} />
      ) : null}
      {action === "place" && selected && placeU != null ? (
        <PlaceDialog candidate={selected} uSize={uSizeNum} placeU={placeU} deviceType={deviceType} budgetW={budgetW}
          onClose={() => setAction(null)}
          onDone={(assetId) => { setAction(null); qc.invalidateQueries({ queryKey: ["assets"] }); qc.invalidateQueries({ queryKey: ["site-cabinets"] }); navigate(`/asset-register/assets/${assetId}`) }} />
      ) : null}
    </Box>
  )
}

// ── One ranked candidate ─────────────────────────────────────────────────────
function CandidateRow({ c, rank, uSize, mode, selected, onSelect }: {
  c: FindSpaceCandidate; rank: number; uSize: number; mode: "light" | "dark"; selected: boolean; onSelect: () => void
}) {
  const powerUnknown = c.fits.power === null
  const weightUnknown = c.weight.capacityKg == null && c.fits.weight === null
  return (
    <Box onClick={onSelect} sx={{
      px: "16px", py: "11px", borderBottom: "1px solid", borderColor: "divider", cursor: "pointer",
      bgcolor: selected ? (mode === "dark" ? "rgba(59,130,246,.1)" : "rgba(29,78,216,.06)") : "transparent",
      borderLeft: "2px solid", borderLeftColor: selected ? "primary.main" : "transparent",
      "&:hover": { bgcolor: mode === "dark" ? "rgba(59,130,246,.07)" : "rgba(29,78,216,.04)" },
    }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.tertiary", width: 18, fontVariantNumeric: "tabular-nums" }}>{rank}</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</Typography>
        <Chip size="small" label={`U${c.bestBlock.start}–${c.bestBlock.start + uSize - 1}`}
          sx={{ height: 18, fontSize: 10.5, fontWeight: 700, fontFamily: "monospace", bgcolor: mode === "dark" ? "#13351f" : "#dcfce7", color: mode === "dark" ? "#6ee7b7" : "#15803d" }} />
      </Stack>
      <Typography sx={{ fontSize: 11, color: "text.secondary", ml: "26px", mt: "1px" }}>
        {c.siteName}{c.roomName ? ` · ${c.roomName}` : ""}
      </Typography>
      <Stack direction="row" spacing={1.5} sx={{ ml: "26px", mt: "5px", flexWrap: "wrap", alignItems: "center" }}>
        <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
          block {c.bestBlock.size}U{c.waste > 0 ? ` (+${c.waste}U spare)` : " (exact fit)"} · {c.freeU}U free
        </Typography>
        {c.power.headroomW != null ? (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: mode === "dark" ? "rgba(148,163,184,.16)" : "rgba(100,116,139,.15)", overflow: "hidden" }}>
              <Box sx={{ width: `${Math.min(100, c.power.pct ?? 0)}%`, height: "100%", bgcolor: barColor(c.power.pct ?? 0, mode) }} />
            </Box>
            <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              {kw(c.power.headroomW / 1000)} headroom
            </Typography>
          </Stack>
        ) : null}
        {powerUnknown ? <Chip size="small" label="power unknown" sx={{ height: 16, fontSize: 9, bgcolor: mode === "dark" ? "#3a2c0f" : "#fef3c7", color: mode === "dark" ? "#fcd34d" : "#92400e" }} /> : null}
        {weightUnknown ? <Chip size="small" label="weight unknown" sx={{ height: 16, fontSize: 9, bgcolor: mode === "dark" ? "#3a2c0f" : "#fef3c7", color: mode === "dark" ? "#fcd34d" : "#92400e" }} /> : null}
      </Stack>
    </Box>
  )
}

// ── Elevation preview with the proposed block injected as a reservation ─────
function PlacementPreview({ candidate, uSize, placeU, canManage, onProposeU, onReserve, onPlace }: {
  candidate: FindSpaceCandidate; uSize: number; placeU: number; canManage: boolean
  onProposeU: (u: number) => void; onReserve: () => void; onPlace: () => void
}) {
  const { data: cabinets = [], isLoading } = useQuery({
    queryKey: ["site-cabinets", candidate.siteId],
    queryFn: async () => (await api.get<Cabinet[]>(`/sites/${candidate.siteId}/cabinets`)).data,
  })
  const cabinet = cabinets.find(c => c.id === candidate.cabinetId)

  // The proposed range rides in as a synthetic reservation — the elevation
  // already knows how to draw reservation blocks, so the preview is free.
  const previewCabinet = React.useMemo<Cabinet | null>(() => {
    if (!cabinet) return null
    const proposal: CabinetReservation = {
      id: "__proposal", cabinetId: cabinet.id,
      uStart: placeU, uHeight: uSize, rackSide: null,
      name: "Proposed placement", notes: null, expiresAt: null, createdAt: new Date().toISOString(),
    }
    return { ...cabinet, reservations: [...(cabinet.reservations ?? []), proposal] }
  }, [cabinet, placeU, uSize])

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: "10px", flexWrap: "wrap" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{candidate.name}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          placing at U{placeU}–{placeU + uSize - 1} ({uSize}U)
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canManage ? (
          <>
            <ToolbarButton onClick={onReserve}>Reserve range</ToolbarButton>
            <ToolbarButton variant="primary" onClick={onPlace}>Place planned asset</ToolbarButton>
          </>
        ) : null}
      </Stack>

      {/* Position picker: exact U, per-block quick-picks, or click the rack. */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: "12px", flexWrap: "wrap" }}>
        <TextField size="small" label="Place at U" type="number" value={placeU}
          onChange={e => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) onProposeU(v) }}
          inputProps={{ min: 1, max: candidate.totalU }} sx={{ width: 100 }} />
        {candidate.blocks.map(b => {
          const active = placeU >= b.start && placeU + uSize - 1 <= b.start + b.size - 1
          return (
            <Chip key={b.start} size="small" onClick={() => onProposeU(b.start)}
              label={`U${b.start}–${b.start + b.size - 1}`}
              sx={{
                height: 20, fontSize: 10.5, fontFamily: "monospace", fontWeight: 600, cursor: "pointer",
                bgcolor: active ? "rgba(29,78,216,0.12)" : "transparent",
                color: active ? "primary.main" : "text.secondary",
                border: "1px solid", borderColor: active ? "rgba(29,78,216,0.4)" : "divider",
              }} />
          )
        })}
        <Typography sx={{ fontSize: 11, color: "text.tertiary" }}>or click a free slot in the rack</Typography>
      </Stack>

      {isLoading ? (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Loading elevation…</Typography>
      ) : previewCabinet ? (
        <Box sx={{ maxWidth: 560 }}>
          <CabinetElevationV2
            cabinet={previewCabinet} sides="FRONT"
            selectedAssetId={null} onSelectAsset={() => {}}
            canManage
            onAddAssetAt={(u) => onProposeU(u)}
          />
        </Box>
      ) : (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Cabinet not found.</Typography>
      )}
    </Box>
  )
}

// ── Reserve the proposed range ───────────────────────────────────────────────
function ReserveDialog({ candidate, uSize, placeU, onClose, onDone }: {
  candidate: FindSpaceCandidate; uSize: number; placeU: number; onClose: () => void; onDone: () => void
}) {
  const { notify } = useNotification()
  const [name, setName] = React.useState("")
  const [expiresAt, setExpiresAt] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  async function save() {
    if (name.trim().length < 2) { notify.error("Give the reservation a name"); return }
    setSaving(true)
    try {
      await api.post(`/sites/${candidate.siteId}/cabinets/${candidate.cabinetId}/reservations`, {
        uStart: placeU, uHeight: uSize,
        name: name.trim(),
        expiresAt: expiresAt || undefined,
      })
      onDone()
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to reserve")) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Reserve U{placeU}–{placeU + uSize - 1} in {candidate.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField autoFocus size="small" label="Reserved for" placeholder="e.g. Project Helix — new SAN" value={name} onChange={e => setName(e.target.value)} />
          <TextField size="small" label="Expires" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
            InputLabelProps={{ shrink: true }} helperText="Blank = no expiry" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving} sx={{ textTransform: "none" }}>Reserve</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Place a PLANNED asset at the proposed block ──────────────────────────────
function PlaceDialog({ candidate, uSize, placeU, deviceType, budgetW, onClose, onDone }: {
  candidate: FindSpaceCandidate; uSize: number; placeU: number; deviceType: DeviceType | null; budgetW: string
  onClose: () => void; onDone: (assetId: string) => void
}) {
  const { notify } = useNotification()
  const [assetTag, setAssetTag] = React.useState("")
  const [name, setName] = React.useState(deviceType ? `${deviceType.manufacturer.name} ${deviceType.model}` : "")
  const [assetType, setAssetType] = React.useState(deviceType?.category ?? "")
  const [raiseTask, setRaiseTask] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  async function save() {
    if (!assetTag.trim() || !name.trim() || !assetType.trim()) { notify.error("Tag, name and type are required"); return }
    setSaving(true)
    try {
      const res = await api.post<{ id: string }>("/assets", {
        assetTag: assetTag.trim(), name: name.trim(), assetType: assetType.trim(),
        ownerType: "CLIENT",
        siteId: candidate.siteId, cabinetId: candidate.cabinetId,
        uPosition: placeU, uHeight: uSize, rackSide: "FRONT",
        lifecycleState: "PLANNED",
        ...(deviceType ? {
          deviceTypeId: deviceType.id,
          manufacturer: deviceType.manufacturer.name, modelNumber: deviceType.model,
          powerDrawW: deviceType.powerDrawW ?? undefined, weightKg: deviceType.weightKg ?? undefined,
        } : {}),
        ...(budgetW.trim() && !Number.isNaN(Number(budgetW)) ? { budgetedDrawW: Number(budgetW) } : {}),
      })
      if (raiseTask) {
        // MAC↔ITSM stitch: the install work order rides the generic parent-
        // context pointer, so it shows on the asset's Linked records tab.
        await api.post("/tasks", {
          title: `Install ${name.trim()} in ${candidate.name} @ U${placeU}`,
          description: `Planned placement via capacity search — ${candidate.siteName}${candidate.roomName ? ` / ${candidate.roomName}` : ""}, ${candidate.name}, U${placeU}–${placeU + uSize - 1}. Set the asset ACTIVE once installed.`,
          linkedEntityType: "Asset", linkedEntityId: res.data.id,
        }).catch(() => notify.error("Asset placed, but the install task could not be created"))
      }
      notify.success(`Planned asset placed at U${placeU}`)
      onDone(res.data.id)
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to place asset")) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Place planned asset — {candidate.name} @ U{placeU}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField autoFocus size="small" label="Asset tag" value={assetTag} onChange={e => setAssetTag(e.target.value)} />
          <TextField size="small" label="Name" value={name} onChange={e => setName(e.target.value)} />
          <TextField size="small" label="Type" placeholder="e.g. SERVER" value={assetType} onChange={e => setAssetType(e.target.value)} />
          <FormControlLabel
            control={<Checkbox size="small" checked={raiseTask} onChange={e => setRaiseTask(e.target.checked)} />}
            label={<Typography sx={{ fontSize: 12.5 }}>Raise a linked install task</Typography>}
          />
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
            The asset is created as <b>Planned</b> — it occupies the slot in the elevation as a shadow
            until the install completes and it's set Active.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving} sx={{ textTransform: "none" }}>Place asset</Button>
      </DialogActions>
    </Dialog>
  )
}
