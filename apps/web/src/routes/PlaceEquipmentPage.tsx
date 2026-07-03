import React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Checkbox, Chip, FormControlLabel, MenuItem, Stack, TextField, Typography
} from "@mui/material"
import SearchIcon from "@mui/icons-material/Search"
import { api } from "../lib/api"
import { useBreadcrumb } from "./Shell"
import { useNotification } from "../components/NotificationProvider"
import { useThemeMode } from "../lib/theme"
import { hasAnyRole, ROLES } from "../lib/rbac"
import { SegmentedToggle, ToolbarButton } from "../components/shared/ListToolbar"
import CabinetElevationV2 from "../components/elevation/CabinetElevationV2"
import { DeviceTypePicker } from "./DeviceTypePicker"
import { DeviceType } from "../lib/deviceTypes"
import { FindSpaceCandidate, findSpace, kw } from "../lib/capacity"
import { Cabinet, CabinetReservation, Site, assetTypeAccent, barColor, getApiErrorMessage } from "../lib/infrastructure"

const DEFAULT_DERATE = 0.6

// Place or Reserve (DCIM_DESIGN_SPEC §6.1, Horizon 2) — asset-first placement:
// 1) WHAT — confirm the asset's identity/specs (or name the reservation); it
//    stays pinned as a summary card for the rest of the flow.
// 2) WHERE — best-fit-ranked cabinets, elevation preview, position picking.
// 3) CONFIRM — one inline click above the rack; no re-asking of details.
type Mode = "place" | "reserve"

type Draft = {
  mode: Mode
  // place mode
  assetTag: string; name: string; assetType: string
  deviceType: DeviceType | null
  raiseTask: boolean
  // reserve mode
  reserveFor: string; expiresAt: string
  // shared specs / scope
  uSize: string; budgetW: string; weightKg: string; siteId: string
}

