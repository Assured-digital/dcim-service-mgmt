import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { toUserDisplay, userDisplaySelect, type UserDisplayPick } from "../users/display"
import { assertEntityInScope } from "./resolve-comment-scope"

// Every comment read includes the author via this select; mapComment swaps it to { id, displayName }.
const authorInclude = { author: { select: userDisplaySelect } } as const

function mapComment<T extends { author: UserDisplayPick | null }>(comment: T) {
  return { ...comment, author: toUserDisplay(comment.author) }
}

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async listForEntity(clientId: string, entityType: string, entityId: string) {
    await assertEntityInScope(this.prisma, clientId, entityType, entityId)
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
      include: authorInclude
    })
    return rows.map(mapComment)
  }

  async createWorkNote(clientId: string, authorId: string, dto: {
    entityType: string
    entityId: string
    body: string
    serviceRequestId?: string
  }) {
    await assertEntityInScope(this.prisma, clientId, dto.entityType, dto.entityId)
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

  async createCustomerUpdate(clientId: string, authorId: string, dto: {
    entityType: string
    entityId: string
    body: string
    fromCustomer?: boolean
    serviceRequestId?: string
  }) {
    await assertEntityInScope(this.prisma, clientId, dto.entityType, dto.entityId)
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

  async listWorkNotes(clientId: string, entityType: string, entityId: string) {
    await assertEntityInScope(this.prisma, clientId, entityType, entityId)
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId, type: "WORK_NOTE" },
      orderBy: { createdAt: "asc" },
      include: authorInclude
    })
    return rows.map(mapComment)
  }

  async listCustomerUpdates(clientId: string, entityType: string, entityId: string) {
    await assertEntityInScope(this.prisma, clientId, entityType, entityId)
    const rows = await this.prisma.comment.findMany({
      where: { entityType, entityId, type: "CUSTOMER_UPDATE" },
      orderBy: { createdAt: "asc" },
      include: authorInclude
    })
    return rows.map(mapComment)
  }
}