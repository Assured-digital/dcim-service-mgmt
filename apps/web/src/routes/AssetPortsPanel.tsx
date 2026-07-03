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
} from "../lib/ports"

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
              return (
                <Box key={p.id} sx={{ px: "16px", py: "8px", display: "flex", alignItems: "center", gap: 1, borderBottom: "1px solid", borderColor: "divider" }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, fontFamily: "monospace", width: 90, flexShrink: 0 }}>{p.name}</Typography>
                  {peer ? (
                    <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Typography sx={{ fontSize: 11.5, color: "text.secondary", flexShrink: 0 }}>→</Typography>
                      <Typography onClick={() => nav(`/asset-register/assets/${peer.asset.id}`)}
                        sx={{ fontSize: 12, color: "primary.main", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", "&:hover": { textDecoration: "underline" } }}>
                        {peer.asset.name}{peer.port ? ` · ${peer.port.name}` : ""}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, color: "text.secondary", flexShrink: 0 }}>{peer.connectionType}</Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ flex: 1, fontSize: 11.5, color: "text.secondary" }}>Not connected</Typography>
                  )}
                  {canManage ? (
                    <Stack direction="row" spacing={0.5}>
                      {peer ? (
                        <Button size="small" onClick={() => disconnect(peer.connectionId)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>Disconnect</Button>
                      ) : (
                        <Button size="small" onClick={() => setConnectPort(p)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>Connect</Button>
                      )}
                      <Button size="small" color="error" onClick={() => removePort(p.id)} sx={{ textTransform: "none", fontSize: 11, minWidth: 0 }}>✕</Button>
                    </Stack>
                  ) : null}
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
    </Box>
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
      await api.post("/connections", {
        fromAssetId, toAssetId: targetAssetId,
        fromPortId: fromPort.id,
        toPortId: targetPortId || undefined,
        connectionType: connectionType.trim() || fromPort.portType,
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
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button size="small" variant="contained" onClick={save} disabled={saving || !targetAssetId} sx={{ textTransform: "none" }}>Connect</Button>
      </DialogActions>
    </Dialog>
  )
}
