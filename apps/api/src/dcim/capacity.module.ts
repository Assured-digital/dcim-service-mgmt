import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { CapacityController } from "./capacity.controller"
import { CapacityService } from "./capacity.service"
import { FloorPlanController } from "./floor-plan.controller"
import { FloorPlanService } from "./floor-plan.service"
import { InfrastructureReportController } from "./infrastructure-report.controller"
import { InfrastructureReportService } from "./infrastructure-report.service"
import { SensorReadingsModule } from "../sensor-readings/sensor-readings.module"

// The DCIM module groups capacity + floor-plan + the client infrastructure report
// (StorageService comes from the @Global() StorageModule — no import needed).
// SensorReadingsModule feeds the measured-power/environment roll-up (Horizon 3).
@Module({
  imports: [PrismaModule, SensorReadingsModule],
  controllers: [CapacityController, FloorPlanController, InfrastructureReportController],
  providers: [CapacityService, FloorPlanService, InfrastructureReportService],
  exports: [CapacityService, FloorPlanService, InfrastructureReportService],
})
export class CapacityModule {}
