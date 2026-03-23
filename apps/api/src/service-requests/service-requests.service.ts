import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ServiceRequestStatus } from "@prisma/client";

type ListFilters = {
  dateFrom?: string;
  dateTo?: string;
  assigneeId?: string;
};

function makeRef() {
  const d = new Date();
  const y = d.getFullYear();
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `SR-${y}-${n}`;
}

@Injectable()
export class ServiceRequestsService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  async listForClient(clientId: string, filters: ListFilters = {}) {
    this.assertClientScope(clientId);
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo);
    return this.prisma.serviceRequest.findMany({
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
    return rows.map((sr) => ({
      reference: sr.reference,
      subject: sr.subject,
      status: sr.status,
      priority: sr.priority,
      assignee: sr.assignee?.email ?? "",
      createdAt: sr.createdAt.toISOString(),
      updatedAt: sr.updatedAt.toISOString(),
      closureSummary: sr.closureSummary ?? ""
    }));
  }

  async createForClient(clientId: string, createdById: string | null, dto: any) {
    this.assertClientScope(clientId);
    const sr = await this.prisma.serviceRequest.create({
      data: {
        reference: makeRef(),
        clientId,
        subject: dto.subject,
        description: dto.description,
        priority: dto.priority ?? "medium",
        createdById
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "ServiceRequest",
        entityId: sr.id,
        action: "CREATED",
        actorUserId: createdById ?? undefined,
        clientId,
        data: { reference: sr.reference, subject: sr.subject },
        serviceRequestId: sr.id
      }
    });

    return sr;
  }

  async getForClient(clientId: string, id: string) {
  this.assertClientScope(clientId);
  const sr = await this.prisma.serviceRequest.findFirst({
    where: { id, clientId },
    include: {
      assignee: { select: { id: true, email: true } },
      client: { select: { id: true, name: true } },
      auditEvents: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!sr) throw new NotFoundException("Service Request not found");
  return sr;
}

async updateStatusForClient(
  clientId: string,
  id: string,
  actorUserId: string,
  dto: { status: string; closureSummary?: string }
) {
  this.assertClientScope(clientId);

  if (
    dto.status === ServiceRequestStatus.CLOSED ||
    dto.status === ServiceRequestStatus.COMPLETED
  ) {
    if (!dto.closureSummary || dto.closureSummary.trim().length < 5) {
      throw new BadRequestException("Closure summary required to close a Service Request.");
    }
  }

  const sr = await this.getForClient(clientId, id);

  const updated = await this.prisma.serviceRequest.update({
    where: { id: sr.id },
    data: {
      status: dto.status as ServiceRequestStatus,
      closureSummary: dto.closureSummary
    }
  });

  await this.prisma.auditEvent.create({
    data: {
      entityType: "ServiceRequest",
      entityId: sr.id,
      action: "STATUS_UPDATED",
      actorUserId,
      clientId,
      data: { from: sr.status, to: dto.status },
      serviceRequestId: sr.id
    }
  });

  return updated;
}

async updateForClient(
  clientId: string,
  id: string,
  actorUserId: string,
  dto: { assigneeId?: string; priority?: string }
) {
  this.assertClientScope(clientId);
  const sr = await this.getForClient(clientId, id);

  const updated = await this.prisma.serviceRequest.update({
    where: { id: sr.id },
    data: {
      assigneeId: dto.assigneeId,
      priority: dto.priority
    }
  });

  await this.prisma.auditEvent.create({
    data: {
      entityType: "ServiceRequest",
      entityId: sr.id,
      action: "UPDATED",
      actorUserId,
      clientId,
      data: dto,
      serviceRequestId: sr.id
    }
  });

  return updated;
}

  async closeForClient(clientId: string, id: string, actorUserId: string, closureSummary: string) {
    this.assertClientScope(clientId);
    if (!closureSummary || closureSummary.trim().length < 5) {
      throw new BadRequestException("Closure summary is required to close a Service Request.");
    }

    const sr = await this.getForClient(clientId, id);

    const updated = await this.prisma.serviceRequest.update({
      where: { id: sr.id },
      data: {
        status: ServiceRequestStatus.CLOSED,
        closureSummary
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "ServiceRequest",
        entityId: sr.id,
        action: "CLOSED",
        actorUserId,
        clientId,
        data: { closureSummary },
        serviceRequestId: sr.id
      }
    });

    return updated;
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
