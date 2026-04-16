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

  private getInclude() {
    return {
      fromAsset: {
        select: {
          id: true,
          assetTag: true,
          name: true,
          site: { select: { id: true, name: true } }
        }
      },
      toAsset: {
        select: {
          id: true,
          assetTag: true,
          name: true,
          site: { select: { id: true, name: true } }
        }
      }
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

    return this.prisma.connection.create({
      data: {
        clientId,
        fromAssetId: dto.fromAssetId,
        toAssetId: dto.toAssetId,
        connectionType: dto.connectionType,
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

    return this.prisma.connection.update({
      where: { id: existing.id },
      data: {
        fromAssetId,
        toAssetId,
        connectionType: dto.connectionType ?? existing.connectionType,
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
