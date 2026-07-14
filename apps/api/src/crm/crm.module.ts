import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { OpportunitiesModule } from "../opportunities/opportunities.module"
import { TasksModule } from "../tasks/tasks.module"
import { MsGraphModule } from "../msgraph/msgraph.module"
import { CrmService } from "./crm.service"
import { MailSyncService } from "./mail-sync.service"
import { CrmController } from "./crm.controller"

@Module({
  imports: [PrismaModule, OpportunitiesModule, TasksModule, MsGraphModule],
  providers: [CrmService, MailSyncService],
  controllers: [CrmController],
  // Exported so the Reporting module (D3) can compose the commercial report.
  exports: [CrmService]
})
export class CrmModule {}
