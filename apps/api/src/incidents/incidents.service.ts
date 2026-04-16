import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IncidentSeverity, IncidentStatus } from "@prisma/client";

type ListFilters = {
  dateFrom?: string;
  dateTo?: string;
  assigneeId?: string;
};

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

  async listForClient(clientId: string, filters: ListFilters = {}) {
    this.assertClientScope(clientId);
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo);
    return this.prisma.incident.findMany({
      where: {
        clientId,
        assigneeId: filters.assigneeId || undefined,
        createdAt
      },
      orderBy: { updatedAt: "desc" },
      include: {
        assignee: {
          select: { id: true, email: true }
        }
      }
    });
  }

  async exportCsvForClient(clientId: string, filters: ListFilters = {}) {
    const rows = await this.listForClient(clientId, filters);
    return rows.map((incident) => ({
      reference: incident.reference,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      priority: incident.priority,
      assignee: incident.assignee?.email ?? "",
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString()
    }));
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId);
    const incident = await this.prisma.incident.findFirst({
      where: { id, clientId },
      include: {
        assignee: {
          select: { id: true, email: true }
        }
      }
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

    const created = await this.prisma.incident.create({
      data: {
        reference,
        clientId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity ?? IncidentSeverity.MEDIUM,
        priority: dto.priority ?? "medium",
        createdById: actorUserId
      },
      include: {
        assignee: {
          select: { id: true, email: true }
        }
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Incident",
        entityId: created.id,
        action: "CREATED",
        actorUserId,
        clientId,
        data: {
          reference: created.reference,
          title: created.title
        }
      }
    });

    return created;
  }

  async updateForClient(
    clientId: string,
    id: string,
    actorUserId: string,
    dto: {
      title?: string;
      description?: string;
      severity?: IncidentSeverity;
      priority?: string;
      assigneeId?: string;
    }
  ) {
    const incident = await this.getForClient(clientId, id);
    const updated = await this.prisma.incident.update({
      where: { id: incident.id },
      data: {
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        priority: dto.priority,
        assigneeId: dto.assigneeId === "" ? null : dto.assigneeId ?? undefined
      },
      include: {
        assignee: {
          select: { id: true, email: true }
        }
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Incident",
        entityId: incident.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        data: {
          fields: Object.keys(dto).filter((field) => (dto as Record<string, unknown>)[field] !== undefined)
        }
      }
    });

    return updated;
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

  private getCreatedAtRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return undefined;

    return {
      gte: dateFrom ? this.parseDate(dateFrom, "start") : undefined,
      lte: dateTo ? this.parseDate(dateTo, "end") : undefined
    };
  }

  private parseDate(value: string, boundary: "start" | "end") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      if (boundary === "start") date.setUTCHours(0, 0, 0, 0);
      else date.setUTCHours(23, 59, 59, 999);
    }
    return date;
  }
}
