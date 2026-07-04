import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { CreateConnectionDto, ListConnectionsQueryDto, UpdateConnectionDto } from "./dto"

@Injectable()
export class ConnectionsService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  private async ensureAssetInScope(clientId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, clientId },
      select: { id: true }
    })
    if (!asset) throw new BadRequestException("Asset not found in selected client scope")
  }

  // A port endpoint (DCIM_SCHEMA_SPEC §6) must belong to the asset on that side —
  // you can't wire a cable to a port on a different device.
  private async ensurePortOnAsset(portId: string, assetId: string) {
    const port = await this.prisma.port.findFirst({ where: { id: portId, assetId }, select: { id: true } })
    if (!port) throw new BadRequestException("Port does not belong to the connection endpoint")
  }

  private getInclude() {
    const assetSel = { id: true, assetTag: true, name: true, site: { select: { id: true, name: true } } }
    const portSel = { select: { id: true, name: true, portType: true } }
    return {
      fromAsset: { select: assetSel },
      toAsset: { select: assetSel },
      fromPort: portSel,
      toPort: portSel,
    }
  }

  async listForClient(clientId: string, query: ListConnectionsQueryDto) {
    this.assertClientScope(clientId)
    return this.prisma.connection.findMany({
      where: {
        clientId,
        status: query.status ?? undefined,
        connectionType: query.connectionType ?? undefined,
        fromAssetId: query.fromAssetId ?? undefined,
        toAssetId: query.toAssetId ?? undefined
      },
      include: this.getInclude(),
      orderBy: { updatedAt: "desc" }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const connection = await this.prisma.connection.findFirst({
      where: { id, clientId },
      include: this.getInclude()
    })
    if (!connection) throw new NotFoundException("Connection not found")
    return connection
  }

  async createForClient(clientId: string, actorUserId: string | null, dto: CreateConnectionDto) {
    this.assertClientScope(clientId)
    if (dto.fromAssetId === dto.toAssetId) {
      throw new BadRequestException("Connection endpoints must be different assets")
    }
    await this.ensureAssetInScope(clientId, dto.fromAssetId)
    await this.ensureAssetInScope(clientId, dto.toAssetId)
    if (dto.fromPortId) await this.ensurePortOnAsset(dto.fromPortId, dto.fromAssetId)
    if (dto.toPortId) await this.ensurePortOnAsset(dto.toPortId, dto.toAssetId)

    return this.prisma.connection.create({
      data: {
        clientId,
        fromAssetId: dto.fromAssetId,
        toAssetId: dto.toAssetId,
        fromPortId: dto.fromPortId ?? null,
        toPortId: dto.toPortId ?? null,
        connectionType: dto.connectionType,
        cableLength: dto.cableLength ?? null,
        cableColour: dto.cableColour ?? null,
        status: dto.status ?? "ACTIVE",
        label: dto.label ?? null,
        notes: dto.notes ?? null,
        installedAt: dto.installedAt ? new Date(dto.installedAt) : null,
        lastValidatedAt: dto.lastValidatedAt ? new Date(dto.lastValidatedAt) : null,
        createdById: actorUserId ?? undefined
      },
      include: this.getInclude()
    })
  }

  async updateForClient(clientId: string, id: string, dto: UpdateConnectionDto) {
    this.assertClientScope(clientId)
    const existing = await this.getForClient(clientId, id)

    const fromAssetId = dto.fromAssetId ?? existing.fromAssetId
    const toAssetId = dto.toAssetId ?? existing.toAssetId
    if (fromAssetId === toAssetId) {
      throw new BadRequestException("Connection endpoints must be different assets")
    }
    await this.ensureAssetInScope(clientId, fromAssetId)
    await this.ensureAssetInScope(clientId, toAssetId)
    // Port endpoints: explicit null clears; a value must sit on the (new) asset.
    const fromPortId = dto.fromPortId !== undefined ? dto.fromPortId : existing.fromPortId
    const toPortId = dto.toPortId !== undefined ? dto.toPortId : existing.toPortId
    if (fromPortId) await this.ensurePortOnAsset(fromPortId, fromAssetId)
    if (toPortId) await this.ensurePortOnAsset(toPortId, toAssetId)

    return this.prisma.connection.update({
      where: { id: existing.id },
      data: {
        fromAssetId,
        toAssetId,
        fromPortId,
        toPortId,
        connectionType: dto.connectionType ?? existing.connectionType,
        cableLength: dto.cableLength !== undefined ? dto.cableLength : existing.cableLength,
        cableColour: dto.cableColour !== undefined ? dto.cableColour : existing.cableColour,
        status: dto.status ?? existing.status,
        label: dto.label ?? existing.label,
        notes: dto.notes ?? existing.notes,
        installedAt:
          dto.installedAt !== undefined
            ? dto.installedAt
              ? new Date(dto.installedAt)
              : null
            : existing.installedAt,
        lastValidatedAt:
          dto.lastValidatedAt !== undefined
            ? dto.lastValidatedAt
              ? new Date(dto.lastValidatedAt)
              : null
            : existing.lastValidatedAt
      },
      include: this.getInclude()
    })
  }

  async removeForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const existing = await this.getForClient(clientId, id)
    return this.prisma.connection.delete({ where: { id: existing.id } })
  }
}
