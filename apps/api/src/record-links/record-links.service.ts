import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecordLinkDto } from "./dto";
import {
  canonicalLinkEndpoints,
  LinkRecordType,
  resolveRecordSummary,
  searchRecords
} from "./resolve-links";

@Injectable()
export class RecordLinksService {
  constructor(private prisma: PrismaService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  async createLink(clientId: string, actorUserId: string | null, dto: CreateRecordLinkDto) {
    this.assertClientScope(clientId);

    if (dto.aType === dto.bType && dto.aId === dto.bId) {
      throw new BadRequestException("Cannot link a record to itself");
    }

    // Both endpoints MUST belong to the scoped client before we write a row — this
    // is the cross-tenant guard: a spoofed id pointing at another client's record
    // fails the clientId-scoped lookup, so no link can span clients.
    const [a, b] = await Promise.all([
      resolveRecordSummary(this.prisma, clientId, dto.aType, dto.aId),
      resolveRecordSummary(this.prisma, clientId, dto.bType, dto.bId)
    ]);
    if (!a) throw new NotFoundException(`Record not found in this client: ${dto.aType}`);
    if (!b) throw new NotFoundException(`Record not found in this client: ${dto.bType}`);

    const canon = canonicalLinkEndpoints(dto.aType, dto.aId, dto.bType, dto.bId);

    try {
      return await this.prisma.recordLink.create({
        data: { clientId, ...canon, createdById: actorUserId ?? undefined }
      });
    } catch (err) {
      // Duplicate link (same canonical pair) — idempotent: return the existing row
      // so a double-click is harmless rather than a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.prisma.recordLink.findFirst({ where: { clientId, ...canon } });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async deleteLink(clientId: string, id: string) {
    this.assertClientScope(clientId);
    // clientId in the where so a link belonging to another tenant cannot be deleted
    // by guessing its id.
    const res = await this.prisma.recordLink.deleteMany({ where: { id, clientId } });
    if (res.count === 0) throw new NotFoundException("Link not found");
    return { ok: true };
  }

  async search(clientId: string, type: LinkRecordType, q: string | undefined) {
    this.assertClientScope(clientId);
    return searchRecords(this.prisma, clientId, type, q);
  }
}
