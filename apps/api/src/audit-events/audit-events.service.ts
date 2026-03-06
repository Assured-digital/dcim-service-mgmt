import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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

    const withActor = await this.attachActorEmails(items);
    return {
      items: withActor,
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
    return this.attachActorEmails(items);
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
      select: { id: true, email: true }
    });
    return users.sort((a, b) => a.email.localeCompare(b.email));
  }

  private async attachActorEmails(
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
          select: { id: true, email: true }
        })
      : [];
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    return items.map((item) => ({
      ...item,
      actorEmail: item.actorUserId ? emailById.get(item.actorUserId) ?? null : null
    }));
  }
}