export default function PlaceEquipmentPage() {
  const { setBreadcrumbs, setHideModuleLabel, setPageFullBleed } = useBreadcrumb()
  const { mode: themeMode } = useThemeMode()
  const { notify } = useNotification()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const canManage = hasAnyRole([ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.ADMIN, ROLES.SERVICE_MANAGER, ROLES.ENGINEER])

  React.useEffect(() => {
    setHideModuleLabel(true); setPageFullBleed(true); setBreadcrumbs([{ label: "Place equipment" }])
    return () => { setHideModuleLabel(false); setPageFullBleed(false) }
  }, [setBreadcrumbs, setHideModuleLabel, setPageFullBleed])

  const [draft, setDraft] = React.useState<Draft>({
    mode: "place",
    assetTag: "", name: "", assetType: "", deviceType: null, raiseTask: true,
    reserveFor: "", expiresAt: "",
    uSize: "2", budgetW: "", weightKg: "", siteId: params.get("siteId") ?? "",
  })
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(d => ({ ...d, [key]: value }))
  // Details are "confirmed" once a search has run; the form collapses to the
  // identity card and the flow moves to WHERE. Edit reopens it.
  const [editing, setEditing] = React.useState(true)
  const [selected, setSelected] = React.useState<FindSpaceCandidate | null>(null)
  const [proposedU, setProposedU] = React.useState<number | null>(null)
  const [saving, setSaving] = React.useState(false)

  const { data: sites = [] } = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get<Site[]>("/sites")).data })

  const search = useMutation({
    mutationFn: findSpace,
    onSuccess: (res) => { setSelected(res.candidates[0] ?? null); setProposedU(null); setEditing(false) },
    onError: (e: unknown) => notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Search failed")),
  })
  const result = search.data

  const uSizeNum = Math.max(1, parseInt(draft.uSize, 10) || 1)
  const placeU = selected ? (proposedU ?? selected.bestBlock.start) : null

  const detailsValid = draft.mode === "place"
    ? !!(draft.assetTag.trim() && draft.name.trim() && draft.assetType.trim())
    : draft.reserveFor.trim().length >= 2

  function runSearch() {
    if (!detailsValid) {
      notify.error(draft.mode === "place" ? "Confirm the asset's tag, name and type first" : "Name what the space is reserved for")
      return
    }
    search.mutate({
      uSize: uSizeNum,
      budgetW: draft.budgetW.trim() ? Number(draft.budgetW) : undefined,
      weightKg: draft.weightKg.trim() ? Number(draft.weightKg) : undefined,
      siteId: draft.siteId || undefined,
    })
  }

  // NetBox-style collection: the device type is the source of truth — picking
  // one AUTOFILLS name, type and every spec (all stay editable). The user's
  // real job is just identity: name and tag.
  function applyDeviceType(dt: DeviceType | null) {
    if (!dt) { set("deviceType", null); return }
    setDraft(d => ({
      ...d,
      deviceType: dt,
      name: `${dt.manufacturer.name} ${dt.model}`,
      assetType: dt.category ?? d.assetType,
      uSize: dt.uHeight != null ? String(Math.max(1, Math.ceil(dt.uHeight))) : d.uSize,
      // Search against the BUDGETED draw (same derate the capacity engine applies).
      budgetW: dt.powerDrawW != null ? String(Math.round(dt.powerDrawW * DEFAULT_DERATE)) : d.budgetW,
      weightKg: dt.weightKg != null ? String(dt.weightKg) : d.weightKg,
    }))
  }

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

  // ── The one-click confirm ────────────────────────────────────────────────
  async function confirm() {
    if (!selected || placeU == null) return
    setSaving(true)
    try {
      if (draft.mode === "reserve") {
        await api.post(`/sites/${selected.siteId}/cabinets/${selected.cabinetId}/reservations`, {
          uStart: placeU, uHeight: uSizeNum,
          name: draft.reserveFor.trim(),
          expiresAt: draft.expiresAt || undefined,
        })
        notify.success(`Reserved U${placeU}–${placeU + uSizeNum - 1} in ${selected.name}`)
        qc.invalidateQueries({ queryKey: ["site-cabinets"] })
        runSearch()
      } else {
        const dt = draft.deviceType
        const res = await api.post<{ id: string }>("/assets", {
          assetTag: draft.assetTag.trim(), name: draft.name.trim(), assetType: draft.assetType.trim(),
          ownerType: "CLIENT",
          siteId: selected.siteId, cabinetId: selected.cabinetId,
          uPosition: placeU, uHeight: uSizeNum, rackSide: "FRONT",
          lifecycleState: "PLANNED",
          ...(dt ? {
            deviceTypeId: dt.id, manufacturer: dt.manufacturer.name, modelNumber: dt.model,
            powerDrawW: dt.powerDrawW ?? undefined, weightKg: dt.weightKg ?? undefined,
          } : {}),
          ...(draft.budgetW.trim() && !Number.isNaN(Number(draft.budgetW)) ? { budgetedDrawW: Number(draft.budgetW) } : {}),
        })
        if (draft.raiseTask) {
          // MAC↔ITSM fusion: raise the install work order — completing it flips
          // the asset PLANNED→ACTIVE automatically (no manual status change).
          await api.post(`/assets/${res.data.id}/work-order`, {
            op: "INSTALL", workOrderType: "task",
            title: `Install ${draft.name.trim()} in ${selected.name} @ U${placeU}`,
            description: `Planned placement via capacity search — ${selected.siteName}${selected.roomName ? ` / ${selected.roomName}` : ""}, ${selected.name}, U${placeU}–${placeU + uSizeNum - 1}. Marking this task done activates the asset.`,
          }).catch(() => notify.error("Asset placed, but the install work order could not be created"))
        }
        notify.success(`${draft.name.trim()} placed (planned) at U${placeU}`)
        qc.invalidateQueries({ queryKey: ["assets"] })
        qc.invalidateQueries({ queryKey: ["site-cabinets"] })
        navigate(`/asset-register/assets/${res.data.id}`)
      }
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed")) }
    finally { setSaving(false) }
  }

  return (
    <Box sx={{ height: "100%", display: "flex", overflow: "hidden" }}>
      {/* ── Left: WHAT (details → identity card) + candidates ───────────── */}
      <Box sx={{ width: 380, flexShrink: 0, borderRight: "1px solid", borderColor: "divider", display: "flex", flexDirection: "column", minHeight: 0, bgcolor: "background.paper" }}>
        <Box sx={{ p: "14px 16px", borderBottom: "1px solid", borderColor: "divider", flexShrink: 0 }}>
          {editing ? (
            <DetailsForm
              draft={draft} set={set} sites={sites} searching={search.isPending}
              onPickDeviceType={applyDeviceType} onSearch={runSearch}
            />
          ) : (
            <IdentityCard draft={draft} mode={themeMode} uSize={uSizeNum} onEdit={() => setEditing(true)} />
          )}
        </Box>

        <Box sx={{ px: "16px", py: "8px", borderBottom: "1px solid", borderColor: "divider", flexShrink: 0, display: "flex", alignItems: "center" }}>
          <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.tertiary", flex: 1 }}>
            Where — ranked best-fit
          </Typography>
          {result ? (
            <Typography sx={{ fontSize: 10.5, color: "text.tertiary", fontVariantNumeric: "tabular-nums" }}>
              {result.matched} of {result.scanned} cabinets fit
            </Typography>
          ) : null}
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {!result ? (
            <Typography sx={{ p: "16px", fontSize: 12, color: "text.secondary" }}>
              Confirm the details above, then Find space.
            </Typography>
          ) : result.candidates.length === 0 ? (
            <Typography sx={{ p: "16px", fontSize: 12, color: "text.secondary" }}>
              No cabinet has a placeable {uSizeNum}U block within these constraints.
            </Typography>
          ) : (
            result.candidates.map((c, i) => (
              <CandidateRow key={c.cabinetId} c={c} rank={i + 1} uSize={uSizeNum} mode={themeMode}
                selected={selected?.cabinetId === c.cabinetId}
                onSelect={() => { setSelected(c); setProposedU(null) }} />
            ))
          )}
        </Box>
      </Box>

      {/* ── Right: rack preview, then a sticky confirm footer ───────────── */}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: "16px 20px" }}>
          {selected && placeU != null && !editing ? (
            <PlacementPreview
              draft={draft} candidate={selected} uSize={uSizeNum} placeU={placeU}
              onProposeU={proposeU}
            />
          ) : (
            <Typography sx={{ fontSize: 12.5, color: "text.secondary", p: 2 }}>
              {editing && result ? "Details reopened — re-run Find space to refresh the candidates." :
                result ? "Select a candidate to preview the placement." : ""}
            </Typography>
          )}
        </Box>

        {selected && placeU != null && !editing ? (
          <Box sx={{
            flexShrink: 0, borderTop: "1px solid", borderColor: "divider", bgcolor: "background.paper",
            px: "20px", py: "12px", display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
          }}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                {draft.mode === "place" ? (draft.name || "Asset") : `Reserve — ${draft.reserveFor}`}
                <Box component="span" sx={{ color: "text.tertiary", fontWeight: 500, mx: "8px" }}>→</Box>
                {selected.name} · U{placeU}–{placeU + uSizeNum - 1}
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
                {selected.siteName}{selected.roomName ? ` / ${selected.roomName}` : ""}
                {draft.mode === "place" ? " · created as Planned until installed" : draft.expiresAt ? ` · expires ${draft.expiresAt}` : " · no expiry"}
              </Typography>
            </Box>
            {draft.mode === "place" ? (
              <FormControlLabel
                control={<Checkbox size="small" checked={draft.raiseTask} onChange={e => set("raiseTask", e.target.checked)} />}
                label={<Typography sx={{ fontSize: 12 }}>Raise install task</Typography>}
                sx={{ mr: 0 }}
              />
            ) : null}
            {canManage ? (
              <ToolbarButton variant="primary" onClick={confirm} disabled={saving} sx={{ px: "18px", py: "7px", fontSize: 12.5 }}>
                {saving ? "Saving…" : draft.mode === "place" ? "Confirm placement" : "Confirm reservation"}
              </ToolbarButton>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

// ── Step 1: the details form ─────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "text.tertiary" }}>
      {children}
    </Typography>
  )
}

function DetailsForm({ draft, set, sites, searching, onPickDeviceType, onSearch }: {
  draft: Draft
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void
  sites: Site[]
  searching: boolean
  onPickDeviceType: (dt: DeviceType | null) => void
  onSearch: () => void
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const dt = draft.deviceType
  return (
    <Stack spacing={1.75}>
      <SegmentedToggle
        options={[{ value: "place", label: "Place an asset" }, { value: "reserve", label: "Reserve space" }]}
        value={draft.mode} onChange={v => set("mode", v)}
      />

      {draft.mode === "place" ? (
        <>
          {/* Device type leads (NetBox model): picking it fills everything below. */}
          <Stack spacing={0.75}>
            <SectionLabel>Device type</SectionLabel>
            {dt ? (
              <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: "9px 11px", bgcolor: "background.default", display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {dt.manufacturer.name} {dt.model}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                    {dt.uHeight != null ? `${dt.uHeight}U` : "?U"}
                    {dt.powerDrawW != null ? ` · ${dt.powerDrawW} W nameplate` : ""}
                    {dt.weightKg != null ? ` · ${dt.weightKg} kg` : ""}
                  </Typography>
                </Box>
                <Button size="small" onClick={() => setPickerOpen(true)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0, px: "6px", color: "primary.main" }}>Change</Button>
                <Button size="small" onClick={() => onPickDeviceType(null)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0, px: "4px", color: "text.secondary" }}>✕</Button>
              </Box>
            ) : (
              <ToolbarButton onClick={() => setPickerOpen(true)} sx={{ justifyContent: "center", py: "7px" }}>
                Choose from catalogue…
              </ToolbarButton>
            )}
            {!dt ? (
              <Typography sx={{ fontSize: 10.5, color: "text.tertiary" }}>
                Picking a type fills the specs below — or enter them by hand.
              </Typography>
            ) : null}
          </Stack>

          {/* Identity — the user's actual job. */}
          <Stack spacing={1}>
            <SectionLabel>Identity</SectionLabel>
            <TextField size="small" label="Name" value={draft.name} onChange={e => set("name", e.target.value)}
              helperText={dt ? "Autofilled from the type — rename to suit (e.g. add -01)" : undefined} />
            <TextField size="small" label="Asset tag / ID" value={draft.assetTag} onChange={e => set("assetTag", e.target.value)} />
            <TextField size="small" label="Type" placeholder="e.g. SERVER" value={draft.assetType} onChange={e => set("assetType", e.target.value)}
              helperText={dt ? "Autofilled from the type's category" : undefined} />
          </Stack>

          {/* Specs — catalogue-known, editable. */}
          <Stack spacing={1}>
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <SectionLabel>Specifications</SectionLabel>
              {dt ? <Typography sx={{ fontSize: 10, color: "text.tertiary" }}>from catalogue — editable</Typography> : null}
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="U size" type="number" value={draft.uSize} onChange={e => set("uSize", e.target.value)}
                inputProps={{ min: 1, max: 60 }} sx={{ width: 84 }} />
              <TextField size="small" label="Power (W)" type="number" value={draft.budgetW} onChange={e => set("budgetW", e.target.value)}
                inputProps={{ min: 0 }} sx={{ flex: 1 }} helperText={dt?.powerDrawW != null ? "budgeted (60% of nameplate)" : undefined} />
              <TextField size="small" label="Weight (kg)" type="number" value={draft.weightKg} onChange={e => set("weightKg", e.target.value)}
                inputProps={{ min: 0 }} sx={{ flex: 1 }} />
            </Stack>
          </Stack>
        </>
      ) : (
        <>
          <Stack spacing={1}>
            <SectionLabel>Reservation</SectionLabel>
            <TextField size="small" label="Reserved for" placeholder="e.g. Project Helix — new SAN" value={draft.reserveFor} onChange={e => set("reserveFor", e.target.value)} />
            <TextField size="small" label="Expires" type="date" value={draft.expiresAt} onChange={e => set("expiresAt", e.target.value)}
              InputLabelProps={{ shrink: true }} helperText="Blank = no expiry" />
          </Stack>
          <Stack spacing={1}>
            <SectionLabel>Space needed</SectionLabel>
            <Stack direction="row" spacing={1}>
              <TextField size="small" label="U size" type="number" value={draft.uSize} onChange={e => set("uSize", e.target.value)}
                inputProps={{ min: 1, max: 60 }} sx={{ width: 84 }} />
              <TextField size="small" label="Power (W)" type="number" value={draft.budgetW} onChange={e => set("budgetW", e.target.value)}
                inputProps={{ min: 0 }} sx={{ flex: 1 }} />
              <TextField size="small" label="Weight (kg)" type="number" value={draft.weightKg} onChange={e => set("weightKg", e.target.value)}
                inputProps={{ min: 0 }} sx={{ flex: 1 }} />
            </Stack>
          </Stack>
        </>
      )}

      <Stack spacing={1}>
        <SectionLabel>Search scope</SectionLabel>
        <TextField select size="small" label="Site" value={draft.siteId} onChange={e => set("siteId", e.target.value)}>
          <MenuItem value="">All sites</MenuItem>
          {sites.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
      </Stack>

      <ToolbarButton variant="primary" onClick={onSearch} disabled={searching}
        startIcon={<SearchIcon sx={{ fontSize: "15px !important" }} />} sx={{ justifyContent: "center", py: "6px" }}>
        {searching ? "Searching…" : "Find space"}
      </ToolbarButton>

      {pickerOpen ? <DeviceTypePicker onSelect={dt2 => { onPickDeviceType(dt2); setPickerOpen(false) }} onClose={() => setPickerOpen(false)} /> : null}
    </Stack>
  )
}

// ── The pinned identity card (what you're placing) ───────────────────────────
function IdentityCard({ draft, mode, uSize, onEdit }: {
  draft: Draft; mode: "light" | "dark"; uSize: number; onEdit: () => void
}) {
  const isPlace = draft.mode === "place"
  const accent = assetTypeAccent(isPlace ? draft.assetType : "patch", mode)
  const specs = [
    `${uSize}U`,
    draft.budgetW.trim() ? `${draft.budgetW} W` : null,
    draft.weightKg.trim() ? `${draft.weightKg} kg` : null,
  ].filter(Boolean).join(" · ")
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "10px", borderLeft: `3px solid ${accent.fg}`, p: "12px 14px", bgcolor: "background.default" }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.tertiary", flex: 1 }}>
          {isPlace ? "Placing" : "Reserving for"}
        </Typography>
        <Button size="small" onClick={onEdit} sx={{ textTransform: "none", fontSize: 11, minWidth: 0, px: "6px", color: "primary.main" }}>Edit</Button>
      </Stack>
      <Typography sx={{ fontSize: 14, fontWeight: 700, mt: "2px" }}>
        {isPlace ? draft.name : draft.reserveFor}
      </Typography>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: "4px", flexWrap: "wrap" }}>
        {isPlace ? (
          <>
            <Box sx={{ fontSize: 10.5, fontWeight: 600, px: "7px", py: "1px", borderRadius: "6px", bgcolor: accent.bg, color: accent.fg }}>{draft.assetType}</Box>
            <Typography sx={{ fontSize: 11, fontFamily: "monospace", color: "text.secondary" }}>{draft.assetTag}</Typography>
          </>
        ) : (
          draft.expiresAt ? <Typography sx={{ fontSize: 11, color: "text.secondary" }}>expires {draft.expiresAt}</Typography> : null
        )}
        <Typography sx={{ fontSize: 11, color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>{specs}</Typography>
      </Stack>
      {isPlace && draft.deviceType ? (
        <Typography sx={{ fontSize: 10.5, color: "text.tertiary", mt: "3px" }}>
          {draft.deviceType.manufacturer.name} {draft.deviceType.model} (catalogue)
        </Typography>
      ) : null}
    </Box>
  )
}

