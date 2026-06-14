import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ServiceRequestStatus } from "@prisma/client";
import { resolveCreator } from "../users/creator";
import { toUserDisplay, userDisplaySelect } from "../users/display";
import { resolveLinkedRecords } from "../record-links/resolve-links";
import { resolveAttachments } from "../attachments/resolve-attachments";
import { diffRecord, type FieldSpec } from "../audit-events/diff-record";
import { emitAudit } from "../audit-events/emit-audit";

type ListFilters = {
  dateFrom?: string;
  dateTo?: string;
  assigneeId?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
};

function makeRef() {
  const d = new Date();
  const y = d.getFullYear();
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `SR-${y}-${n}`;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};

const SR_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  WAITING_CUSTOMER: "Waiting on customer",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled"
};

// Per-field humanisation for ServiceRequest updates. `status` changes via the status endpoint
// (STATUS_UPDATED). linkedEntityType/linkedEntityId are dead fields (superseded by RecordLink) —
// omitted so they never produce history noise.
const SR_FIELD_SPEC: FieldSpec = {
  subject: { label: "Subject", kind: "scalar" },
  description: { label: "Description", kind: "scalar" },
  priority: { label: "Priority", kind: "enum", labels: PRIORITY_LABELS },
  assigneeId: { label: "Assignee", kind: "ref" }
};

@Injectable()
export class ServiceRequestsService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  async listForClient(clientId: string, filters: ListFilters = {}) {
    this.assertClientScope(clientId);
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo);
    const rows = await this.prisma.serviceRequest.findMany({
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
          select: userDisplaySelect
        }
      }
    });
    return rows.map((r) => ({ ...r, assignee: toUserDisplay(r.assignee) }));
  }

  async exportCsvForClient(clientId: string, filters: ListFilters = {}) {
    const rows = await this.listForClient(clientId, filters);
    return rows.map((sr) => ({
      reference: sr.reference,
      subject: sr.subject,
      status: sr.status,
      priority: sr.priority,
      assignee: sr.assignee?.displayName ?? "",
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
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId,
        createdById
      }
    });

    await emitAudit(this.prisma, {
      entityType: "ServiceRequest",
      entityId: sr.id,
      action: "CREATED",
      actorUserId: createdById,
      clientId,
      reference: sr.reference,
      title: sr.subject
    });

    return sr;
  }

  async getForClient(clientId: string, id: string) {
  this.assertClientScope(clientId);
  const sr = await this.prisma.serviceRequest.findFirst({
    where: { id, clientId },
    include: {
      assignee: { select: userDisplaySelect },
      client: { select: { id: true, name: true } },
      auditEvents: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!sr) throw new NotFoundException("Service Request not found");
  const createdBy = await resolveCreator(this.prisma, sr.createdById);
  const links = await resolveLinkedRecords(this.prisma, clientId, "service_request", sr.id);
  const attachments = await resolveAttachments(this.prisma, clientId, "service_request", sr.id);
  return { ...sr, assignee: toUserDisplay(sr.assignee), createdBy, links, attachments };
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

  await emitAudit(this.prisma, {
    entityType: "ServiceRequest",
    entityId: sr.id,
    action: "STATUS_UPDATED",
    actorUserId,
    clientId,
    changes: [
      {
        field: "status",
        label: "Status",
        from: SR_STATUS_LABELS[sr.status] ?? sr.status,
        to: SR_STATUS_LABELS[dto.status] ?? dto.status
      }
    ],
    comment: dto.closureSummary?.trim() || null
  });

  return updated;
}

async updateForClient(
  clientId: string,
  id: string,
  actorUserId: string,
  dto: { subject?: string; description?: string; assigneeId?: string; priority?: string; linkedEntityType?: string; linkedEntityId?: string }
) {
  this.assertClientScope(clientId);
  const sr = await this.getForClient(clientId, id);

  const updated = await this.prisma.serviceRequest.update({
    where: { id: sr.id },
    data: {
      subject: dto.subject,
      description: dto.description,
      assigneeId: dto.assigneeId,
      priority: dto.priority,
      linkedEntityType: dto.linkedEntityType,
      linkedEntityId: dto.linkedEntityId
    },
    include: { assignee: { select: userDisplaySelect } }
  });

  const newAssignee = toUserDisplay(updated.assignee);
  // Resolve assignee ids -> display names from rows already in hand (old via getForClient, new via
  // the update include) — no extra lookup; humanised at emit time.
  const assigneeNames = new Map<string, string>();
  if (sr.assignee) assigneeNames.set(sr.assignee.id, sr.assignee.displayName);
  if (newAssignee) assigneeNames.set(newAssignee.id, newAssignee.displayName);

  const changes = diffRecord(sr, dto, SR_FIELD_SPEC, {
    assigneeId: (id) => (id ? assigneeNames.get(id) ?? null : null)
  });

  if (changes.length) {
    await emitAudit(this.prisma, {
      entityType: "ServiceRequest",
      entityId: sr.id,
      action: "UPDATED",
      actorUserId,
      clientId,
      changes
    });
  }

  return { ...updated, assignee: newAssignee };
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

    await emitAudit(this.prisma, {
      entityType: "ServiceRequest",
      entityId: sr.id,
      action: "CLOSED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "status",
          label: "Status",
          from: SR_STATUS_LABELS[sr.status] ?? sr.status,
          to: SR_STATUS_LABELS.CLOSED
        }
      ],
      comment: closureSummary.trim()
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
