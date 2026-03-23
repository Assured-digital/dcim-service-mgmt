import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async listForEntity(entityType: string, entityId: string) {
    return this.prisma.comment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, email: true } }
      }
    })
  }

  async createWorkNote(authorId: string, dto: {
    entityType: string
    entityId: string
    body: string
    serviceRequestId?: string
  }) {
    return this.prisma.comment.create({
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
      include: { author: { select: { id: true, email: true } } }
    })
  }

  async createCustomerUpdate(authorId: string, dto: {
    entityType: string
    entityId: string
    body: string
    fromCustomer?: boolean
    serviceRequestId?: string
  }) {
    return this.prisma.comment.create({
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
      include: { author: { select: { id: true, email: true } } }
    })
  }

  async listWorkNotes(entityType: string, entityId: string) {
    return this.prisma.comment.findMany({
      where: { entityType, entityId, type: "WORK_NOTE" },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, email: true } } }
    })
  }

  async listCustomerUpdates(entityType: string, entityId: string) {
    return this.prisma.comment.findMany({
      where: { entityType, entityId, type: "CUSTOMER_UPDATE" },
      orderBy: { createdAt: "asc" },
      include: { author: { select: { id: true, email: true } } }
    })
  }
}