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
    // as an asset-level link, it just loses its port endpoint. Safe to delete.
    await this.prisma.port.delete({ where: { id: portId } })
    return { ok: true }
  }
}