// ── One ranked candidate ─────────────────────────────────────────────────────
function CandidateRow({ c, rank, uSize, mode, selected, onSelect }: {
  c: FindSpaceCandidate; rank: number; uSize: number; mode: "light" | "dark"; selected: boolean; onSelect: () => void
}) {
  const powerUnknown = c.fits.power === null
  return (
    <Box onClick={onSelect} sx={{
      px: "16px", py: "10px", borderBottom: "1px solid", borderColor: "divider", cursor: "pointer",
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
      <Stack direction="row" spacing={1.5} sx={{ ml: "26px", mt: "4px", flexWrap: "wrap", alignItems: "center" }}>
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
      </Stack>
    </Box>
  )
}

// ── Step 2: rack preview + position picker (confirm lives in the footer) ─────
function PlacementPreview({ draft, candidate, uSize, placeU, onProposeU }: {
  draft: Draft; candidate: FindSpaceCandidate; uSize: number; placeU: number
  onProposeU: (u: number) => void
}) {
  const isPlace = draft.mode === "place"
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
      name: isPlace ? `Placing — ${draft.name}` : `Reserving — ${draft.reserveFor}`,
      notes: null, expiresAt: null, createdAt: new Date().toISOString(),
    }
    return { ...cabinet, reservations: [...(cabinet.reservations ?? []), proposal] }
  }, [cabinet, placeU, uSize, isPlace, draft.name, draft.reserveFor])

  return (
    <Box>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: "10px" }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{candidate.name}</Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          {candidate.siteName}{candidate.roomName ? ` · ${candidate.roomName}` : ""}
        </Typography>
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
