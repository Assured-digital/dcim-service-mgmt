import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { emitAudit } from "../audit-events/emit-audit"
import { CreateContactDto, UpdateContactDto } from "./dto"

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope")
  }

  async listForClient(clientId: string, filters?: { status?: string; category?: string; siteId?: string }) {
    this.assertClientScope(clientId)
    return this.prisma.contact.findMany({
      where: {
        clientId,
        status: filters?.status ?? undefined,
        category: filters?.category ?? undefined,
        siteId: filters?.siteId ?? undefined
      },
      orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
      include: { site: { select: { id: true, name: true } } }
    })
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId)
    const contact = await this.prisma.contact.findFirst({
      where: { id, clientId },
      include: { site: { select: { id: true, name: true } } }
    })
    if (!contact) throw new NotFoundException("Contact not found")
    return contact
  }

  async createForClient(clientId: string, actorUserId: string, dto: CreateContactDto) {
    this.assertClientScope(clientId)
    await this.assertSiteInScope(clientId, dto.siteId)

    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary) await this.demoteCurrentPrimary(tx, clientId)
      return tx.contact.create({
        data: {
          clientId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          jobTitle: dto.jobTitle,
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone,
          mobile: dto.mobile,
          siteId: dto.siteId,
          category: dto.category ?? "GENERAL",
          isPrimary: dto.isPrimary ?? false,
          notes: dto.notes
        }
      })
    })

    await emitAudit(this.prisma, {
      entityType: "Contact",
      entityId: contact.id,
      action: "CREATED",
      actorUserId,
      clientId,
      title: `${contact.firstName} ${contact.lastName}`
    })

    return contact
  }

  async updateForClient(clientId: string, actorUserId: string, id: string, dto: UpdateContactDto) {
    this.assertClientScope(clientId)
    const existing = await this.getForClient(clientId, id)
    if (dto.siteId !== undefined) await this.assertSiteInScope(clientId, dto.siteId ?? undefined)

    const contact = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary && !existing.isPrimary) await this.demoteCurrentPrimary(tx, clientId)
      return tx.contact.update({
        // clientId re-checked by getForClient above; update by id within the verified row
        where: { id: existing.id },
        data: {
          firstName: dto.firstName?.trim(),
          lastName: dto.lastName?.trim(),
          jobTitle: dto.jobTitle,
          email: dto.email !== undefined ? dto.email?.trim().toLowerCase() : undefined,
          phone: dto.phone,
          mobile: dto.mobile,
          siteId: dto.siteId,
          category: dto.category,
          isPrimary: dto.isPrimary,
          notes: dto.notes,
          status: dto.status
        }
      })
    })

    await emitAudit(this.prisma, {
      entityType: "Contact",
      entityId: contact.id,
      action: "UPDATED",
      actorUserId,
      clientId,
      title: `${contact.firstName} ${contact.lastName}`
    })

    return contact
  }

  // Single primary contact per client: promoting one demotes the incumbent.
  private async demoteCurrentPrimary(tx: Pick<PrismaService, "contact">, clientId: string) {
    await tx.contact.updateMany({ where: { clientId, isPrimary: true }, data: { isPrimary: false } })
  }

  private async assertSiteInScope(clientId: string, siteId?: string) {
    if (!siteId) return
    const site = await this.prisma.site.findFirst({ where: { id: siteId, clientId }, select: { id: true } })
    if (!site) throw new BadRequestException("Site not found for this client")
  }
}
