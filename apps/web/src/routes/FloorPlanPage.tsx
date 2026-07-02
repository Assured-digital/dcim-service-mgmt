import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Chip, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography
} from "@mui/material"
import { api } from "../lib/api"
import { useBreadcrumb } from "./Shell"
import { useNotification } from "../components/NotificationProvider"
import { useThemeMode } from "../lib/theme"
import { hasAnyRole, ROLES } from "../lib/rbac"
import { getApiErrorMessage } from "../lib/infrastructure"
import { kw, pctColor } from "../lib/capacity"
import {
  FloorCabinet, FloorLens, createFloorObject, deleteFloorObject,
  getFloorPlan, placeCabinet,
} from "../lib/floorPlan"
import { FloorCanvas } from "../components/floorplan/FloorCanvas"
import { CsvImportDialog, RoomSetupDialog } from "../components/floorplan/FloorPlanSetup"

type Site = { id: string; name: string }
type Room = { id: string; name: string }
type Placing = { kind: "cabinet"; id: string } | { kind: "object"; objectType: string } | null

// Floor plan hero (DCIM_DESIGN_BRIEF §2/§6). The room as an architectural plan:
// cabinets on true positions coloured by a Space/Power/Status lens, click →
// panel → elevation. Edit mode: click-to-place/move (matching the elevation's
// click-to-move idiom), rotate, return-to-tray, place CRAC/UPS. Find-space
// highlights cabinets with enough contiguous free U.
export default function FloorPlanPage() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const { mode } = useThemeMode()
  const { setBreadcrumbs, setHideModuleLabel, setPageFullBleed } = useBreadcrumb()
  const canEdit = hasAnyRole([ROLES.ORG_OWNER, ROLES.ORG_ADMIN, ROLES.ADMIN, ROLES.SERVICE_MANAGER, ROLES.ENGINEER])

  const [siteId, setSiteId] = React.useState<string | null>(null)
  const [roomId, setRoomId] = React.useState<string | null>(null)
  const [lens, setLens] = React.useState<FloorLens>("space")
  const [edit, setEdit] = React.useState(false)
  const [selectedCabinetId, setSelectedCabinetId] = React.useState<string | null>(null)
  const [placing, setPlacing] = React.useState<Placing>(null)
  const [findSpace, setFindSpace] = React.useState(false)
  const [setupOpen, setSetupOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)

  React.useEffect(() => {
    setHideModuleLabel(true); setPageFullBleed(true); setBreadcrumbs([{ label: "Floor plan" }])
    return () => { setHideModuleLabel(false); setPageFullBleed(false) }
  }, [setBreadcrumbs, setHideModuleLabel, setPageFullBleed])

  const { data: sites = [] } = useQuery({ queryKey: ["sites"], queryFn: async () => (await api.get<Site[]>("/sites")).data })
  React.useEffect(() => { if (!siteId && sites.length) setSiteId(sites[0].id) }, [sites, siteId])

  const { data: rooms = [] } = useQuery({
    queryKey: ["site-rooms", siteId], enabled: !!siteId,
    queryFn: async () => (await api.get<Room[]>(`/sites/${siteId}/rooms`)).data,
  })
  React.useEffect(() => { setRoomId(rooms.length ? rooms[0].id : null) }, [rooms])

  const { data: plan } = useQuery({ queryKey: ["floor-plan", roomId], enabled: !!roomId, queryFn: () => getFloorPlan(roomId!) })
  const refresh = () => qc.invalidateQueries({ queryKey: ["floor-plan", roomId] })

  const selectedCabinet = plan?.cabinets.find(c => c.id === selectedCabinetId) ?? null

  async function handleCellClick(x: number, y: number) {
    if (!placing || !roomId) return
    try {
      if (placing.kind === "cabinet") {
        await placeCabinet(placing.id, { posX: x, posY: y })
        notify.success("Cabinet placed")
      } else {
        await createFloorObject(roomId, { objectType: placing.objectType, posX: x, posY: y, label: placing.objectType })
        notify.success(`${placing.objectType} placed`)
      }
      setPlacing(null); refresh()
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Placement failed")) }
  }

  async function rotate(c: FloorCabinet) {
    try { await placeCabinet(c.id, { orientation: (c.orientation + 90) % 360 }); refresh() }
    catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Rotate failed")) }
  }
  async function returnToTray(c: FloorCabinet) {
    try { await placeCabinet(c.id, { posX: null, posY: null }); setSelectedCabinetId(null); refresh(); notify.success("Returned to tray") }
    catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed")) }
  }

  const railBg = mode === "dark" ? "#111c30" : "#ffffff"

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Controls */}
      <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper", display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", flexShrink: 0 }}>
        <TextField select size="small" label="Site" value={siteId ?? ""} onChange={e => { setSiteId(e.target.value); setSelectedCabinetId(null) }} sx={{ minWidth: 170 }}>
          {sites.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Room" value={roomId ?? ""} onChange={e => { setRoomId(e.target.value); setSelectedCabinetId(null) }} sx={{ minWidth: 150 }} disabled={!rooms.length}>
          {rooms.map(r => <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>)}
          {!rooms.length ? <MenuItem value="">No rooms</MenuItem> : null}
        </TextField>
        <ToggleButtonGroup size="small" exclusive value={lens} onChange={(_, v) => v && setLens(v)}>
          <ToggleButton value="space" sx={{ textTransform: "none", px: 1.5 }}>Space</ToggleButton>
          <ToggleButton value="power" sx={{ textTransform: "none", px: 1.5 }}>Power</ToggleButton>
          <ToggleButton value="status" sx={{ textTransform: "none", px: 1.5 }}>Status</ToggleButton>
        </ToggleButtonGroup>
        <Button size="small" variant={findSpace ? "contained" : "outlined"} onClick={() => setFindSpace(f => !f)} sx={{ textTransform: "none" }}>Find space (≥10U)</Button>
        <Box sx={{ flex: 1 }} />
        <LensLegend lens={lens} mode={mode} />
        {canEdit ? <Button size="small" variant={edit ? "contained" : "outlined"} onClick={() => { setEdit(e => !e); setPlacing(null) }} sx={{ textTransform: "none" }}>{edit ? "Done" : "Edit layout"}</Button> : null}
      </Box>

      {placing ? (
        <Box sx={{ px: 2, py: 0.75, bgcolor: mode === "dark" ? "#172033" : "#eff6ff", borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
          <Typography sx={{ fontSize: 12.5 }}>Click a grid cell to place <b>{placing.kind === "cabinet" ? "the cabinet" : placing.objectType}</b></Typography>
          <Button size="small" onClick={() => setPlacing(null)} sx={{ textTransform: "none", ml: "auto" }}>Cancel</Button>
        </Box>
      ) : null}

      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Canvas */}
        <Box sx={{ flex: 1, overflow: "auto", bgcolor: "background.default" }}>
          {plan ? (
            <FloorCanvas plan={plan} lens={lens} mode={edit ? "edit" : "view"} selectedCabinetId={selectedCabinetId}
              findSpaceMinU={findSpace ? 10 : null} placing={!!placing}
              onCabinetClick={(id) => { setSelectedCabinetId(id); setPlacing(null) }}
              onObjectClick={async (id) => { if (edit && roomId) { await deleteFloorObject(roomId, id); refresh(); notify.success("Object removed") } }}
              onCellClick={handleCellClick} />
          ) : (
            <Box sx={{ p: 4 }}><Typography sx={{ fontSize: 13, color: "text.secondary" }}>{roomId ? "Loading floor plan…" : "This site has no rooms yet — add a room in the hierarchy."}</Typography></Box>
          )}
        </Box>

        {/* Right rail: edit palette / cabinet panel */}
        <Box sx={{ width: 260, flexShrink: 0, borderLeft: "1px solid", borderColor: "divider", bgcolor: railBg, overflowY: "auto", p: 1.75 }}>
          {edit ? (
            <Stack spacing={1.5}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary" }}>Unplaced cabinets</Typography>
              {plan?.unplacedCabinets.length ? (
                <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                  {plan.unplacedCabinets.map(c => (
                    <Chip key={c.id} label={c.name} size="small" onClick={() => setPlacing({ kind: "cabinet", id: c.id })}
                      variant={placing?.kind === "cabinet" && placing.id === c.id ? "filled" : "outlined"} color={placing?.kind === "cabinet" && placing.id === c.id ? "primary" : "default"} />
                  ))}
                </Stack>
              ) : <Typography sx={{ fontSize: 12, color: "text.secondary" }}>All cabinets are placed.</Typography>}

              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary", pt: 1 }}>Add infrastructure</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {["CRAC", "UPS", "PDU", "COLUMN"].map(t => (
                  <Chip key={t} label={t} size="small" onClick={() => setPlacing({ kind: "object", objectType: t })}
                    variant={placing?.kind === "object" && placing.objectType === t ? "filled" : "outlined"} color={placing?.kind === "object" && placing.objectType === t ? "primary" : "default"} />
                ))}
              </Stack>
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Click an item then a grid cell to place it. Click a placed object to remove it. Select a cabinet for rotate / return.</Typography>

              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary", pt: 1 }}>Setup</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                <Button size="small" variant="outlined" onClick={() => setSetupOpen(true)} sx={{ textTransform: "none" }}>Room & backdrop</Button>
                <Button size="small" variant="outlined" onClick={() => setImportOpen(true)} sx={{ textTransform: "none" }}>Import CSV</Button>
              </Stack>

              {selectedCabinet ? (
                <Box sx={{ mt: 1, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1 }}>{selectedCabinet.name}</Typography>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    <Button size="small" variant="outlined" onClick={() => rotate(selectedCabinet)} sx={{ textTransform: "none" }}>Rotate 90°</Button>
                    <Button size="small" variant="outlined" onClick={() => setPlacing({ kind: "cabinet", id: selectedCabinet.id })} sx={{ textTransform: "none" }}>Move</Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => returnToTray(selectedCabinet)} sx={{ textTransform: "none" }}>To tray</Button>
                  </Stack>
                </Box>
              ) : null}
            </Stack>
          ) : selectedCabinet ? (
            <CabinetPanel c={selectedCabinet} mode={mode} onOpen={() => siteId && nav(`/asset-hierarchy/${siteId}/cabinets/${selectedCabinet.id}`)} onClose={() => setSelectedCabinetId(null)} />
          ) : (
            <Box sx={{ pt: 2 }}>
              <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>Click a cabinet to see its space, power and open work — then jump into its elevation.</Typography>
              {plan?.unplacedCabinets.length ? <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>{plan.unplacedCabinets.length} cabinet(s) not yet placed — use <b>Edit layout</b>.</Typography> : null}
            </Box>
          )}
        </Box>
      </Box>

      {setupOpen && roomId && plan ? (
        <RoomSetupDialog roomId={roomId} room={plan.room} onClose={() => setSetupOpen(false)} onChanged={refresh} />
      ) : null}
      {importOpen && roomId ? (
        <CsvImportDialog roomId={roomId} onClose={() => setImportOpen(false)} onImported={refresh} />
      ) : null}
    </Box>
  )
}

