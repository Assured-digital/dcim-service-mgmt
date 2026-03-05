import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";
import { CreateDocumentReferenceDto } from "./dto";
import { Roles } from "../auth/roles.decorator";
import { Role } from "@prisma/client";
import { UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../auth/roles.guard";

@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags("documents")
@ApiBearerAuth()
@Controller("documents")
export class DocumentsController {
  constructor(private docs: DocumentsService) {}

  @Get()
  async list(@Req() req: any) {
    const clientId = req.user.clientId;
    return this.docs.listForClient(clientId);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SERVICE_MANAGER, Role.SERVICE_DESK_ANALYST)
  async create(@Req() req: any, @Body() dto: CreateDocumentReferenceDto) {
    const clientId = req.user.clientId;
    return this.docs.createForClient(clientId, dto);
  }
}
