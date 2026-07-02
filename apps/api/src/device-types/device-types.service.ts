import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { DeviceAirflow, Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
// Reused security util (pure, no client-scoping) — validates the ACTUAL bytes,
// never the client-sent Content-Type. Shared with attachments; a candidate to
// promote into common/ when a third consumer appears.
import { sniffContentType, MAX_ATTACHMENT_BYTES } from "../attachments/content-policy"

export type ImageFace = "front" | "rear"

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"
}

// The hardware catalogue is GLOBAL (not client-scoped) — a "Dell PowerEdge R740"
// is the same for every tenant. So there is deliberately no clientId filtering
// here (unlike every tenant-scoped service). Tenant isolation stays on Asset,
// which merely references a DeviceType.
@Injectable()
export class DeviceTypesService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  }

  // Flat search across the whole catalogue, manufacturer inlined. Matches on the
  // device model OR the manufacturer name. Sorted manufacturer-then-model (no
  // "your catalogue first" tiering yet — later slice). Optional manufacturerId
  // filter for the catalogue admin's manufacturer rail (spec §3.1); usage count
  // (`_count.assets`) is a CROSS-TENANT aggregate, shown only in the internal
  // catalogue area (spec §0.1 flag 7).
  async search(query?: string, manufacturerId?: string) {
    const q = query?.trim()
    const where: Prisma.DeviceTypeWhereInput = {
      ...(manufacturerId ? { manufacturerId } : {}),
      ...(q
        ? {
            OR: [
              { model: { contains: q, mode: "insensitive" } },
              { manufacturer: { is: { name: { contains: q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    }

    return this.prisma.deviceType.findMany({
      where,
      include: { manufacturer: true, _count: { select: { assets: true } } },
      orderBy: [{ manufacturer: { name: "asc" } }, { model: "asc" }],
    })
  }

  // The manufacturer rail: every manufacturer + its device-type count (spec §3.1).
  async listManufacturers() {
    return this.prisma.manufacturer.findMany({
      include: { _count: { select: { deviceTypes: true } } },
      orderBy: { name: "asc" },
    })
  }

  async getOne(id: string) {
    const type = await this.prisma.deviceType.findUnique({
      where: { id },
      include: { manufacturer: true, _count: { select: { assets: true } } },
    })
    if (!type) throw new NotFoundException("Device type not found")
    return type
  }

  // Manual device-type creation. Accepts either an existing manufacturerId or a
  // manufacturer name to find-or-create. Always isSeeded=false (user entry).
  async create(dto: {
    manufacturerId?: string
    manufacturerName?: string
    model: string
    uHeight?: number
    isFullDepth?: boolean
    powerDrawW?: number
    partNumber?: string
    weightKg?: number
    airflow?: DeviceAirflow
    category?: string
    excludeFromUtilization?: boolean
    deratePct?: number
  }) {
    const model = dto.model?.trim()
    if (!model) throw new BadRequestException("model is required")

    const manufacturer = await this.resolveManufacturer(dto)

    // Slug is globally unique; derive it from manufacturer-slug + model so it is
    // collision-free by construction (same uniqueness as [manufacturerId, model]).
    const slug = `${manufacturer.slug}-${this.slugify(model)}`

    try {
      const created = await this.prisma.deviceType.create({
        data: {
          manufacturerId: manufacturer.id,
          model,
          slug,
          uHeight: dto.uHeight ?? null,
          isFullDepth: dto.isFullDepth ?? true,
          powerDrawW: dto.powerDrawW ?? null,
          partNumber: dto.partNumber?.trim() || null,
          weightKg: dto.weightKg ?? null,
          airflow: dto.airflow ?? null,
          category: dto.category?.trim() || null,
          excludeFromUtilization: dto.excludeFromUtilization ?? false,
          deratePct: dto.deratePct ?? null,
          isSeeded: false,
        },
        include: { manufacturer: true, _count: { select: { assets: true } } },
      })
      return created
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new BadRequestException(
          `A device type "${model}" already exists for ${manufacturer.name}.`,
        )
      }
      throw e
    }
  }

  // Patch a device type (SERVICE_MANAGER+; role gate at the controller). Editing a
  // type NEVER rewrites the assets that reference it — the denormalised spec copies
  // on Asset are authoritative for display (spec §3.3). Seeded types are editable
  // (the seeder only ever creates), so no isSeeded guard here.
  async update(id: string, dto: {
    model?: string
    uHeight?: number | null
    isFullDepth?: boolean
    powerDrawW?: number | null
    partNumber?: string | null
    weightKg?: number | null
    airflow?: DeviceAirflow | null
    category?: string | null
    excludeFromUtilization?: boolean
    deratePct?: number | null
  }) {
    const existing = await this.prisma.deviceType.findUnique({
      where: { id },
      include: { manufacturer: true },
    })
    if (!existing) throw new NotFoundException("Device type not found")

    // Model rename re-derives the slug (kept collision-free by construction).
    const model = dto.model?.trim()
    const slug = model && model !== existing.model
      ? `${existing.manufacturer.slug}-${this.slugify(model)}`
      : existing.slug

    try {
      return await this.prisma.deviceType.update({
        where: { id },
        data: {
          model: model ?? existing.model,
          slug,
          uHeight: dto.uHeight !== undefined ? dto.uHeight : existing.uHeight,
          isFullDepth: dto.isFullDepth !== undefined ? dto.isFullDepth : existing.isFullDepth,
          powerDrawW: dto.powerDrawW !== undefined ? dto.powerDrawW : existing.powerDrawW,
          partNumber: dto.partNumber !== undefined ? (dto.partNumber?.trim() || null) : existing.partNumber,
          weightKg: dto.weightKg !== undefined ? dto.weightKg : existing.weightKg,
          airflow: dto.airflow !== undefined ? dto.airflow : existing.airflow,
          category: dto.category !== undefined ? (dto.category?.trim() || null) : existing.category,
          excludeFromUtilization: dto.excludeFromUtilization !== undefined ? dto.excludeFromUtilization : existing.excludeFromUtilization,
          deratePct: dto.deratePct !== undefined ? dto.deratePct : existing.deratePct,
        },
        include: { manufacturer: true, _count: { select: { assets: true } } },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new BadRequestException(`A device type "${model}" already exists for ${existing.manufacturer.name}.`)
      }
      throw e
    }
  }

  // Delete — blocked (409) while any asset references the type (spec §3.3); the
  // Asset.deviceTypeId FK is onDelete:SetNull, so this guard, not the DB, is what
  // preserves the "in use by N assets" contract. Stored images are cleaned up.
  async remove(id: string) {
    const type = await this.prisma.deviceType.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    })
    if (!type) throw new NotFoundException("Device type not found")
    if (type._count.assets > 0) {
      throw new ConflictException(`In use by ${type._count.assets} asset(s) — cannot delete.`)
    }
    await Promise.all(
      [type.frontImageKey, type.rearImageKey]
        .filter((k): k is string => !!k)
        .map((k) => this.storage.deleteObject(k).catch(() => undefined)),
    )
    await this.prisma.deviceType.delete({ where: { id } })
    return { ok: true }
  }

  // Store a front/rear elevation image DIRECTLY on the DeviceType (NOT the
  // client-scoped Attachment model — the catalogue is global; spec §3.2). Bytes
  // are magic-byte validated (raster only — PDF/SVG rejected) and stored via the
  // provider-agnostic StorageService; the old object (if any) is removed.
  async setImage(id: string, face: ImageFace, file: Express.Multer.File) {
    const type = await this.prisma.deviceType.findUnique({ where: { id } })
    if (!type) throw new NotFoundException("Device type not found")
    if (!file?.buffer?.length) throw new BadRequestException("No file uploaded")
    if (file.buffer.length > MAX_ATTACHMENT_BYTES) throw new BadRequestException("File too large")

    const mime = sniffContentType(file.buffer)
    if (!mime || mime === "application/pdf") {
      throw new BadRequestException("Only PNG, JPEG, GIF or WebP images are accepted")
    }

    const ext = EXT_BY_MIME[mime]
    const key = `device-types/${id}/${face}.${ext}`
    await this.storage.putObject(key, file.buffer, mime)

    const oldKey = face === "front" ? type.frontImageKey : type.rearImageKey
    const updated = await this.prisma.deviceType.update({
      where: { id },
      data: face === "front"
        ? { frontImageKey: key, frontImageType: mime }
        : { rearImageKey: key, rearImageType: mime },
      include: { manufacturer: true, _count: { select: { assets: true } } },
    })
    if (oldKey && oldKey !== key) await this.storage.deleteObject(oldKey).catch(() => undefined)
    return updated
  }

  // Open a stored image for streaming (global read — any authed user; spec §3.2).
  async openImage(id: string, face: ImageFace) {
    const type = await this.prisma.deviceType.findUnique({ where: { id } })
    if (!type) throw new NotFoundException("Device type not found")
    const key = face === "front" ? type.frontImageKey : type.rearImageKey
    const contentType = face === "front" ? type.frontImageType : type.rearImageType
    if (!key) throw new NotFoundException("No image for this face")
    const stream = await this.storage.getObject(key)
    return { stream, contentType: contentType ?? "application/octet-stream" }
  }

  // Find-or-create the manufacturer. An id (if given) must resolve; otherwise a
  // name is matched case-insensitively and created (with a derived slug) if new.
  private async resolveManufacturer(dto: { manufacturerId?: string; manufacturerName?: string }) {
    if (dto.manufacturerId) {
      const mfr = await this.prisma.manufacturer.findUnique({ where: { id: dto.manufacturerId } })
      if (!mfr) throw new NotFoundException("Manufacturer not found")
      return mfr
    }

    const name = dto.manufacturerName?.trim()
    if (!name) throw new BadRequestException("Provide manufacturerId or manufacturerName")

    const existing = await this.prisma.manufacturer.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    })
    if (existing) return existing

    const slug = this.slugify(name)
    try {
      return await this.prisma.manufacturer.create({ data: { name, slug } })
    } catch (e) {
      // Lost a race, or slug collides with a differently-named manufacturer.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await this.prisma.manufacturer.findFirst({
          where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] },
        })
        if (again) return again
        throw new BadRequestException(`Could not create manufacturer "${name}" (slug conflict).`)
      }
      throw e
    }
  }
}
