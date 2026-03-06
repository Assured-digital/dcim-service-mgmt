import { Injectable } from "@nestjs/common";
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
    const created = await this.prisma.requestIntake.create({
      data: {
        clientId,
        requesterUserId: requester.userId,
        requesterName: requester.email,
        requesterEmail: requester.email,
        title: dto.title,
        description: dto.description,
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

