import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
import { sniffContentType, MAX_ATTACHMENT_BYTES } from "../attachments/content-policy"
import { CapacityAsset, computeCabinetCapacity } from "./capacity.util"
import { SensorReadingsService } from "../sensor-readings/sensor-readings.service"
import { LatestByAsset, deriveCabinetEnvironment } from "../sensor-readings/health"

// Floor-plan read/write model (DCIM_DESIGN_BRIEF §6, DCIM_SCHEMA_SPEC §2). The
// architectural room view: cabinets at posX/posY with rotation + a capacity lens,
// placed floor objects (CRAC/UPS/…), hot/cold aisle zones, and an unplaced tray.
// All scoped through room→site→client / cabinet→site→client; spoof-tested per §8.

const ASSET_SELECT = {
  id: true,
  uPosition: true, uHeight: true, isZeroU: true, isFullDepth: true, lifecycleState: true,
  powerDrawW: true, budgetedDrawW: true, weightKg: true,
  deviceType: { select: { excludeFromUtilization: true } },
} as const

const toCapAsset = (a: any): CapacityAsset => ({
  uPosition: a.uPosition, uHeight: a.uHeight, isZeroU: a.isZeroU, isFullDepth: a.isFullDepth,
  lifecycleState: a.lifecycleState, powerDrawW: a.powerDrawW, budgetedDrawW: a.budgetedDrawW,
  weightKg: a.weightKg, excludeFromUtilization: a.deviceType?.excludeFromUtilization ?? false,
})

const IMG_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }

@Injectable()
export class FloorPlanService {
  constructor(private prisma: PrismaService, private storage: StorageService, @Optional() private readings?: SensorReadingsService) {}

  private async assertRoom(clientId: string, roomId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const room = await this.prisma.room.findFirst({ where: { id: roomId, site: { clientId } } })
    if (!room) throw new NotFoundException("Room not found")
    return room
  }

  private async assertCabinet(clientId: string, cabinetId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    const cabinet = await this.prisma.cabinet.findFirst({ where: { id: cabinetId, site: { clientId } } })
    if (!cabinet) throw new NotFoundException("Cabinet not found")
    return cabinet
  }

