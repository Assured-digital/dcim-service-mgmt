import React from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, TextField, Typography
} from "@mui/material"
import { api } from "../lib/api"
import { useNotification } from "../components/NotificationProvider"
import { ToolbarButton } from "../components/shared/ListToolbar"
import { useThemeMode } from "../lib/theme"
import { getApiErrorMessage } from "../lib/infrastructure"
import {
  PORT_TYPES, PORT_TYPE_LABELS, Port, PortType,
  createPorts, deletePort, listPorts, listPortsLite, portPeer,
  setPassThrough, clearPassThrough,
} from "../lib/ports"
import CableTraceDialog from "./CableTraceDialog"

// Port inventory + one-hop connectivity for an asset (DCIM_SCHEMA_SPEC §6). Replaces
// the "coming soon" interfaces stub on the asset-detail Connections tab: list ports
// grouped by type with what each connects to, bulk-add ports, connect a port to
// another asset's port, disconnect, delete.
export default function AssetPortsPanel({ assetId, assetName, canManage }: {
  assetId: string; assetName: string; canManage: boolean
}) {
  const { mode } = useThemeMode()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { notify } = useNotification()
  const [addOpen, setAddOpen] = React.useState(false)
  const [connectPort, setConnectPort] = React.useState<Port | null>(null)
  const [throughPort, setThroughPort] = React.useState<Port | null>(null)
  const [tracePortId, setTracePortId] = React.useState<string | null>(null)

  const { data: ports = [], isLoading } = useQuery({ queryKey: ["ports", assetId], queryFn: () => listPorts(assetId) })
  const refresh = () => qc.invalidateQueries({ queryKey: ["ports", assetId] })

  const grouped = React.useMemo(() => {
    const g: Record<string, Port[]> = {}
    for (const p of ports) (g[p.portType] ??= []).push(p)
    return g
  }, [ports])

  async function disconnect(connectionId: string) {
    try { await api.delete(`/connections/${connectionId}`); notify.success("Disconnected"); refresh() }
    catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to disconnect")) }
  }
  async function removePort(portId: string) {
    try { await deletePort(portId); notify.success("Port removed"); refresh() }
    catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to remove port")) }
  }
  async function unpair(portId: string) {
    try { await clearPassThrough(portId); notify.success("Pass-through removed"); refresh() }
    catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to remove pass-through")) }
  }

  const typeChip = (t: string) => (
    <Chip size="small" label={PORT_TYPE_LABELS[t as PortType] ?? t}
      sx={{ height: 17, fontSize: 9, fontWeight: 600, bgcolor: mode === "dark" ? "#1e293b" : "#f1f5f9", color: "text.secondary" }} />
  )

  return (
    <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ px: "16px", py: "12px", borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center" }}>
        <Typography sx={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "text.secondary", flex: 1 }}>Ports & connectivity ({ports.length})</Typography>
        {canManage ? <ToolbarButton onClick={() => setAddOpen(true)}>Add ports</ToolbarButton> : null}
      </Box>

      {isLoading ? null : ports.length === 0 ? (
        <Box sx={{ px: "16px", py: "18px" }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No ports defined{canManage ? " — add network, power, console or fibre ports to record cabling." : "."}</Typography>
        </Box>
      ) : (
        Object.entries(grouped).map(([type, list]) => (
          <Box key={type}>
            <Box sx={{ px: "16px", py: "6px", bgcolor: "background.default" }}>
              <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "text.secondary" }}>{PORT_TYPE_LABELS[type as PortType] ?? type} ({list.length})</Typography>
            </Box>
            {list.map(p => {
              const peer = portPeer(p)
              const traceable = !!peer || !!p.throughPortId
              return (
                <Box key={p.id} sx={{ px: "16px", py: "8px", display: "flex", alignItems: "flex-start", gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, fontFamily: "monospace", width: 90, flexShrink: 0, pt: "2px" }}>{p.name}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 0.25 }}>
                    {peer ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <Typography sx={{ fontSize: 11.5, color: "text.secondary", flexShrink: 0 }}>→</Typography>
                        <Typography onClick={() => nav(`/asset-register/assets/${peer.asset.id}`)}
                          sx={{ fontSize: 12, color: "primary.main", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", "&:hover": { textDecoration: "underline" } }}>
                          {peer.asset.name}{peer.port ? ` · ${peer.port.name}` : ""}
                        </Typography>
                        <Typography sx={{ fontSize: 10.5, color: "text.secondary", flexShrink: 0 }}>
                          {peer.connectionType}{peer.cableLength != null ? ` · ${peer.cableLength}m` : ""}{peer.cableColour ? ` · ${peer.cableColour}` : ""}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>Not connected</Typography>
                    )}
                    {p.throughPort ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>⇄ pass-through to <b>{p.throughPort.name}</b></Typography>
                        {canManage ? <Button size="small" onClick={() => unpair(p.id)} sx={{ textTransform: "none", fontSize: 10, minWidth: 0, py: 0 }}>unpair</Button> : null}
                      </Box>
                    ) : null}
                  </Box>
                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    {traceable ? <Button size="small" onClick={() => setTracePortId(p.id)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>Trace</Button> : null}
                    {canManage ? (
                      <>
                        {peer ? (
                          <Button size="small" onClick={() => disconnect(peer.connectionId)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>Disconnect</Button>
                        ) : (
                          <Button size="small" onClick={() => setConnectPort(p)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>Connect</Button>
                        )}
                        {!p.throughPortId ? <Button size="small" onClick={() => setThroughPort(p)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>Pass-through</Button> : null}
                        <Button size="small" color="error" onClick={() => removePort(p.id)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>✕</Button>
                      </>
                    ) : null}
                  </Stack>
                </Box>
              )
            })}
          </Box>
        ))
      )}

      {addOpen ? <AddPortsDialog assetId={assetId} onClose={() => setAddOpen(false)} onDone={refresh} /> : null}
      {connectPort ? (
        <ConnectPortDialog fromAssetId={assetId} fromAssetName={assetName} fromPort={connectPort}
          onClose={() => setConnectPort(null)} onDone={refresh} />
      ) : null}
      {throughPort ? (
        <PassThroughDialog port={throughPort} candidates={ports} onClose={() => setThroughPort(null)} onDone={refresh} />
      ) : null}
      {tracePortId ? <CableTraceDialog startPortId={tracePortId} onClose={() => setTracePortId(null)} /> : null}
    </Box>
  )
}

// Pair a port to another UNPAIRED port on the SAME asset (patch-panel front↔rear).
function PassThroughDialog({ port, candidates, onClose, onDone }: {
  port: Port; candidates: Port[]; onClose: () => void; onDone: () => void
}) {
  const { notify } = useNotification()
  const [peerId, setPeerId] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  // Eligible peers: other ports on this asset that aren't already paired.
  const options = candidates.filter(c => c.id !== port.id && !c.throughPortId)

  async function save() {
    if (!peerId) { notify.error("Pick a port to pass through to"); return }
    setSaving(true)
    try {
      await setPassThrough(port.id, peerId)
      notify.success("Pass-through set")
      onDone(); onClose()
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to set pass-through")) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Pass-through from {port.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
            Link this port to its rear/front counterpart so a cable trace runs straight through the panel.
          </Typography>
          {options.length === 0 ? (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No other unpaired ports on this asset.</Typography>
          ) : (
            <TextField size="small" select label="Pass through to" value={peerId} onChange={e => setPeerId(e.target.value)}>
              {options.map(o => <MenuItem key={o.id} value={o.id}>{o.name} · {PORT_TYPE_LABELS[o.portType]}</MenuItem>)}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving || !peerId} sx={{ textTransform: "none" }}>Set</Button>
      </DialogActions>
    </Dialog>
  )
}

function AddPortsDialog({ assetId, onClose, onDone }: { assetId: string; onClose: () => void; onDone: () => void }) {
  const { notify } = useNotification()
  const [name, setName] = React.useState("")
  const [portType, setPortType] = React.useState<PortType>("NETWORK")
  const [count, setCount] = React.useState("1")
  const [saving, setSaving] = React.useState(false)

  async function save() {
    if (!name.trim()) { notify.error("Port name is required"); return }
    setSaving(true)
    try {
      const n = Math.max(1, parseInt(count, 10) || 1)
      const res = await createPorts(assetId, { name: name.trim(), portType, count: n })
      notify.success(`Added ${res.created} port${res.created === 1 ? "" : "s"}`)
      onDone(); onClose()
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to add ports")) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Add ports</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField autoFocus size="small" label="Name" placeholder="eth0 or Gi0/{n}" value={name} onChange={e => setName(e.target.value)}
            helperText="For a range, use {n} (e.g. Gi0/{n}) or a plain name — it numbers automatically" />
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" select label="Type" value={portType} onChange={e => setPortType(e.target.value as PortType)} sx={{ flex: 1 }}>
              {PORT_TYPES.map(t => <MenuItem key={t} value={t}>{PORT_TYPE_LABELS[t]}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Count" type="number" value={count} onChange={e => setCount(e.target.value)} inputProps={{ min: 1, max: 96 }} sx={{ width: 100 }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving} sx={{ textTransform: "none" }}>Add</Button>
      </DialogActions>
    </Dialog>
  )
}

type AssetLite = { id: string; name: string; assetTag: string }

function ConnectPortDialog({ fromAssetId, fromAssetName, fromPort, onClose, onDone }: {
  fromAssetId: string; fromAssetName: string; fromPort: Port; onClose: () => void; onDone: () => void
}) {
  const { notify } = useNotification()
  const [targetAssetId, setTargetAssetId] = React.useState("")
  const [targetPortId, setTargetPortId] = React.useState("")
  const [connectionType, setConnectionType] = React.useState("")
  const [cableLength, setCableLength] = React.useState("")
  const [cableColour, setCableColour] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const { data: assets = [] } = useQuery({ queryKey: ["assets"], queryFn: async () => (await api.get<AssetLite[]>("/assets")).data })
  const { data: targetPorts = [] } = useQuery({
    queryKey: ["ports-lite", targetAssetId], enabled: !!targetAssetId,
    queryFn: () => listPortsLite(targetAssetId),
  })

  async function save() {
    if (!targetAssetId) { notify.error("Pick a target asset"); return }
    setSaving(true)
    try {
      const len = cableLength.trim() ? Number(cableLength) : undefined
      await api.post("/connections", {
        fromAssetId, toAssetId: targetAssetId,
        fromPortId: fromPort.id,
        toPortId: targetPortId || undefined,
        connectionType: connectionType.trim() || fromPort.portType,
        cableLength: len != null && !Number.isNaN(len) ? len : undefined,
        cableColour: cableColour.trim() || undefined,
      })
      notify.success("Connected")
      onDone(); onClose()
    } catch (e: unknown) { notify.error(getApiErrorMessage((e as any)?.response?.data ?? e, "Failed to connect")) }
    finally { setSaving(false) }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Connect {fromPort.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography sx={{ fontSize: 12, color: "text.secondary" }}>From <b>{fromAssetName}</b> · {fromPort.name}</Typography>
          <TextField size="small" select label="To asset" value={targetAssetId} onChange={e => { setTargetAssetId(e.target.value); setTargetPortId("") }}>
            {assets.filter(a => a.id !== fromAssetId).map(a => <MenuItem key={a.id} value={a.id}>{a.name} ({a.assetTag})</MenuItem>)}
          </TextField>
          <TextField size="small" select label="To port (optional)" value={targetPortId} onChange={e => setTargetPortId(e.target.value)} disabled={!targetAssetId}>
            <MenuItem value="">— asset-level (no port) —</MenuItem>
            {targetPorts.map(p => <MenuItem key={p.id} value={p.id}>{p.name} · {PORT_TYPE_LABELS[p.portType]}</MenuItem>)}
          </TextField>
          <TextField size="small" label="Cable / media type" placeholder="e.g. Cat6, 10GBASE-SR, C13" value={connectionType} onChange={e => setConnectionType(e.target.value)}
            helperText={`Blank uses "${fromPort.portType}"`} />
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Length (m)" type="number" value={cableLength} onChange={e => setCableLength(e.target.value)} inputProps={{ min: 0, step: 0.1 }} sx={{ flex: 1 }} />
            <TextField size="small" label="Colour" placeholder="e.g. blue" value={cableColour} onChange={e => setCableColour(e.target.value)} sx={{ flex: 1 }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving || !targetAssetId} sx={{ textTransform: "none" }}>Connect</Button>
      </DialogActions>
    </Dialog>
  )
}
