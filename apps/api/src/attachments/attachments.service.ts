import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException
} from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import type { Readable } from "stream";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AttachmentRecordType, resolveRecordSummary } from "../record-links/resolve-links";
import { MAX_ATTACHMENT_BYTES, sniffContentType } from "./content-policy";
import { AttachmentSummary } from "./resolve-attachments";

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  private assertClientScope(clientId: string) {
    if (!clientId) throw new ForbiddenException("Missing client scope");
  }

  private toSummary(row: {
    id: string;
    filename: string;
    contentType: string;
    size: number;
    createdAt: Date;
  }): AttachmentSummary {
    return {
      id: row.id,
      filename: row.filename,
      contentType: row.contentType,
      size: row.size,
      uploadedAt: row.createdAt.toISOString(),
      inline: true // every stored type is allow-listed, hence inline-eligible
    };
  }

  async create(
    clientId: string,
    recordType: AttachmentRecordType,
    recordId: string,
    actorUserId: string | null,
    file: Express.Multer.File | undefined
  ): Promise<AttachmentSummary> {
    this.assertClientScope(clientId);

    // Cross-tenant guard: the target record MUST exist in the scoped client. A spoofed
    // id pointing at another client's record fails this clientId-scoped lookup, so an
    // attachment can never be hung off a record outside the caller's scope.
    const target = await resolveRecordSummary(this.prisma, clientId, recordType, recordId);
    if (!target) throw new NotFoundException(`Record not found in this client: ${recordType}`);

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
        uploadedById: actorUserId ?? undefined
      }
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
    const stream = await this.storage.getObject(att.storageKey);
    return {
      meta: { filename: att.filename, contentType: att.contentType, size: att.size },
      stream
    };
  }

  async remove(clientId: string, id: string): Promise<{ ok: true }> {
    this.assertClientScope(clientId);
    const att = await this.prisma.attachment.findFirst({ where: { id, clientId } });
    if (!att) throw new NotFoundException("Attachment not found");
    // Remove the bytes first, then the metadata row. If the byte delete fails we keep
    // the row so the operation is retryable rather than leaving a dangling pointer.
    await this.storage.deleteObject(att.storageKey);
    await this.prisma.attachment.delete({ where: { id: att.id } });
    return { ok: true };
  }
}
