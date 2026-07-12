import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { CheckStatus } from "@prisma/client";
import type { Readable } from "stream";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AttachmentRecordType, resolveRecordSummary } from "../record-links/resolve-links";
import { MAX_ATTACHMENT_BYTES, sniffContentType } from "./content-policy";
import { MAX_CAPTION_LENGTH } from "./dto";
import { AttachmentSummary } from "./resolve-attachments";

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  // Evidence-immutability lock: once a Check is COMPLETED/CLOSED its attachment set is
  // frozen (the signed-off evidence record), so neither check-level nor per-item
  // (check-item) photos may be added or deleted. This is a STATUS predicate layered ON
  // TOP of the clientId chokepoint — it never replaces or weakens tenant scoping; every
  // lookup here is still clientId-scoped (the same indirect chain resolve-links uses).
  // Only the two check-owned attachment types are affected; all other types short-circuit.
  // Mirrors the ChecksService.updateItem block (message style + COMPLETED/CLOSED gate).
  private async assertCheckNotLocked(clientId: string, recordType: string, recordId: string) {
    let status: string | null | undefined;
    if (recordType === "check") {
      // recordId IS the checkId — scoped by clientId.
      const check = await this.prisma.check.findFirst({
        where: { id: recordId, clientId },
        select: { status: true }
      });
      status = check?.status;
    } else if (recordType === "check-item") {
      // recordId is the itemId — resolve the owning check's status THROUGH the item,
      // scoped by check.clientId (same indirect tenant chain as resolve-links).
      const item = await this.prisma.checkItem.findFirst({
        where: { id: recordId, check: { clientId } },
        select: { check: { select: { status: true } } }
      });
      status = item?.check.status;
    } else {
      return; // not a check-owned attachment — no status lock
    }
    if (status === CheckStatus.COMPLETED || status === CheckStatus.CLOSED) {
      throw new BadRequestException("Cannot modify attachments on a completed check");
    }
  }

  // Caption is a short label, not prose: trim, drop to NULL when blank, and clamp to
  // the DTO max so a direct API caller can't exceed the validated bound.
  private normalizeCaption(caption: string | null | undefined): string | null {
    if (typeof caption !== "string") return null;
    const trimmed = caption.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, MAX_CAPTION_LENGTH);
  }

  // Which backend an attachment's bytes live under: its own marker, else the
  // configured legacy provider (rows written before the marker / a backend switch),
  // else undefined → the storage layer falls back to the active provider.
  private providerFor(marker: string | null | undefined): string | undefined {
    return marker ?? process.env.STORAGE_LEGACY_PROVIDER ?? undefined;
  }

  private toSummary(row: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    caption: string | null;
    createdAt: Date;
  }): AttachmentSummary {
    return {
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      size: row.size,
      caption: row.caption ?? null,
      uploadedAt: row.createdAt.toISOString(),
      inline: true // every stored type is allow-listed, hence inline-eligible
    };
  }

  async create(
    clientId: string,
    recordType: AttachmentRecordType,
    recordId: string,
    actorUserId: string | null,
    file: Express.Multer.File | undefined,
    caption?: string | null
  ): Promise<AttachmentSummary> {
    this.assertClientScope(clientId);

    // Cross-tenant guard: the target record MUST exist in the scoped client. A spoofed
    // id pointing at another client's record fails this clientId-scoped lookup, so an
    // attachment can never be hung off a record outside the caller's scope.
    const target = await resolveRecordSummary(this.prisma, clientId, recordType, recordId);
    if (!target) throw new NotFoundException(`Record not found in this client: ${recordType}`);

    // Block uploads onto a signed-off check (check/check-item only); no-op otherwise.
    await this.assertCheckNotLocked(clientId, recordType, recordId);

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException("No file provided");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException("File exceeds the 25MB limit");
    }

    // Validate the ACTUAL bytes, not the client-sent mimetype. The sniffed type is
    // what we store and later trust for the inline decision.
    const contentType = sniffContentType(file.buffer);
    if (!contentType) {
      throw new UnsupportedMediaTypeException(
        "File type not allowed. Permitted: PDF and PNG/JPEG/GIF/WebP images."
      );
    }

    const storageKey = `${clientId}/${recordType}/${uuidv4()}-${file.size}`;
    await this.storage.putObject(storageKey, file.buffer, contentType);

    const row = await this.prisma.attachment.create({
      data: {
        clientId,
        recordType,
        recordId,
        filename: file.originalname || "file",
        contentType,
        size: file.size,
        storageKey,
        storageProvider: this.storage.activeName(),
        caption: this.normalizeCaption(caption),
        uploadedById: actorUserId ?? undefined
      }
    });

    return this.toSummary(row);
  }

  // Edit just the caption of an existing attachment (clientId-scoped lookup is the
  // tenant chokepoint, same as every other read here). The evidence lock applies: a
  // caption edit on a COMPLETED/CLOSED check is rejected, mirroring create/delete.
  async updateCaption(
    clientId: string,
    id: string,
    caption: string | null | undefined
  ): Promise<AttachmentSummary> {
    this.assertClientScope(clientId);
    const att = await this.prisma.attachment.findFirst({ where: { id, clientId } });
    if (!att) throw new NotFoundException("Attachment not found");
    await this.assertCheckNotLocked(clientId, att.recordType, att.recordId);
    const row = await this.prisma.attachment.update({
      where: { id: att.id },
      data: { caption: this.normalizeCaption(caption) }
    });
    return this.toSummary(row);
  }

  // Re-checks tenant scope (where: { id, clientId }) before opening the byte stream —
  // the same chokepoint as every other client-scoped read. Returns metadata + stream;
  // the controller sets headers (Content-Disposition / nosniff) from the metadata.
  async openForDownload(
    clientId: string,
    id: string
  ): Promise<{ meta: { filename: string; contentType: string; size: number }; stream: Readable }> {
    this.assertClientScope(clientId);
    const att = await this.prisma.attachment.findFirst({ where: { id, clientId } });
    if (!att) throw new NotFoundException("Attachment not found");
    const stream = await this.storage.getObject(att.storageKey, this.providerFor(att.storageProvider));
    return {
      meta: { filename: att.filename, contentType: att.contentType, size: att.size },
      stream
    };
  }

  async remove(clientId: string, id: string): Promise<{ ok: true }> {
    this.assertClientScope(clientId);
    const att = await this.prisma.attachment.findFirst({ where: { id, clientId } });
    if (!att) throw new NotFoundException("Attachment not found");
    // Same evidence lock on delete: a COMPLETED/CLOSED check's photos can't be removed
    // (check/check-item only; the att row carries the owning recordType + recordId).
    await this.assertCheckNotLocked(clientId, att.recordType, att.recordId);
    // Remove the bytes first, then the metadata row. If the byte delete fails we keep
    // the row so the operation is retryable rather than leaving a dangling pointer.
    await this.storage.deleteObject(att.storageKey, this.providerFor(att.storageProvider));
    await this.prisma.attachment.delete({ where: { id: att.id } });
    return { ok: true };
  }
}
