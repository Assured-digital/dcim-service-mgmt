import { Module } from "@nestjs/common";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  // Exported so the checks report path (ChecksModule) can embed image bytes through
  // openForDownload — the SAME tenant-scoped (where: { id, clientId }) byte fetch the
  // download endpoint uses, so a report can never surface another client's attachment.
  exports: [AttachmentsService]
})
export class AttachmentsModule {}
