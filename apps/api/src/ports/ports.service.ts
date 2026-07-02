import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

// Port inventory beneath the Connection layer (DCIM_SCHEMA_SPEC §6). Ports belong
// to an Asset and are tenant-scoped INDIRECTLY via asset.clientId — every read/
// write resolves the parent asset in the caller's client scope first, so a spoofed
// x-client-id can never touch another tenant's ports.
export const PORT_TYPES = ["NETWORK", "POWER", "CONSOLE", "FIBRE"] as const
export type PortType = (typeof PORT_TYPES)[number]

@Injectable()
export class PortsService {
  constructor(private prisma: PrismaService) {}

  // Resolve an asset in the caller's client scope. INTERNAL assets are visible to
  // org-super (mirrors AssetsService); client-scoped callers only see their own.
  private async assertAssetInScope(assetId: string, clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, OR: [{ clientId }, { ownerType: "INTERNAL" }] },
      select: { id: true, clientId: true, ownerType: true },
    })
    if (!asset) throw new NotFoundException("Asset not found")
    return asset
  }

  async listForAsset(clientId: string, assetId: string) {
    await this.assertAssetInScope(assetId, clientId)
    return this.prisma.port.findMany({
      where: { assetId },
      orderBy: [{ portType: "asc" }, { position: "asc" }, { name: "asc" }],
      include: {
        // Resolve the far end of any connection terminating on this port (one hop).
        fromConnections: { include: { toAsset: { select: { id: true, name: true, assetTag: true } }, toPort: { select: { id: true, name: true } } } },
        toConnections: { include: { fromAsset: { select: { id: true, name: true, assetTag: true } }, fromPort: { select: { id: true, name: true } } } },
        // Pass-through peer (patch-panel front↔rear) for the panel's inline indicator.
        throughPort: { select: { id: true, name: true } },
      },
    })
  }

  // Create one port, or a numbered range in one call. `count` + a `{n}` token in
  // the name stamps out `Gi0/{n}` → Gi0/1..Gi0/count (the NetBox range idiom, kept
  // simple). Positions auto-increment from the current max for the type.
  async create(clientId: string, assetId: string, dto: {
    name: string; portType: PortType; position?: number; count?: number
  }) {
    await this.assertAssetInScope(assetId, clientId)
    const name = dto.name?.trim()
    if (!name) throw new BadRequestException("Port name is required")
    const count = Math.max(1, Math.min(96, dto.count ?? 1))

    const existing = await this.prisma.port.findMany({
      where: { assetId, portType: dto.portType }, select: { position: true },
    })
    let nextPos = (dto.position ?? existing.reduce((m, p) => Math.max(m, p.position ?? 0), 0) + 1)

    const data = Array.from({ length: count }, (_, i) => ({
      assetId,
      name: count > 1 ? (name.includes("{n}") ? name.replaceAll("{n}", String(i + 1)) : `${name}${i + 1}`) : name,
      portType: dto.portType,
      position: nextPos + i,
    }))
    await this.prisma.port.createMany({ data })
    return { created: data.length }
  }

  async remove(clientId: string, portId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const port = await this.prisma.port.findFirst({
      where: { id: portId, asset: { OR: [{ clientId }, { ownerType: "INTERNAL" }] } },
      include: { _count: { select: { fromConnections: true, toConnections: true } } },
    })
    if (!port) throw new NotFoundException("Port not found")
    // Connections onto the port SetNull automatically (schema) — the cable stays
    // as an asset-level link, it just loses its port endpoint. The pass-through
    // peer's pointer also SetNulls automatically (self-FK). Safe to delete.
    await this.prisma.port.delete({ where: { id: portId } })
    return { ok: true }
  }

  // Resolve a single port in the caller's client scope (via its asset), returning
  // the scalars pass-through/trace need. Same indirect-scoping guard as ports.
  private async loadScopedPort(portId: string, clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const port = await this.prisma.port.findFirst({
      where: { id: portId, asset: { OR: [{ clientId }, { ownerType: "INTERNAL" }] } },
      select: { id: true, assetId: true, name: true, portType: true, throughPortId: true },
    })
    if (!port) throw new NotFoundException("Port not found")
    return port
  }

  // Pair two ports on the SAME asset as a patch-panel pass-through (front↔rear).
  // Symmetric: both sides written in one tx. Re-pairing is idempotent — any
  // existing pairing on either port (and its old peer) is cleared first so the
  // @unique(throughPortId) constraint can't collide.
  async setPassThrough(clientId: string, portId: string, peerPortId: string) {
    if (portId === peerPortId) throw new BadRequestException("A port cannot pass through to itself")
    const [a, b] = await Promise.all([
      this.loadScopedPort(portId, clientId),
      this.loadScopedPort(peerPortId, clientId),
    ])
    if (a.assetId !== b.assetId) throw new BadRequestException("Pass-through ports must be on the same asset")

    // Old peers to release (skip if a/b are already each other's peer).
    const oldPeers = [a, b]
      .map((p) => p.throughPortId)
      .filter((id): id is string => !!id && id !== a.id && id !== b.id)

    await this.prisma.$transaction(async (tx) => {
      await tx.port.updateMany({ where: { id: { in: [a.id, b.id, ...oldPeers] } }, data: { throughPortId: null } })
      await tx.port.update({ where: { id: a.id }, data: { throughPortId: b.id } })
      await tx.port.update({ where: { id: b.id }, data: { throughPortId: a.id } })
    })
    return { ok: true }
  }

  async clearPassThrough(clientId: string, portId: string) {
    const port = await this.loadScopedPort(portId, clientId)
    const ids = port.throughPortId ? [port.id, port.throughPortId] : [port.id]
    await this.prisma.$transaction(async (tx) => {
      await tx.port.updateMany({ where: { id: { in: ids } }, data: { throughPortId: null } })
    })
    return { ok: true }
  }

  // Multi-hop cable trace (DCIM_DESIGN_SPEC §6.1, Horizon 2). Each port has ≤1
  // cable and ≤1 pass-through peer, so the path is linear: walk outward from the
  // start port in BOTH directions, alternating CABLE hops (a Connection to a far
  // port/asset) and PASS-THROUGH hops (internal front↔rear), until a terminal
  // port, a dead end, or the hop cap. Only the START asset is scope-checked — a
  // cable can only reach same-client assets (connections are clientId-scoped).
  async trace(clientId: string, portId: string) {
    const scoped = await this.loadScopedPort(portId, clientId)
    const start = await this.loadPortForTrace(scoped.id)
    if (!start) throw new NotFoundException("Port not found")

    const visited = new Set<string>([start.id])
    const right = await this.walk(start, "cable", visited)
    const left = await this.walk(start, "through", visited)

    return {
      nodes: [...left.steps.map((s) => s.node).reverse(), this.nodeOf(start), ...right.steps.map((s) => s.node)],
      segments: [...left.steps.map((s) => s.segment).reverse(), ...right.steps.map((s) => s.segment)],
      truncated: left.truncated || right.truncated,
    }
  }

  private static readonly TRACE_HOP_CAP = 32

  private loadPortForTrace(portId: string) {
    return this.prisma.port.findUnique({
      where: { id: portId },
      include: {
        asset: { select: { id: true, name: true, assetTag: true } },
        // Only the far portId (to continue) + far asset (for asset-level ends) are
        // needed — each hop re-loads the far port fully, so no deep nesting here.
        fromConnections: { select: { id: true, connectionType: true, cableLength: true, cableColour: true, status: true, label: true, toPortId: true, toAsset: { select: { id: true, name: true, assetTag: true } } } },
        toConnections: { select: { id: true, connectionType: true, cableLength: true, cableColour: true, status: true, label: true, fromPortId: true, fromAsset: { select: { id: true, name: true, assetTag: true } } } },
      },
    })
  }

  private nodeOf(port: any) {
    return { assetId: port.asset.id, assetName: port.asset.name, assetTag: port.asset.assetTag, portId: port.id, portName: port.name, portType: port.portType }
  }
  private assetNode(asset: any) {
    return { assetId: asset.id, assetName: asset.name, assetTag: asset.assetTag, portId: null, portName: null, portType: null }
  }

  // The cable leaving a port (as either endpoint). Returns the far portId to
  // continue through, OR a terminal asset-level node when the far end has no port.
  private cableHop(port: any): { segment: any; farPortId?: string; farNode?: any } | null {
    const fromC = port.fromConnections?.[0]
    const toC = port.toConnections?.[0]
    const conn = fromC ?? toC
    if (!conn) return null
    const segment = { type: "cable", connectionType: conn.connectionType, cableLength: conn.cableLength, cableColour: conn.cableColour, status: conn.status, label: conn.label }
    if (fromC) return conn.toPortId ? { segment, farPortId: conn.toPortId } : { segment, farNode: this.assetNode(conn.toAsset) }
    return conn.fromPortId ? { segment, farPortId: conn.fromPortId } : { segment, farNode: this.assetNode(conn.fromAsset) }
  }

  private throughHop(port: any): { segment: any; farPortId: string } | null {
    return port.throughPortId ? { segment: { type: "through" }, farPortId: port.throughPortId } : null
  }

  // Walk one direction, alternating cable/through. `first` is the step taken from
  // the start port (its cable, or its pass-through) — thereafter arriving via a
  // cable forces a through next and vice-versa, so we never retread the same edge.
  private async walk(startPort: any, first: "cable" | "through", visited: Set<string>) {
    const steps: { segment: any; node: any }[] = []
    let cur = startPort
    let step = first
    let truncated = false
    while (true) {
      const hop = step === "cable" ? this.cableHop(cur) : this.throughHop(cur)
      if (!hop) break
      if ("farNode" in hop && hop.farNode) { steps.push({ segment: hop.segment, node: hop.farNode }); break }
      const farId = (hop as any).farPortId as string
      if (visited.has(farId)) break
      const far = await this.loadPortForTrace(farId)
      if (!far) break
      visited.add(far.id)
      steps.push({ segment: hop.segment, node: this.nodeOf(far) })
      if (steps.length >= PortsService.TRACE_HOP_CAP) { truncated = true; break }
      cur = far
      step = step === "cable" ? "through" : "cable"
    }
    return { steps, truncated }
  }
}
