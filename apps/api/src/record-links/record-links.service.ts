import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateRecordLinkDto, PARENT_CHILD_TYPES, ParentChildType, ParentEntityType, SetParentLinkDto } from "./dto";
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

  // ── Parent-context links ────────────────────────────────────────────────
  // Point a work item (task/sr/risk/issue) at ONE DCIM parent (Asset/Cabinet/Site)
  // via its linkedEntity* scalar. The parent must resolve in the SAME client scope
  // (tenant guard), and the child update is clientId-scoped, so neither endpoint can
  // cross tenants by guessing an id.
  async setParent(clientId: string, dto: SetParentLinkDto) {
    this.assertClientScope(clientId);
    // The stored linkedEntityType is PascalCase ("Asset"); the resolver keys are
    // lowercase ("asset"). Map before the in-scope existence check.
    const resolveType = { Asset: "asset", Cabinet: "cabinet", Site: "site" } as const;
    const parent = await resolveRecordSummary(
      this.prisma,
      clientId,
      resolveType[dto.parentType as ParentEntityType],
      dto.parentId
    );
    if (!parent) throw new NotFoundException(`Parent not found in this client: ${dto.parentType}`);
    await this.updateChildParent(clientId, dto.childType, dto.childId, dto.parentType, dto.parentId);
    return { ok: true };
  }

  async clearParent(clientId: string, childType: string, childId: string) {
    this.assertClientScope(clientId);
    if (!(PARENT_CHILD_TYPES as readonly string[]).includes(childType)) {
      throw new BadRequestException(`Unsupported record type: ${childType}`);
    }
    await this.updateChildParent(clientId, childType as ParentChildType, childId, null, null);
    return { ok: true };
  }

  // Set or clear (null) a child's parent pointer, scoped by clientId via updateMany
  // (a where-scoped update: another client's row is never matched). count===0 means
  // the record does not exist in this scope → 404 (indistinguishable from cross-tenant).
  private async updateChildParent(
    clientId: string,
    childType: ParentChildType,
    childId: string,
    parentType: string | null,
    parentId: string | null
  ) {
    const data = { linkedEntityType: parentType, linkedEntityId: parentId };
    const where = { id: childId, clientId };
    let count = 0;
    switch (childType) {
      case "task":
        ({ count } = await this.prisma.task.updateMany({ where, data }));
        break;
      case "service_request":
        ({ count } = await this.prisma.serviceRequest.updateMany({ where, data }));
        break;
      case "risk":
        ({ count } = await this.prisma.risk.updateMany({ where, data }));
        break;
      case "issue":
        ({ count } = await this.prisma.issue.updateMany({ where, data }));
        break;
    }
    if (count === 0) throw new NotFoundException("Record not found in this client");
  }
}
