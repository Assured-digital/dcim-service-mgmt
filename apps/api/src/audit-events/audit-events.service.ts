import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { computeDisplayName, userDisplaySelect } from "../users/display";
import {
  type AttachmentRecordType,
  resolveRecordSummaries
} from "../record-links/resolve-links";

// Maps an AuditEvent.entityType (PascalCase model name) to the shared record resolver's
// type key. Only events whose record carries a human reference/title are mappable; the
// rest (Site, Asset, Cabinet, WorkPackage, RequestIntake, PublicSubmission, …) fall back
// to the event's own data.reference/title, then to the raw entityId on the frontend.
const AUDIT_ENTITY_TO_RECORD_TYPE: Record<string, AttachmentRecordType> = {
  Incident: "incident",
  ServiceRequest: "service_request",
  ChangeRequest: "change",
  Task: "task",
  Risk: "risk",
  Issue: "issue",
  Check: "check",
  Maintenance: "maintenance"
};

type ListFilters = {
  page: number;
  pageSize: number;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

@Injectable()
export class AuditEventsService {
  constructor(private prisma: PrismaService) {}

  async listForClient(clientId: string, filters: ListFilters) {
    const where: Prisma.AuditEventWhereInput = {
      clientId
    };

    if (filters.actorUserId) where.actorUserId = filters.actorUserId;
    if (filters.action) where.action = { contains: filters.action, mode: "insensitive" };
    if (filters.entityType) where.entityType = { contains: filters.entityType, mode: "insensitive" };

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        gte: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        lte: filters.dateTo ? new Date(filters.dateTo) : undefined
      };
    }

    if (filters.query?.trim()) {
      const q = filters.query.trim();
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } }
      ];
    }

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      this.prisma.auditEvent.count({ where })
    ]);

    const withActor = await this.attachActor(items);
    const enriched = await this.attachEntityRef(clientId, withActor);
    return {
      items: enriched,
      total,
      page,
      pageSize
    };
  }

  async listEntityHistory(clientId: string, entityType: string, entityId: string, limit = 50) {
    const items = await this.prisma.auditEvent.findMany({
      where: {
        clientId,
        entityType,
        entityId
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return this.attachActor(items);
  }

  async listActorsForClient(clientId: string) {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        clientId,
        actorUserId: { not: null }
      },
      select: { actorUserId: true },
      distinct: ["actorUserId"]
    });
    const ids = rows.map((r) => r.actorUserId).filter((v): v is string => !!v);
    if (ids.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: userDisplaySelect
    });
    return users
      .map((u) => ({ id: u.id, displayName: computeDisplayName(u) }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Resolves each event's actorUserId to a displayName (knownAs -> "First Last" -> email).
  // Exposes actorDisplayName ONLY — the raw actor email never reaches the client.
  private async attachActor(
    items: Array<{
      id: string;
      entityType: string;
      entityId: string;
      action: string;
      actorUserId: string | null;
      clientId: string | null;
      data: Prisma.JsonValue | null;
      createdAt: Date;
      serviceRequestId: string | null;
    }>
  ) {
    const ids = [...new Set(items.map((x) => x.actorUserId).filter((v): v is string => !!v))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: userDisplaySelect
        })
      : [];
    const displayNameById = new Map(users.map((u) => [u.id, computeDisplayName(u)]));

    return items.map((item) => ({
      ...item,
      actorDisplayName: item.actorUserId ? displayNameById.get(item.actorUserId) ?? null : null
    }));
  }

  // Resolves each event's entityType+entityId to a live { reference, title } via the
  // shared record resolver (clientId-scoped — the tenant chokepoint). Most events
  // (UPDATED/STATUS_UPDATED) carry no denormalised reference, so without this the grid
  // would show a raw UUID. Falls back to the event's own data.reference/title for
  // deleted records and unmapped entity types; the frontend falls back further to the id.
  private async attachEntityRef<
    T extends { entityType: string; entityId: string; data: Prisma.JsonValue | null }
  >(clientId: string, items: T[]) {
    const idsByType = new Map<AttachmentRecordType, Set<string>>();
    for (const item of items) {
      const type = AUDIT_ENTITY_TO_RECORD_TYPE[item.entityType];
      if (!type) continue;
      (idsByType.get(type) ?? idsByType.set(type, new Set()).get(type)!).add(item.entityId);
    }

    const summaries = new Map<string, { reference: string; title: string }>();
    for (const [type, ids] of idsByType) {
      const recs = await resolveRecordSummaries(this.prisma, clientId, type, [...ids]);
      for (const r of recs) summaries.set(`${type}:${r.id}`, { reference: r.reference, title: r.title });
    }

    return items.map((item) => {
      const type = AUDIT_ENTITY_TO_RECORD_TYPE[item.entityType];
      const live = type ? summaries.get(`${type}:${item.entityId}`) : undefined;
      const data = (item.data ?? null) as Record<string, unknown> | null;
      const dataRef = typeof data?.reference === "string" ? data.reference : null;
      const dataTitle = typeof data?.title === "string" ? data.title : null;
      // `||` (not `??`) so the resolver's empty-string reference (maintenance) falls back.
      return {
        ...item,
        entityRef: live?.reference || dataRef || null,
        entityTitle: live?.title || dataTitle || null
      };
    });
  }
}
