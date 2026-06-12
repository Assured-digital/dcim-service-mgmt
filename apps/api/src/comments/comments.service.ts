import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { toUserDisplay, userDisplaySelect, type UserDisplayPick } from "../users/display"

// Every comment read includes the author via this select; mapComment swaps it to { id, displayName }.
const authorInclude = { author: { select: userDisplaySelect } } as const

function mapComment<T extends { author: UserDisplayPick | null }>(comment: T) {
  return { ...comment, author: toUserDisplay(comment.author) }
}

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async listForEntity(entityType: string, entityId: string) {
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
      include: authorInclude
    })
    return rows.map(mapComment)
  }

  async createWorkNote(authorId: string, dto: {
    entityType: string
    entityId: string
    body: string
    serviceRequestId?: string
  }) {
    const comment = await this.prisma.comment.create({
      data: {
        authorId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        body: dto.body,
        type: "WORK_NOTE",
        visibleToCustomer: false,
        fromCustomer: false,
        serviceRequestId: dto.serviceRequestId
      },
      include: authorInclude
    })
    return mapComment(comment)
  }

  async createCustomerUpdate(authorId: string, dto: {
    entityType: string
    entityId: string
    body: string
    fromCustomer?: boolean
    serviceRequestId?: string
  }) {
    const comment = await this.prisma.comment.create({
      data: {
        authorId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        body: dto.body,
        type: "CUSTOMER_UPDATE",
        visibleToCustomer: true,
        fromCustomer: dto.fromCustomer ?? false,
        serviceRequestId: dto.serviceRequestId
      },
      include: authorInclude
    })
    return mapComment(comment)
  }

  async listWorkNotes(entityType: string, entityId: string) {
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId, type: "WORK_NOTE" },
      orderBy: { createdAt: "asc" },
      include: authorInclude
    })
    return rows.map(mapComment)
  }

  async listCustomerUpdates(entityType: string, entityId: string) {
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId, type: "CUSTOMER_UPDATE" },
      orderBy: { createdAt: "asc" },
      include: authorInclude
    })
    return rows.map(mapComment)
  }
}