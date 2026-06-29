import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationType, Role, TaskStatus } from "@prisma/client";
import { resolveLinkedRecords } from "../record-links/resolve-links";
import { resolveAttachments } from "../attachments/resolve-attachments";
import { resolveCreator } from "../users/creator";
import { toUserDisplay, userDisplaySelect } from "../users/display";
import { diffRecord, type FieldSpec } from "../audit-events/diff-record";
import { emitAudit } from "../audit-events/emit-audit";
import { emitNotification } from "../notifications/emit-notification";
import { applyAssignedScope, type ScopeViewer } from "../auth/role-scope";
import { resolvedAtUpdate, TASK_RESOLVED_STATUSES } from "../metrics/resolved-status";

function makeRef() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 9000) + 1000
  return `TSK-${y}-${n}`
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
}

const TASK_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done"
}

// Per-field humanisation for Task updates. `status` changes via the status endpoint
// (STATUS_UPDATED). `dueAt` (date) is omitted — the shared diffRecord has no date kind.
const TASK_FIELD_SPEC: FieldSpec = {
  title: { label: "Title", kind: "scalar" },
  description: { label: "Description", kind: "scalar" },
  priority: { label: "Priority", kind: "enum", labels: PRIORITY_LABELS },
  assigneeId: { label: "Assignee", kind: "ref" }
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

  async listForClient(clientId: string, viewer: ScopeViewer, filters: ListFilters = {}) {
    this.assertClientScope(clientId);
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo);
    const rows = await this.prisma.task.findMany({
      where: applyAssignedScope(
        {
          clientId,
          assigneeId: filters.assigneeId || undefined,
          linkedEntityType: filters.linkedEntityType || undefined,
          linkedEntityId: filters.linkedEntityId || undefined,
          createdAt
        },
        viewer
      ),
      orderBy: { updatedAt: "desc" },
      include: {
        assignee: {
          select: userDisplaySelect
        },
        incident: {
          select: { id: true, reference: true, title: true }
        }
      }
    });
    return rows.map((r) => ({ ...r, assignee: toUserDisplay(r.assignee) }));
  }

  async exportCsvForClient(clientId: string, viewer: ScopeViewer, filters: ListFilters = {}) {
    const rows = await this.listForClient(clientId, viewer, filters);
    return rows.map((task) => ({
      title: task.title,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee?.displayName ?? "",
      incidentReference: task.incident?.reference ?? "",
      dueAt: task.dueAt ? task.dueAt.toISOString() : "",
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    }));
  }

  async getForClient(clientId: string, id: string, viewer: ScopeViewer) {
    this.assertClientScope(clientId);
    const task = await this.prisma.task.findFirst({
      where: applyAssignedScope({ id, clientId }, viewer),
      include: {
        incident: true,
        assignee: { select: userDisplaySelect }
      }
    });
    if (!task) throw new NotFoundException("Task not found");
    const createdBy = await resolveCreator(this.prisma, task.createdById);
    const links = await resolveLinkedRecords(this.prisma, clientId, "task", task.id);
    const attachments = await resolveAttachments(this.prisma, clientId, "task", task.id);
    return { ...task, assignee: toUserDisplay(task.assignee), createdBy, links, attachments };
  }

  async createForClient(
    clientId: string,
    actorUserId: string,
    dto: {
      title: string
      description?: string
      priority?: string
      dueAt?: string | null
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
            ...(dto.dueAt !== undefined && { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
            incidentId: dto.incidentId,
            assigneeId: dto.assigneeId,
            linkedEntityType: dto.linkedEntityType,
            linkedEntityId: dto.linkedEntityId,
            createdById: actorUserId
          },
          include: {
            assignee: { select: userDisplaySelect },
            incident: { select: { id: true, reference: true, title: true } }
          }
        })

        await emitAudit(this.prisma, {
          entityType: "Task",
          entityId: task.id,
          action: "CREATED",
          actorUserId,
          clientId,
          reference: task.reference,
          title: task.title
        })

        return { ...task, assignee: toUserDisplay(task.assignee) }
      }
    }
    throw new BadRequestException("Could not generate unique reference")
  }

  async updateStatusForClient(
    clientId: string,
    id: string,
    status: TaskStatus,
    actorUserId: string,
    viewer: ScopeViewer,
    comment?: string
  ) {
    const task = await this.getForClient(clientId, id, viewer);
    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: { status, ...resolvedAtUpdate(task.status, status, TASK_RESOLVED_STATUSES) },
      include: {
        incident: {
          select: { id: true, reference: true, title: true }
        }
      }
    });

    await emitAudit(this.prisma, {
      entityType: "Task",
      entityId: task.id,
      action: "STATUS_UPDATED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "status",
          label: "Status",
          from: TASK_STATUS_LABELS[task.status] ?? task.status,
          to: TASK_STATUS_LABELS[status] ?? status
        }
      ],
      comment: comment?.trim() || null
    });

    // Notify the current assignee that the status moved. Best-effort; self-skip in helper.
    await emitNotification(this.prisma, {
      type: NotificationType.STATUS_CHANGED,
      recipientIds: [task.assigneeId],
      actorId: actorUserId,
      clientId,
      sourceType: "Task",
      sourceId: task.id
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

    async updateForClient(clientId: string, id: string, actorUserId: string, dto: {
    title?: string
    description?: string
    priority?: string
    dueAt?: string | null
    assigneeId?: string
  }, viewer: ScopeViewer) {
    const task = await this.getForClient(clientId, id, viewer)

    // Assignee lock (rule B): an ENGINEER may edit other fields but never reassign.
    if (viewer.role === Role.ENGINEER && dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      throw new ForbiddenException("Engineers cannot change the assignee")
    }

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        ...(dto.dueAt !== undefined && { dueAt: dto.dueAt ? new Date(dto.dueAt) : null }),
        assigneeId: dto.assigneeId ?? null
      },
      include: {
        assignee: { select: userDisplaySelect },
        incident: { select: { id: true, reference: true, title: true } }
      }
    })

    const newAssignee = toUserDisplay(updated.assignee)
    // Resolve assignee ids -> display names from rows already in hand (old via getForClient, new
    // via the update include) — no extra lookup; humanised at emit time.
    const assigneeNames = new Map<string, string>()
    if (task.assignee) assigneeNames.set(task.assignee.id, task.assignee.displayName)
    if (newAssignee) assigneeNames.set(newAssignee.id, newAssignee.displayName)

    const changes = diffRecord(task, dto, TASK_FIELD_SPEC, {
      assigneeId: (id) => (id ? assigneeNames.get(id) ?? null : null)
    })

    if (changes.length) {
      await emitAudit(this.prisma, {
        entityType: "Task",
        entityId: task.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        changes
      })
    }

    // Notify the new assignee on a real (re)assignment. Best-effort; self-assign is
    // skipped inside the helper (recipient === actor).
    if (updated.assigneeId && updated.assigneeId !== task.assigneeId) {
      await emitNotification(this.prisma, {
        type: NotificationType.ASSIGNED,
        recipientIds: [updated.assigneeId],
        actorId: actorUserId,
        clientId,
        sourceType: "Task",
        sourceId: task.id
      })
    }

    return { ...updated, assignee: newAssignee }
  }
}
