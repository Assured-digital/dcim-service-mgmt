import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MsGraphService, SP_LIBRARY, type DriveItem } from "../msgraph/msgraph.service";
import { ATTACHMENT_RECORD_TYPES, AttachmentRecordType, resolveRecordSummary } from "../record-links/resolve-links";
import { CreateDocumentReferenceDto } from "./dto";

function isAttachmentRecordType(v: unknown): v is AttachmentRecordType {
  return typeof v === "string" && (ATTACHMENT_RECORD_TYPES as readonly string[]).includes(v);
}

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService, private graph: MsGraphService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  // Document references for the client, optionally filtered to ONE record
  // (linkedEntityType + linkedEntityId) — the per-record "Documents" panel.
  listForClient(clientId: string, filter?: { linkedEntityType?: string; linkedEntityId?: string }) {
    this.assertClientScope(clientId);
    const where =
      filter?.linkedEntityType && filter?.linkedEntityId
        ? { clientId, linkedEntityType: filter.linkedEntityType, linkedEntityId: filter.linkedEntityId }
        : { clientId };
    return this.prisma.documentReference.findMany({ where, orderBy: { createdAt: "desc" } });
  }

  // Link a document (a SharePoint business doc, or any URL) to the client, optionally
  // pinned to a record. When a record is named AND it is an attachable type, the target
  // MUST exist in the scoped client (cross-tenant guard) before the link is written — a
  // spoofed id pointing at another client's record fails this clientId-scoped resolve.
  async createForClient(clientId: string, dto: CreateDocumentReferenceDto) {
    this.assertClientScope(clientId);
    const { linkedEntityType, linkedEntityId } = dto;
    if (linkedEntityType && linkedEntityId && isAttachmentRecordType(linkedEntityType)) {
      const target = await resolveRecordSummary(this.prisma, clientId, linkedEntityType, linkedEntityId);
      if (!target) throw new NotFoundException(`Record not found in this client: ${linkedEntityType}`);
    }
    return this.prisma.documentReference.create({
      data: {
        clientId,
        title: dto.title,
        url: dto.url,
        docType: dto.docType,
        version: dto.version,
        linkedEntityType,
        linkedEntityId
      }
    });
  }

  // Unlink (delete) a document reference — clientId-scoped so a spoofed id cannot
  // remove another client's row.
  async remove(clientId: string, id: string): Promise<{ ok: true }> {
    this.assertClientScope(clientId);
    const row = await this.prisma.documentReference.findFirst({ where: { id, clientId }, select: { id: true } });
    if (!row) throw new NotFoundException("Document not found");
    await this.prisma.documentReference.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ── SharePoint browse/search — the client's Documents (shared) library ──────
  // Generalised off the CRM-only path so the per-record picker never needs CRM
  // entitlement. Discriminated status: integration off / no site mapped / results.
  async browse(clientId: string, subPath?: string): Promise<
    | { status: "disabled" }
    | { status: "unmapped" }
    | { status: "ok"; subPath: string; items: DriveItem[] }
  > {
    this.assertClientScope(clientId);
    if (!this.graph.isConfigured()) return { status: "disabled" };
    const siteId = await this.resolveSiteId(clientId);
    if (!siteId) return { status: "unmapped" };
    const rel = this.safeSubPath(subPath);
    const items = await this.graph.listChildren(siteId, SP_LIBRARY.DOCUMENTS, rel);
    return { status: "ok", subPath: rel, items };
  }

  async search(clientId: string, query: string): Promise<
    | { status: "disabled" }
    | { status: "unmapped" }
    | { status: "ok"; items: DriveItem[] }
  > {
    this.assertClientScope(clientId);
    if (!this.graph.isConfigured()) return { status: "disabled" };
    if (!query?.trim()) throw new BadRequestException("A search term is required");
    const siteId = await this.resolveSiteId(clientId);
    if (!siteId) return { status: "unmapped" };
    const items = await this.graph.searchInLibrary(siteId, SP_LIBRARY.DOCUMENTS, "", query.trim());
    return { status: "ok", items };
  }

  private async resolveSiteId(clientId: string): Promise<string | null> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { sharePointSiteId: true }
    });
    return client?.sharePointSiteId?.trim() || null;
  }

  // Reject traversal / absolute paths — browse can never escape the Documents library.
  private safeSubPath(subPath?: string): string {
    const s = (subPath ?? "").replace(/^\/+|\/+$/g, "");
    if (!s) return "";
    if (s.split("/").some((seg) => seg === "." || seg === "..")) throw new BadRequestException("Invalid path");
    return s;
  }
}