function CabinetPanel({ c, mode, onOpen, onClose }: { c: FloorCabinet; mode: "light" | "dark"; onOpen: () => void; onClose: () => void }) {
  const rows: [string, string, number | null][] = [
    ["Space", `${c.space.usedU}/${c.space.totalU} U`, c.space.pct],
    ["Power", c.power.capacity != null ? `${kw(c.power.value)} / ${kw(c.power.capacity)}` : kw(c.power.value), c.power.pct],
    ["Weight", c.weight.capacity != null ? `${Math.round(c.weight.value)}/${Math.round(c.weight.capacity)} kg` : "—", c.weight.pct],
  ]
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{c.name}</Typography>
        <Button size="small" onClick={onClose} sx={{ minWidth: 0, textTransform: "none" }}>✕</Button>
      </Box>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{c.status.toLowerCase()} · {c.activeAssets} active asset{c.activeAssets === 1 ? "" : "s"}{c.row ? ` · ${c.row}${c.positionInRow ? `-${c.positionInRow}` : ""}` : ""}</Typography>
      {c.stranded ? <Chip size="small" label={`Stranded ${c.stranded}`} sx={{ alignSelf: "flex-start", bgcolor: mode === "dark" ? "#3a2c0f" : "#fef3c7", color: mode === "dark" ? "#fbbf24" : "#b45309", fontWeight: 600 }} /> : null}
      {rows.map(([label, caption, pct]) => (
        <Box key={label}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: "3px" }}>
            <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>{label}</Typography>
            <Typography sx={{ fontSize: 11.5 }}>{caption}</Typography>
          </Box>
          <Box sx={{ height: 6, borderRadius: "3px", bgcolor: mode === "dark" ? "#1e293b" : "#f1f5f9", overflow: "hidden" }}>
            <Box sx={{ width: `${Math.min(100, pct ?? 0)}%`, height: "100%", bgcolor: pctColor(pct, mode), borderRadius: "3px" }} />
          </Box>
        </Box>
      ))}
      <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>Largest free block: <b>{c.space.largestContiguousU}U</b></Typography>
      <Button size="small" variant="contained" onClick={onOpen} sx={{ textTransform: "none", mt: 0.5 }}>Open elevation</Button>
    </Stack>
  )
}

function LensLegend({ lens, mode }: { lens: FloorLens; mode: "light" | "dark" }) {
  const items = lens === "status"
    ? [["Active", "#15803d"], ["Planned", "#475569"], ["Decommissioning", "#b45309"], ["Retired", "#475569"]]
    : [["<65%", pctColor(50, mode)], ["65–85%", pctColor(75, mode)], [">85%", pctColor(95, mode)]]
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {items.map(([label, color]) => (
        <Stack key={label} direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: color }} />
          <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>{label}</Typography>
        </Stack>
      ))}
    </Stack>
  )
}
