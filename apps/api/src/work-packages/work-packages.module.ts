import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { WorkPackagesService } from "./work-packages.service"
import { WorkPackagesController } from "./work-packages.controller"

@Module({
  imports: [PrismaModule],
  providers: [WorkPackagesService],
  controllers: [WorkPackagesController],
  exports: [WorkPackagesService]
})
export class WorkPackagesModule {}