import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TaskStatus } from "@prisma/client";

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  async listForClient(clientId: string) {
    this.assertClientScope(clientId);
    return this.prisma.task.findMany({
      where: { clientId },
      orderBy: { updatedAt: "desc" },
      include: {
        incident: {
          select: { id: true, reference: true, title: true }
        }
      }
    });
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
    dto: { title: string; description?: string; priority?: string; dueAt?: string; incidentId?: string }
  ) {
    this.assertClientScope(clientId);

    if (dto.incidentId) {
      const incident = await this.prisma.incident.findFirst({
        where: { id: dto.incidentId, clientId }
      });
      if (!incident) throw new BadRequestException("Incident is invalid for this client scope.");
    }

    return this.prisma.task.create({
      data: {
        clientId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? "medium",
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        incidentId: dto.incidentId,
        createdById: actorUserId
      },
      include: {
        incident: {
          select: { id: true, reference: true, title: true }
        }
      }
    });
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
}
