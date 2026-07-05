import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

// User-defined asset field schema (register power-features). Per client; drives
// the register's "Additional properties" + the asset detail card. Values live on
// Asset.customValues. Direct clientId scoping — the standard chokepoint.
export const CUSTOM_FIELD_TYPES = ["text", "number", "select", "date"] as const
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number]

// Normalise a label into a stable map key (snake_case, ascii). Keeps customValues
// keys human-legible and diff-friendly.
function toKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "field"
}

@Injectable()
export class AssetCustomFieldsService {
  constructor(private prisma: PrismaService) {}

  private assertScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async list(clientId: string) {
    this.assertScope(clientId)
    return this.prisma.assetCustomField.findMany({
      where: { clientId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    })
  }

  async create(clientId: string, dto: { label: string; type: string; options?: string[] }) {
    this.assertScope(clientId)
    const label = dto.label?.trim()
    if (!label) throw new BadRequestException("A field label is required")
    if (!(CUSTOM_FIELD_TYPES as readonly string[]).includes(dto.type)) throw new BadRequestException("Unknown field type")
    const options = dto.type === "select" ? (dto.options ?? []).map((o) => o.trim()).filter(Boolean) : []
    if (dto.type === "select" && options.length === 0) throw new BadRequestException("A select field needs at least one option")

    // Unique key per client — suffix on collision so two "Owner" fields coexist.
    const base = toKey(label)
    let key = base
    for (let i = 2; await this.prisma.assetCustomField.findUnique({ where: { clientId_key: { clientId, key } } }); i++) {
      key = `${base}_${i}`
    }
    const max = await this.prisma.assetCustomField.aggregate({ where: { clientId }, _max: { order: true } })
    return this.prisma.assetCustomField.create({
      data: { clientId, key, label, type: dto.type, options, order: (max._max.order ?? 0) + 1 },
    })
  }

  async update(clientId: string, id: string, dto: { label?: string; options?: string[]; order?: number }) {
    this.assertScope(clientId)
    const field = await this.prisma.assetCustomField.findFirst({ where: { id, clientId } })
    if (!field) throw new NotFoundException("Field not found")
    return this.prisma.assetCustomField.update({
      where: { id: field.id },
      data: {
        label: dto.label?.trim() || field.label,
        // Options only meaningful for select; ignore for other types.
        options: field.type === "select" && dto.options ? dto.options.map((o) => o.trim()).filter(Boolean) : field.options,
        order: dto.order ?? field.order,
      },
    })
  }

  // Removing a definition leaves any stored values orphaned in customValues
  // (harmless — they're simply not surfaced). Kept simple; no value sweep.
  async remove(clientId: string, id: string) {
    this.assertScope(clientId)
    const field = await this.prisma.assetCustomField.findFirst({ where: { id, clientId } })
    if (!field) throw new NotFoundException("Field not found")
    await this.prisma.assetCustomField.delete({ where: { id: field.id } })
    return { ok: true }
  }
}
