import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IncidentSeverity, IncidentStatus, Role } from "@prisma/client";
import { resolveCreator } from "../users/creator";
import { toUserDisplay, userDisplaySelect } from "../users/display";
import { resolveLinkedRecords } from "../record-links/resolve-links";
import { resolveAttachments } from "../attachments/resolve-attachments";
import { diffRecord, type FieldSpec } from "../audit-events/diff-record";
import { emitAudit } from "../audit-events/emit-audit";
import { emitNotification } from "../notifications/emit-notification";
import { NotificationType } from "@prisma/client";
import { resolveSlaHours, computeDueAt } from "../sla/sla";
import { applyAssignedScope, type ScopeViewer } from "../auth/role-scope";
import { buildListScope, TERMINAL_STATUSES, type ListScope } from "../common/list-scope";
import { resolvedAtUpdate, INCIDENT_RESOLVED_STATUSES } from "../metrics/resolved-status";

type ListFilters = {
  dateFrom?: string;
  dateTo?: string;
  assigneeId?: string;
} & ListScope;

function makeIncidentRef() {
  const y = new Date().getFullYear();
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `IN-${y}-${n}`;
}

const INCIDENT_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  INVESTIGATING: "Investigating",
  MITIGATED: "Mitigated",
  RESOLVED: "Resolved",
  CLOSED: "Closed"
};

const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical"
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};

// Per-field humanisation for Incident updates (UpdateIncidentDto fields). `status` is NOT
// here — it changes via its own endpoint and emits a STATUS_UPDATED event (below).
const INCIDENT_FIELD_SPEC: FieldSpec = {
  title: { label: "Title", kind: "scalar" },
  description: { label: "Description", kind: "scalar" },
  severity: { label: "Severity", kind: "enum", labels: INCIDENT_SEVERITY_LABELS },
  priority: { label: "Priority", kind: "enum", labels: PRIORITY_LABELS },
  assigneeId: { label: "Assignee", kind: "ref" }
};