  async getFloorPlan(clientId: string, roomId: string) {
    const room = await this.assertRoom(clientId, roomId)

    const cabinets = await this.prisma.cabinet.findMany({
      where: { roomId },
      orderBy: { name: "asc" },
      include: { assets: { select: ASSET_SELECT } },
    })
    const [floorObjects, aisleZones] = await Promise.all([
      this.prisma.floorObject.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
      this.prisma.aisleZone.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } }),
    ])

    // Latest readings across the room's assets → measured power + Health lens.
    const allAssetIds = cabinets.flatMap((c) => c.assets.map((a) => a.id))
    const latest = (await this.readings?.latestForAssets(clientId, allAssetIds)) ?? (new Map() as LatestByAsset)

    const shaped = cabinets.map((c) => {
      const capAssets = c.assets.map((a) => ({ ...toCapAsset(a), measuredW: latest.get(a.id)?.powerW?.value ?? null }))
      const cap = computeCabinetCapacity(c, capAssets)
      const environment = deriveCabinetEnvironment(
        c.assets.filter((a) => a.lifecycleState !== "RETIRED").map((a) => a.id),
        latest, cap.power.measured ?? null, c.powerKw
      )
      return {
        id: c.id, name: c.name, posX: c.posX, posY: c.posY, orientation: c.orientation,
        status: c.status, row: c.row, positionInRow: c.positionInRow, totalU: c.totalU ?? 0,
        space: { usedU: cap.space.usedU, totalU: cap.space.totalU, pct: cap.space.pct, largestContiguousU: cap.space.largestContiguousU },
        power: cap.power, weight: cap.weight, stranded: cap.stranded, environment,
        activeAssets: c.assets.filter((a) => a.lifecycleState !== "RETIRED").length,
      }
    })

    return {
      room: {
        id: room.id, name: room.name, widthMm: room.widthMm, depthMm: room.depthMm,
        gridCols: room.gridCols, gridRows: room.gridRows, shellType: room.shellType,
        backgroundOpacity: room.backgroundOpacity, hasBackgroundImage: !!room.backgroundImageKey,
        shellShape: room.shellShape,
      },
      cabinets: shaped.filter((c) => c.posX != null && c.posY != null),
      unplacedCabinets: shaped.filter((c) => c.posX == null || c.posY == null)
        .map((c) => ({ id: c.id, name: c.name, totalU: c.totalU, status: c.status })),
      floorObjects, aisleZones,
    }
  }

  async updateRoomSettings(clientId: string, roomId: string, dto: {
    widthMm?: number | null; depthMm?: number | null; gridCols?: number | null; gridRows?: number | null
    shellType?: string | null; backgroundOpacity?: number | null; shellShape?: any
  }) {
    await this.assertRoom(clientId, roomId)
    return this.prisma.room.update({ where: { id: roomId }, data: dto })
  }

  // Place / move / re-orient / re-status a cabinet on the plan. posX/posY null →
  // returns it to the unplaced tray. Orientation clamped to 0/90/180/270.
  async placeCabinet(clientId: string, cabinetId: string, dto: {
    posX?: number | null; posY?: number | null; orientation?: number
    row?: string | null; positionInRow?: number | null; status?: string
  }) {
    const cabinet = await this.assertCabinet(clientId, cabinetId)
    const orientation = dto.orientation != null ? ((Math.round(dto.orientation / 90) * 90) % 360 + 360) % 360 : cabinet.orientation
    return this.prisma.cabinet.update({
      where: { id: cabinetId },
      data: {
        posX: dto.posX !== undefined ? dto.posX : cabinet.posX,
        posY: dto.posY !== undefined ? dto.posY : cabinet.posY,
        orientation,
        row: dto.row !== undefined ? dto.row : cabinet.row,
        positionInRow: dto.positionInRow !== undefined ? dto.positionInRow : cabinet.positionInRow,
        status: dto.status ?? cabinet.status,
      },
    })
  }

  // ── Floor objects (CRAC / UPS / PDU / column / door) ──
  async createFloorObject(clientId: string, roomId: string, dto: {
    objectType: string; posX: number; posY: number; width?: number; depth?: number; orientation?: number; label?: string; assetId?: string
  }) {
    await this.assertRoom(clientId, roomId)
    return this.prisma.floorObject.create({
      data: {
        roomId, objectType: dto.objectType, posX: dto.posX, posY: dto.posY,
        width: dto.width ?? null, depth: dto.depth ?? null, orientation: dto.orientation ?? 0,
        label: dto.label ?? null, assetId: dto.assetId ?? null,
      },
    })
  }

  async updateFloorObject(clientId: string, roomId: string, id: string, dto: {
    posX?: number; posY?: number; width?: number; depth?: number; orientation?: number; label?: string
  }) {
    await this.assertRoom(clientId, roomId)
    const existing = await this.prisma.floorObject.findFirst({ where: { id, roomId } })
    if (!existing) throw new NotFoundException("Floor object not found")
    return this.prisma.floorObject.update({ where: { id }, data: dto })
  }

  async deleteFloorObject(clientId: string, roomId: string, id: string) {
    await this.assertRoom(clientId, roomId)
    const existing = await this.prisma.floorObject.findFirst({ where: { id, roomId } })
    if (!existing) throw new NotFoundException("Floor object not found")
    await this.prisma.floorObject.delete({ where: { id } })
    return { ok: true }
  }

  // ── Aisle zones (hot / cold) ──
  async createAisleZone(clientId: string, roomId: string, dto: { type: string; geometry: any; label?: string }) {
    await this.assertRoom(clientId, roomId)
    return this.prisma.aisleZone.create({ data: { roomId, type: dto.type, geometry: dto.geometry, label: dto.label ?? null } })
  }

  async updateAisleZone(clientId: string, roomId: string, id: string, dto: { type?: string; geometry?: any; label?: string }) {
    await this.assertRoom(clientId, roomId)
    const existing = await this.prisma.aisleZone.findFirst({ where: { id, roomId } })
    if (!existing) throw new NotFoundException("Aisle zone not found")
    return this.prisma.aisleZone.update({ where: { id }, data: dto })
  }

  async deleteAisleZone(clientId: string, roomId: string, id: string) {
    await this.assertRoom(clientId, roomId)
    const existing = await this.prisma.aisleZone.findFirst({ where: { id, roomId } })
    if (!existing) throw new NotFoundException("Aisle zone not found")
    await this.prisma.aisleZone.delete({ where: { id } })
    return { ok: true }
  }

  // ── CSV bulk import (DCIM_SCHEMA_SPEC §2.7) ──
  // The wizard parses + column-maps client-side; this endpoint takes normalised
  // rows, dedupes against existing cabinet names in the SITE (case-insensitive,
  // idempotent re-import), derives grid positions from row/positionInRow when no
  // explicit coordinates are given, and bulk-creates into the room. The column
  // mapping is stored (ImportMapping) so a recurring spreadsheet imports cleanly.
  async importCabinets(clientId: string, roomId: string, actorUserId: string, dto: {
    rows: { name: string; row?: string; positionInRow?: number; totalU?: number; powerKw?: number; posX?: number; posY?: number }[]
    mappingName?: string
    columnMap?: Record<string, string>
  }) {
    const room = await this.assertRoom(clientId, roomId)
    if (!dto.rows?.length) throw new BadRequestException("No rows to import")
    if (dto.rows.length > 500) throw new BadRequestException("Import capped at 500 rows")

    const existing = await this.prisma.cabinet.findMany({
      where: { siteId: room.siteId }, select: { name: true },
    })
    const taken = new Set(existing.map((c) => c.name.trim().toLowerCase()))

    // Derive grid coords for rows that carry row/positionInRow but no x/y: each
    // distinct row label becomes a y-band (2 apart, leaving an aisle), position
    // within the row walks x.
    const rowBands = new Map<string, number>()
    const bandFor = (label: string) => {
      if (!rowBands.has(label)) rowBands.set(label, rowBands.size * 2)
      return rowBands.get(label)!
    }

    const result = { created: 0, skipped: 0, errors: [] as string[] }
    const creates: any[] = []
    const seenInBatch = new Set<string>()

    for (const r of dto.rows) {
      const name = r.name?.trim()
      if (!name) { result.errors.push("Row with empty name skipped"); continue }
      const key = name.toLowerCase()
      if (taken.has(key) || seenInBatch.has(key)) { result.skipped++; continue }
      seenInBatch.add(key)
      let posX = r.posX ?? null
      let posY = r.posY ?? null
      if (posX == null && r.row && r.positionInRow != null) {
        posY = bandFor(r.row.trim())
        posX = r.positionInRow - 1
      }
      creates.push({
        siteId: room.siteId, roomId, name,
        row: r.row?.trim() || null,
        positionInRow: r.positionInRow ?? null,
        totalU: r.totalU ?? null,
        powerKw: r.powerKw ?? null,
        posX, posY,
      })
    }

    if (creates.length) {
      await this.prisma.cabinet.createMany({ data: creates })
      result.created = creates.length
    }

    if (dto.mappingName?.trim() && dto.columnMap) {
      await this.prisma.importMapping.create({
        data: { clientId, name: dto.mappingName.trim(), targetType: "CABINET", columnMap: dto.columnMap },
      })
    }

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Room", entityId: roomId, action: "CABINETS_IMPORTED",
        actorUserId, clientId,
        data: { created: result.created, skipped: result.skipped, errors: result.errors.length },
      },
    })

    return result
  }

  async listImportMappings(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
    return this.prisma.importMapping.findMany({
      where: { clientId, targetType: "CABINET" },
      orderBy: { createdAt: "desc" }, take: 20,
    })
  }

  // ── Background plan image (backdrop to plot cabinets on) ──
  async setBackground(clientId: string, roomId: string, file: Express.Multer.File) {
    const room = await this.assertRoom(clientId, roomId)
    if (!file?.buffer?.length) throw new BadRequestException("No file uploaded")
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw new BadRequestException("File too large")
    const mime = sniffContentType(file.buffer)
    if (!mime || mime === "application/pdf") throw new BadRequestException("Only PNG, JPEG, GIF or WebP images are accepted")

    const key = `floor-plans/${roomId}/background.${IMG_EXT[mime]}`
    await this.storage.putObject(key, file.buffer, mime)
    const oldKey = room.backgroundImageKey
    const updated = await this.prisma.room.update({
      where: { id: roomId },
      data: { backgroundImageKey: key, backgroundImageType: mime, shellType: room.shellType ?? "IMAGE" },
    })
    if (oldKey && oldKey !== key) await this.storage.deleteObject(oldKey).catch(() => undefined)
    return { ok: true, shellType: updated.shellType }
  }

  async openBackground(clientId: string, roomId: string) {
    const room = await this.assertRoom(clientId, roomId)
    if (!room.backgroundImageKey) throw new NotFoundException("No background image")
    return { stream: await this.storage.getObject(room.backgroundImageKey), contentType: room.backgroundImageType ?? "application/octet-stream" }
  }
}
