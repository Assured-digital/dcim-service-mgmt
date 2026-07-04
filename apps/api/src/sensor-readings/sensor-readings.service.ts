import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { SENSOR_METRICS, LatestByAsset, isSensorMetric } from "./health"

// Measured telemetry (Horizon 3) — manual/CSV field readings per asset. Tenant
// chokepoint: reads filter by the validated clientId; writes first prove the
// asset is in scope (INTERNAL visible to org-super, mirroring PortsService) and
// stamp that clientId onto the reading.
export type { LatestByAsset } from "./health"

@Injectable()
export class SensorReadingsService {
  constructor(private prisma: PrismaService) {}

  private async assertAssetInScope(assetId: string, clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, OR: [{ clientId }, { ownerType: "INTERNAL" }] },
      select: { id: true, clientId: true },
    })
    if (!asset) throw new NotFoundException("Asset not found")
    return asset
  }

  async record(clientId: string, actorUserId: string, assetId: string, dto: { metric: string; value: number; readAt?: string }) {
    await this.assertAssetInScope(assetId, clientId)
    if (!isSensorMetric(dto.metric)) throw new BadRequestException(`Unknown metric — one of ${SENSOR_METRICS.join(", ")}`)
    if (typeof dto.value !== "number" || Number.isNaN(dto.value)) throw new BadRequestException("A numeric value is required")
    const reading = await this.prisma.sensorReading.create({
      data: {
        clientId, assetId, metric: dto.metric, value: dto.value,
        readAt: dto.readAt ? new Date(dto.readAt) : new Date(),
        source: "manual", recordedById: actorUserId,
      },
    })
    return { id: reading.id, metric: reading.metric, value: reading.value, readAt: reading.readAt.toISOString(), source: reading.source }
  }

  async listForAsset(clientId: string, assetId: string, metric?: string, limit = 200) {
    await this.assertAssetInScope(assetId, clientId)
    const rows = await this.prisma.sensorReading.findMany({
      where: { clientId, assetId, ...(metric && isSensorMetric(metric) ? { metric } : {}) },
      orderBy: { readAt: "desc" },
      take: Math.min(1000, Math.max(1, limit)),
    })
    return rows.map((r) => ({ id: r.id, metric: r.metric, value: r.value, readAt: r.readAt.toISOString(), source: r.source }))
  }

  // Bulk field sheet — rows key an asset by tag (preferred) or id. Unknown/out-
  // of-scope assets and bad metrics are collected as errors, not fatal.
  async importCsv(clientId: string, actorUserId: string, rows: { assetTag?: string; assetId?: string; metric: string; value: number; readAt?: string }[]) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException("No rows to import")
    if (rows.length > 5000) throw new BadRequestException("Too many rows (max 5000)")

    // Resolve every referenced asset once, within scope.
    const tags = [...new Set(rows.map((r) => r.assetTag).filter(Boolean) as string[])]
    const ids = [...new Set(rows.map((r) => r.assetId).filter(Boolean) as string[])]
    const assets = await this.prisma.asset.findMany({
      where: { OR: [{ clientId }, { ownerType: "INTERNAL" }], AND: [{ OR: [{ assetTag: { in: tags } }, { id: { in: ids } }] }] },
      select: { id: true, assetTag: true },
    })
    const byTag = new Map(assets.map((a) => [a.assetTag, a.id]))
    const byId = new Set(assets.map((a) => a.id))

    const data: { clientId: string; assetId: string; metric: string; value: number; readAt: Date; source: string; recordedById: string }[] = []
    const errors: { row: number; reason: string }[] = []
    rows.forEach((r, i) => {
      const assetId = r.assetId && byId.has(r.assetId) ? r.assetId : r.assetTag ? byTag.get(r.assetTag) : undefined
      if (!assetId) { errors.push({ row: i + 1, reason: `Asset not found in scope (${r.assetTag ?? r.assetId})` }); return }
      if (!isSensorMetric(r.metric)) { errors.push({ row: i + 1, reason: `Unknown metric "${r.metric}"` }); return }
      const value = Number(r.value)
      if (Number.isNaN(value)) { errors.push({ row: i + 1, reason: "Non-numeric value" }); return }
      const readAt = r.readAt ? new Date(r.readAt) : new Date()
      if (Number.isNaN(readAt.getTime())) { errors.push({ row: i + 1, reason: "Invalid readAt" }); return }
      data.push({ clientId, assetId, metric: r.metric, value, readAt, source: "csv", recordedById: actorUserId })
    })

    if (data.length) await this.prisma.sensorReading.createMany({ data })
    return { created: data.length, skipped: errors.length, errors: errors.slice(0, 50) }
  }

  // Latest reading per (asset, metric) for a set of assets — the roll-up input
  // for the capacity model. DISTINCT ON (assetId, metric) ordered readAt desc.
  async latestForAssets(clientId: string, assetIds: string[]): Promise<LatestByAsset> {
    const out: LatestByAsset = new Map()
    if (assetIds.length === 0) return out
    const rows = await this.prisma.sensorReading.findMany({
      where: { clientId, assetId: { in: assetIds } },
      orderBy: [{ assetId: "asc" }, { metric: "asc" }, { readAt: "desc" }],
      distinct: ["assetId", "metric"],
      select: { assetId: true, metric: true, value: true, readAt: true },
    })
    for (const r of rows) {
      if (!isSensorMetric(r.metric)) continue
      const m = out.get(r.assetId) ?? {}
      m[r.metric] = { value: r.value, readAt: r.readAt.toISOString() }
      out.set(r.assetId, m)
    }
    return out
  }
}