@Injectable()
export class IncidentsService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  async listForClient(clientId: string, viewer: ScopeViewer, filters: ListFilters = {}) {
    this.assertClientScope(clientId);
    const createdAt = this.getCreatedAtRange(filters.dateFrom, filters.dateTo);
    const scope = buildListScope(TERMINAL_STATUSES.incident, filters);
    const rows = await this.prisma.incident.findMany({
      where: applyAssignedScope(
        {
          clientId,
          assigneeId: filters.assigneeId || undefined,
          createdAt,
          ...scope.where
        },
        viewer
      ),
      orderBy: scope.orderBy ?? { updatedAt: "desc" },
      include: {
        assignee: {
          select: userDisplaySelect
        }
      }
    });
    return rows.map((r) => ({ ...r, assignee: toUserDisplay(r.assignee) }));
  }

  async exportCsvForClient(clientId: string, viewer: ScopeViewer, filters: ListFilters = {}) {
    const rows = await this.listForClient(clientId, viewer, filters);
    return rows.map((incident) => ({
      reference: incident.reference,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      priority: incident.priority,
      assignee: incident.assignee?.displayName ?? "",
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString()
    }));
  }

  async getForClient(clientId: string, id: string, viewer: ScopeViewer) {
    this.assertClientScope(clientId);
    const incident = await this.prisma.incident.findFirst({
      where: applyAssignedScope({ id, clientId }, viewer),
      include: {
        assignee: {
          select: userDisplaySelect
        }
      }
    });
    if (!incident) throw new NotFoundException("Incident not found");
    const createdBy = await resolveCreator(this.prisma, incident.createdById);
    const links = await resolveLinkedRecords(this.prisma, clientId, "incident", incident.id);
    const attachments = await resolveAttachments(this.prisma, clientId, "incident", incident.id);
    return { ...incident, assignee: toUserDisplay(incident.assignee), createdBy, links, attachments };
  }

  async createForClient(
    clientId: string,
    actorUserId: string,
    dto: { title: string; description: string; severity?: IncidentSeverity; priority?: string; dueAt?: string | null }
  ) {
    this.assertClientScope(clientId);
    const reference = await this.generateUniqueReference();
    const priority = dto.priority ?? "medium";

    // SLA: a user-supplied dueAt pins (dueAtManual: true); otherwise derive it from
    // the per-client SLA policy (createdAt + resolutionHours), unpinned.
    let slaData: { dueAt?: Date | null; dueAtManual?: boolean } = {};
    if (dto.dueAt !== undefined) {
      slaData = { dueAt: dto.dueAt ? new Date(dto.dueAt) : null, dueAtManual: true };
    } else {
      const hours = await resolveSlaHours(this.prisma, clientId, priority);
      if (hours !== null) {
        slaData = { dueAt: computeDueAt(new Date(), hours), dueAtManual: false };
      }
    }

    const created = await this.prisma.incident.create({
      data: {
        reference,
        clientId,
        title: dto.title,
        description: dto.description,
        severity: dto.severity ?? IncidentSeverity.MEDIUM,
        priority,
        ...slaData,
        createdById: actorUserId
      },
      include: {
        assignee: {
          select: userDisplaySelect
        }
      }
    });

    await emitAudit(this.prisma, {
      entityType: "Incident",
      entityId: created.id,
      action: "CREATED",
      actorUserId,
      clientId,
      reference: created.reference,
      title: created.title
    });

    return { ...created, assignee: toUserDisplay(created.assignee) };
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
      dueAt?: string | null;
      assigneeId?: string;
    },
    viewer: ScopeViewer
  ) {
    const incident = await this.getForClient(clientId, id, viewer);

    // Assignee lock (rule B): an ENGINEER may edit other fields but never reassign.
    if (viewer.role === Role.ENGINEER && dto.assigneeId !== undefined && dto.assigneeId !== incident.assigneeId) {
      throw new ForbiddenException("Engineers cannot change the assignee");
    }

    // SLA: a hand-set/cleared dueAt pins (dueAtManual: true). Otherwise, on a real
    // priority change of an unpinned record, recompute dueAt from createdAt + policy.
    let slaData: { dueAt?: Date | null; dueAtManual?: boolean } = {};
    if (dto.dueAt !== undefined) {
      slaData = { dueAt: dto.dueAt ? new Date(dto.dueAt) : null, dueAtManual: true };
    } else if (
      dto.priority !== undefined &&
      dto.priority !== incident.priority &&
      !incident.dueAtManual
    ) {
      const hours = await resolveSlaHours(this.prisma, clientId, dto.priority);
      if (hours !== null) {
        slaData = { dueAt: computeDueAt(incident.createdAt, hours), dueAtManual: false };
      }
    }

    const updated = await this.prisma.incident.update({
      where: { id: incident.id },
      data: {
        title: dto.title,
        description: dto.description,
        severity: dto.severity,
        priority: dto.priority,
        ...slaData,
        assigneeId: dto.assigneeId === "" ? null : dto.assigneeId ?? undefined
      },
      include: {
        assignee: {
          select: userDisplaySelect
        }
      }
    });

    const newAssignee = toUserDisplay(updated.assignee);
    // Resolve assignee ids -> display names from rows already in hand (old via getForClient,
    // new via the update include) — no extra lookup; humanised at emit time.
    const assigneeNames = new Map<string, string>();
    if (incident.assignee) assigneeNames.set(incident.assignee.id, incident.assignee.displayName);
    if (newAssignee) assigneeNames.set(newAssignee.id, newAssignee.displayName);

    const changes = diffRecord(incident, dto, INCIDENT_FIELD_SPEC, {
      assigneeId: (id) => (id ? assigneeNames.get(id) ?? null : null)
    });

    if (changes.length) {
      await emitAudit(this.prisma, {
        entityType: "Incident",
        entityId: incident.id,
        action: "UPDATED",
        actorUserId,
        clientId,
        changes
      });
    }

    // Notify the new assignee on a real (re)assignment. Best-effort; self-assign is
    // skipped inside the helper (recipient === actor).
    if (updated.assigneeId && updated.assigneeId !== incident.assigneeId) {
      await emitNotification(this.prisma, {
        type: NotificationType.ASSIGNED,
        recipientIds: [updated.assigneeId],
        actorId: actorUserId,
        clientId,
        sourceType: "Incident",
        sourceId: incident.id
      });
    }

    return { ...updated, assignee: newAssignee };
  }

  async updateStatusForClient(
    clientId: string,
    id: string,
    status: IncidentStatus,
    actorUserId: string,
    viewer: ScopeViewer,
    comment?: string
  ) {
    const incident = await this.getForClient(clientId, id, viewer);

    // Resolved-date bookkeeping (Live/History split): stamp on entering a terminal
    // state, clear on reopen, preserve if already terminal (undefined = no-op).
    const INC_TERMINAL: IncidentStatus[] = [IncidentStatus.RESOLVED, IncidentStatus.CLOSED];
    const nowTerminal = INC_TERMINAL.includes(status);
    const wasTerminal = INC_TERMINAL.includes(incident.status as IncidentStatus);
    const closedAt = nowTerminal ? (wasTerminal ? undefined : new Date()) : null;

    const updated = await this.prisma.incident.update({
      where: { id: incident.id },
      // closedAt → Live/History split; resolvedAt → MTTR metrics. Both stamped here.
      data: { status, closedAt, ...resolvedAtUpdate(incident.status, status, INCIDENT_RESOLVED_STATUSES) }
    });

    await emitAudit(this.prisma, {
      entityType: "Incident",
      entityId: incident.id,
      action: "STATUS_UPDATED",
      actorUserId,
      clientId,
      changes: [
        {
          field: "status",
          label: "Status",
          from: INCIDENT_STATUS_LABELS[incident.status] ?? incident.status,
          to: INCIDENT_STATUS_LABELS[status] ?? status
        }
      ],
      comment: comment?.trim() || null
    });

    // Notify the current assignee that the status moved. Best-effort; if the actor IS
    // the assignee (the common case) the helper self-skips, so this fires mainly when
    // someone else (a manager/analyst) transitions the record.
    await emitNotification(this.prisma, {
      type: NotificationType.STATUS_CHANGED,
      recipientIds: [incident.assigneeId],
      actorId: actorUserId,
      clientId,
      sourceType: "Incident",
      sourceId: incident.id
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
