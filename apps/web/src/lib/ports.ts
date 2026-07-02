import { api } from "./api"

// Port inventory + connectivity (DCIM_SCHEMA_SPEC §6). A port belongs to an asset;
// connections may terminate on ports. The list response resolves each port's one-hop
// peer (the asset/port on the far end of any connection).

export const PORT_TYPES = ["NETWORK", "POWER", "CONSOLE", "FIBRE"] as const
export type PortType = (typeof PORT_TYPES)[number]

export const PORT_TYPE_LABELS: Record<PortType, string> = {
  NETWORK: "Network", POWER: "Power", CONSOLE: "Console", FIBRE: "Fibre",
}

type PeerAsset = { id: string; name: string; assetTag: string }
type PeerPort = { id: string; name: string } | null
type CableMeta = { cableLength: number | null; cableColour: string | null }
type ConnFrom = { id: string; connectionType: string; status: string; toAsset: PeerAsset; toPort: PeerPort } & CableMeta
type ConnTo = { id: string; connectionType: string; status: string; fromAsset: PeerAsset; fromPort: PeerPort } & CableMeta

export type Port = {
  id: string
  assetId: string
  name: string
  portType: PortType
  position: number | null
  // Pass-through peer on the same asset (patch-panel front↔rear); null = terminal.
  throughPortId: string | null
  throughPort?: { id: string; name: string } | null
  fromConnections: ConnFrom[]
  toConnections: ConnTo[]
}

// The resolved far end of a port (or null when unconnected), direction-agnostic.
export function portPeer(p: Port): { connectionId: string; connectionType: string; status: string; asset: PeerAsset; port: PeerPort; cableLength: number | null; cableColour: string | null } | null {
  const f = p.fromConnections[0]
  if (f) return { connectionId: f.id, connectionType: f.connectionType, status: f.status, asset: f.toAsset, port: f.toPort, cableLength: f.cableLength, cableColour: f.cableColour }
  const t = p.toConnections[0]
  if (t) return { connectionId: t.id, connectionType: t.connectionType, status: t.status, asset: t.fromAsset, port: t.fromPort, cableLength: t.cableLength, cableColour: t.cableColour }
  return null
}

export async function listPorts(assetId: string): Promise<Port[]> {
  return (await api.get<Port[]>(`/assets/${assetId}/ports`)).data
}
export async function createPorts(assetId: string, dto: { name: string; portType: PortType; count?: number }): Promise<{ created: number }> {
  return (await api.post(`/assets/${assetId}/ports`, dto)).data
}
export async function deletePort(portId: string): Promise<void> {
  await api.delete(`/ports/${portId}`)
}

// Minimal port shape for the "connect" target picker.
export async function listPortsLite(assetId: string): Promise<{ id: string; name: string; portType: PortType }[]> {
  const ports = await listPorts(assetId)
  return ports.map(p => ({ id: p.id, name: p.name, portType: p.portType }))
}

// ── Pass-through (patch-panel front↔rear) ────────────────────────────────────
export async function setPassThrough(portId: string, peerPortId: string): Promise<void> {
  await api.post(`/ports/${portId}/through`, { peerPortId })
}
export async function clearPassThrough(portId: string): Promise<void> {
  await api.delete(`/ports/${portId}/through`)
}

// ── Multi-hop cable trace (Horizon 2) ────────────────────────────────────────
// The backend walks the linear path through cables + pass-throughs from a start
// port and returns it as ordered nodes with the segment between each pair.
export type TraceNode = {
  assetId: string; assetName: string; assetTag: string | null
  portId: string | null; portName: string | null; portType: PortType | null
}
export type TraceSegment = {
  type: "cable" | "through"
  connectionType?: string; cableLength?: number | null; cableColour?: string | null
  status?: string; label?: string | null
}
export type TraceResult = { nodes: TraceNode[]; segments: TraceSegment[]; truncated: boolean }

export async function traceCable(portId: string): Promise<TraceResult> {
  return (await api.get<TraceResult>(`/ports/${portId}/trace`)).data
}
