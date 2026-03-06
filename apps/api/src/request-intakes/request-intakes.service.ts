import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RequestIntakesService {
  constructor(private prisma: PrismaService) {}

  async listMine(clientId: string, requesterUserId: string) {
    return this.prisma.requestIntake.findMany({
      where: { clientId, requesterUserId },
      orderBy: { createdAt: "desc" }
    });
  }

  async createForClient(
    clientId: string,
    requester: { userId: string; email: string },
    dto: {
      title: string;
      description: string;
      category?: string;
      impact?: string;
      urgency?: string;
    }
  ) {
    const duplicateWindowStart = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
    const existing = await this.prisma.requestIntake.findFirst({
      where: {
        clientId,
        requesterUserId: requester.userId,
        title: {
          equals: dto.title.trim(),
          mode: "insensitive"
        },
        status: {
          in: ["NEW", "UNDER_REVIEW"]
        },
        createdAt: { gte: duplicateWindowStart }
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, status: true }
    });

    if (existing) {
      throw new ConflictException(
        `Similar request already exists (${existing.status.toLowerCase()}). Reuse triage item ${existing.id}.`
      );
    }

    const created = await this.prisma.requestIntake.create({
      data: {
        clientId,
        requesterUserId: requester.userId,
        requesterName: requester.email,
        requesterEmail: requester.email,
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        impact: dto.impact,
        urgency: dto.urgency,
        status: "NEW"
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "RequestIntake",
        entityId: created.id,
        action: "CREATED",
        actorUserId: requester.userId,
        clientId,
        data: {
          title: created.title,
          category: created.category ?? null
        }
      }
    });

    return created;
  }
}
