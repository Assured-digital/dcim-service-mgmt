import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { OpportunitiesModule } from "../opportunities/opportunities.module"
import { TasksModule } from "../tasks/tasks.module"
import { MsGraphModule } from "../msgraph/msgraph.module"
import { CrmService } from "./crm.service"
import { CrmController } from "./crm.controller"

@Module({
  imports: [PrismaModule, OpportunitiesModule, TasksModule, MsGraphModule],
  providers: [CrmService],
  controllers: [CrmController]
})
export class CrmModule {}
