import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AttachmentsModule } from "../attachments/attachments.module";
import { ServiceRequestsModule } from "../service-requests/service-requests.module";
import { IncidentsModule } from "../incidents/incidents.module";
import { ChangesModule } from "../changes/changes.module";
import { RisksModule } from "../risks/risks.module";
import { IssuesModule } from "../issues/issues.module";
import { TasksModule } from "../tasks/tasks.module";
import { RecordReportController } from "./record-report.controller";
import { RecordReportService } from "./record-report.service";

// One export engine for every work-item type. Imports the six type modules (each exports
// its service, so RecordReportService can call their clientId-scoped getForClient) plus
// AttachmentsModule for the tenant-scoped openForDownload byte fetch used to embed images.
@Module({
  imports: [
    PrismaModule,
    AttachmentsModule,
    ServiceRequestsModule,
    IncidentsModule,
    ChangesModule,
    RisksModule,
    IssuesModule,
    TasksModule
  ],
  controllers: [RecordReportController],
  providers: [RecordReportService]
})
export class RecordReportModule {}
