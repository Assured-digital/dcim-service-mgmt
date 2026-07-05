import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { WorkPackagesModule } from "../work-packages/work-packages.module"
import { OpportunitiesService } from "./opportunities.service"
import { OpportunitiesController } from "./opportunities.controller"

@Module({
  imports: [PrismaModule, WorkPackagesModule],
  providers: [OpportunitiesService],
  controllers: [OpportunitiesController],
  exports: [OpportunitiesService]
})
export class OpportunitiesModule {}
