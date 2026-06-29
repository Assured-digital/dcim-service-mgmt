import { BadRequestException, Controller, Get, Headers, Param, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";
import { getJwtUser, resolveClientScope } from "../auth/request-context";
import { contentDispositionHeader } from "../attachments/content-policy";
import { PrismaService } from "../prisma/prisma.service";
import { RecordReportService, isRecordReportType } from "./record-report.service";

// One export endpoint for every work-item type (Service Request, Incident, Change, Risk,
// Issue, Task). Same read-roles + clientId scope as each type's GET :id. Tenant isolation:
// clientId is resolved here at the edge and the service fetches the record AND every
// embedded image byte through clientId-scoped paths, so a spoofed x-client-id can never
// pull another client's record or its images (cross-client id → 404 from getForClient).
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("records")
@ApiBearerAuth()
@Controller("records")
export class RecordReportController {
  constructor(
    private report: RecordReportService,
    private prisma: PrismaService
  ) {}

  @Get(":type/:id/report.pdf")
  @Roles(Role.ORG_OWNER, Role.ORG_ADMIN, Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST, Role.ENGINEER, Role.CLIENT_VIEWER)
  async reportPdf(
    @Req() req: any,
    @Param("type") type: string,
    @Param("id") id: string,
    @Res() res: Response,
    @Headers("x-client-id") requestedClientId?: string
  ) {
    // Reject unknown types before any DB work (the on-the-wire contract is the six literals).
    if (!isRecordReportType(type)) {
      throw new BadRequestException(`Unsupported record type: ${type}`);
    }
    const user = getJwtUser(req);
    const clientId = await resolveClientScope(user, requestedClientId, this.prisma);
    const { filename, buffer } = await this.report.generatePdf(type, clientId, id, user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", contentDispositionHeader("attachment", filename));
    res.send(buffer);
  }
}
