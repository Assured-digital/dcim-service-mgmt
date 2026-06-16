import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { AttachmentsService } from "./attachments.service";
import { CreateAttachmentDto, UpdateAttachmentCaptionDto } from "./dto";
import {
  contentDispositionHeader,
  isInlineType,
  MAX_ATTACHMENT_BYTES
} from "./content-policy";

// Reads open to the full operational set; mutations exclude only read-only viewers
// (CLIENT_VIEWER / PUBLIC_USER). ENGINEER is a WRITE role here: field engineers attach
// site-evidence photos to checks/check-items/maintenance on-site — without write access
// the per-item evidence flow (and the check-level panel) 403s for the actual field user.
// Upload/delete stay tenant-scoped (clientId chokepoint) + magic-byte content-validated.
const ATTACH_WRITE_ROLES = [
  Role.ORG_OWNER,
  Role.ORG_ADMIN,
  Role.ADMIN,
  Role.SERVICE_MANAGER,
  Role.SERVICE_DESK_ANALYST,
  Role.ENGINEER
] as const;

const ATTACH_READ_ROLES = [...ATTACH_WRITE_ROLES, Role.CLIENT_VIEWER] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("attachments")
@ApiBearerAuth()
@Controller("attachments")
export class AttachmentsController {
  constructor(private attachments: AttachmentsService, private prisma: PrismaService) {}

  @Post()
  @Roles(...ATTACH_WRITE_ROLES)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_BYTES }
    })
  )
  async upload(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAttachmentDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.attachments.create(
      clientId,
      dto.recordType,
      dto.recordId,
      user.userId ?? null,
      file,
      dto.caption
    );
  }

  // Edit a caption on an existing attachment. Write-roles only + clientId-scoped +
  // evidence-lock (a caption edit on a COMPLETED/CLOSED check is rejected in the service).
  @Patch(":id")
  @Roles(...ATTACH_WRITE_ROLES)
  async updateCaption(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateAttachmentCaptionDto,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.attachments.updateCaption(clientId, id, dto.caption);
  }

  @Get(":id")
  @Roles(...ATTACH_READ_ROLES)
  async download(
    @Req() req: any,
    @Param("id") id: string,
    @Res() res: Response,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    const { meta, stream } = await this.attachments.openForDownload(clientId, id);

    // Inline ONLY for the server-validated allow-list (PDF + raster images); anything
    // else is forced to download. nosniff stops the browser from re-interpreting the
    // body as a different (executable) type — defends the stored-XSS path.
    const disposition = isInlineType(meta.contentType) ? "inline" : "attachment";
    res.setHeader("Content-Type", meta.contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(meta.size));
    res.setHeader("Content-Disposition", contentDispositionHeader(disposition, meta.filename));

    stream.on("error", () => {
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  }

  @Delete(":id")
  @Roles(...ATTACH_WRITE_ROLES)
  async remove(
    @Req() req: any,
    @Param("id") id: string,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    return this.attachments.remove(clientId, id);
  }
}
