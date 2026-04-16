import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { MaintenanceController } from "./maintenance.controller"
import { MaintenanceService } from "./maintenance.service"

@Module({
  imports: [PrismaModule],
  providers: [MaintenanceService],
  controllers: [MaintenanceController],
  exports: [MaintenanceService]
})
export class MaintenanceModule {}
