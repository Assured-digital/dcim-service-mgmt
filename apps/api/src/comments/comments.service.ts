import { Injectable, NotFoundException } from "@nestjs/common"
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

  async create(authorId: string, dto: {
    entityType: string
    entityId: string
    body: string
  }) {
    return this.prisma.comment.create({
      data: {
        authorId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        body: dto.body
      },
      include: {
        author: { select: { id: true, email: true } }
      }
    })
  }
}