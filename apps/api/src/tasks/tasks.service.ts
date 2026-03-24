import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TaskStatus } from "@prisma/client";

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `TSK-${y}-${n}`
}

type ListFilters = {
  dateFrom?: string;
  dateTo?: string;
  assigneeId?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
};

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  async listForClient(clientId: string, filters: ListFilters = {}) {
    this.assertClientScope(clientId);
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo);
    return this.prisma.task.findMany({
      where: {
        clientId,
        assigneeId: filters.assigneeId || undefined,
        linkedEntityType: filters.linkedEntityType || undefined,
        linkedEntityId: filters.linkedEntityId || undefined,
        createdAt
      },
      orderBy: { updatedAt: "desc" },
      include: {
        assignee: {
          select: { id: true, email: true }
        },
        incident: {
          select: { id: true, reference: true, title: true }
        }
      }
    });
  }

  async exportCsvForClient(clientId: string, filters: ListFilters = {}) {
    const rows = await this.listForClient(clientId, filters);
    return rows.map((task) => ({
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee?.email ?? "",
      incidentReference: task.incident?.reference ?? "",
      dueAt: task.dueAt ? task.dueAt.toISOString() : "",
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    }));
  }

  async getForClient(clientId: string, id: string) {
    this.assertClientScope(clientId);
    const task = await this.prisma.task.findFirst({
      where: { id, clientId },
      include: { incident: true }
    });
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }

  async createForClient(
    clientId: string,
    actorUserId: string,
    dto: {
      title: string
      description?: string
      priority?: string
      dueAt?: string
      incidentId?: string
      assigneeId?: string
      linkedEntityType?: string
      linkedEntityId?: string
    }
  ) {
    this.assertClientScope(clientId)

    if (dto.incidentId) {
      const incident = await this.prisma.incident.findFirst({
        where: { id: dto.incidentId, clientId }
      })
      if (!incident) throw new BadRequestException("Incident is invalid for this client scope.")
    }

    for (let i = 0; i < 10; i++) {
      const reference = makeRef()
      const exists = await this.prisma.task.findUnique({ where: { reference } })
      if (!exists) {
        const task = await this.prisma.task.create({
          data: {
            reference,
            clientId,
            title: dto.title,
            description: dto.description,
            priority: dto.priority ?? "medium",
            dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
            incidentId: dto.incidentId,
            assigneeId: dto.assigneeId,
            linkedEntityType: dto.linkedEntityType,
            linkedEntityId: dto.linkedEntityId,
            createdById: actorUserId
          },
          include: {
            assignee: { select: { id: true, email: true } },
            incident: { select: { id: true, reference: true, title: true } }
          }
        })

        await this.prisma.auditEvent.create({
          data: {
            entityType: "Task",
            entityId: task.id,
            action: "CREATED",
            actorUserId,
            clientId,
            data: { reference: task.reference, title: task.title }
          }
        })

        return task
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateStatusForClient(
    clientId: string,
    id: string,
    status: TaskStatus,
    actorUserId: string,
    comment?: string
  ) {
    const task = await this.getForClient(clientId, id);
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: { status },
      include: {
        incident: {
          select: { id: true, reference: true, title: true }
        }
      }
    });

    await this.prisma.auditEvent.create({
      data: {
        entityType: "Task",
        entityId: task.id,
        action: "STATUS_UPDATED",
        actorUserId,
        clientId,
        data: {
          from: task.status,
          to: status,
          comment: comment?.trim() || null
        }
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

    async updateForClient(clientId: string, id: string, dto: {
    title?: string
    description?: string
    priority?: string
    dueAt?: string
    assigneeId?: string
  }) {
    const task = await this.getForClient(clientId, id)
    return this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        assigneeId: dto.assigneeId ?? null
      },
      include: {
        assignee: { select: { id: true, email: true } },
        incident: { select: { id: true, reference: true, title: true } }
      }
    })
  }
}
