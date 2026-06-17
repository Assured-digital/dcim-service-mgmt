import { Module } from "@nestjs/common"
import { ChecksController } from "./checks.controller"
import { ChecksService } from "./checks.service"
import { ChecksReportService } from "./checks-report.service"
import { PrismaModule } from "../prisma/prisma.module"
import { AttachmentsModule } from "../attachments/attachments.module"

@Module({
  // AttachmentsModule gives the report path AttachmentsService.openForDownload — the
  // tenant-scoped (where: { id, clientId }) byte fetch used to embed evidence images.
  imports: [PrismaModule, AttachmentsModule],
  controllers: [ChecksController],
  providers: [ChecksService, ChecksReportService]
})
export class ChecksModule {}