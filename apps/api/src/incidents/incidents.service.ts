import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IncidentSeverity, IncidentStatus } from "@prisma/client";

function makeIncidentRef() {
  const y = new Date().getFullYear();
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `IN-${y}-${n}`;
}

@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId);
    return this.prisma.incident.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" }
    });
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId);
    const incident = await this.prisma.incident.findFirst({
      where: { id, clientId }
    });
    if (!incident) throw new NotFoundException("Incident not found");
    return incident;
  }

  async createForClient(
    clientId: string,
    actorUserId: string,
    dto: { title: string; description: string; severity?: IncidentSeverity; priority?: string }
  ) {
    this.assertClientScope(clientId);
    const reference = await this.generateUniqueReference();

    return this.prisma.incident.create({
      data: {
        reference,
        clientId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity ?? IncidentSeverity.MEDIUM,
        priority: dto.priority ?? "medium",
        createdById: actorUserId
      }
    });
  }

  async updateStatusForClient(
    clientId: string,
    id: string,
    status: IncidentStatus,
    actorUserId: string,
    comment?: string
  ) {
    const incident = await this.getForClient(clientId, id);
    const updated = await this.prisma.incident.update({
      where: { id: incident.id },
      data: { status }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Incident",
        entityId: incident.id,
        action: "STATUS_UPDATED",
        actorUserId,
        clientId,
        data: {
          from: incident.status,
          to: status,
          comment: comment?.trim() || null
        }
      }
    });

    return updated;
  }

  private async generateUniqueReference() {
    for (let i = 0; i < 10; i += 1) {
      const reference = makeIncidentRef();
      const exists = await this.prisma.incident.findUnique({ where: { reference } });
      if (!exists) return reference;
    }
    throw new BadRequestException("Could not generate unique incident reference");
  }
}
