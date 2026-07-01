import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../prisma/prisma.service"

// The hardware catalogue is GLOBAL (not client-scoped) — a "Dell PowerEdge R740"
// is the same for every tenant. So there is deliberately no clientId filtering
// here (unlike every tenant-scoped service). Tenant isolation stays on Asset,
// which merely references a DeviceType.
@Injectable()
export class DeviceTypesService {
  constructor(private prisma: PrismaService) {}

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  }

  // Flat search across the whole catalogue, manufacturer inlined. Matches on the
  // device model OR the manufacturer name. Sorted manufacturer-then-model (no
  // "your catalogue first" tiering yet — later slice).
  async search(query?: string) {
    const q = query?.trim()
    const where: Prisma.DeviceTypeWhereInput = q
      ? {
          OR: [
            { model: { contains: q, mode: "insensitive" } },
            { manufacturer: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}

    return this.prisma.deviceType.findMany({
      where,
      include: { manufacturer: true },
      orderBy: [{ manufacturer: { name: "asc" } }, { model: "asc" }],
    })
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
          isSeeded: false,
        },
        include: { manufacturer: true },
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
