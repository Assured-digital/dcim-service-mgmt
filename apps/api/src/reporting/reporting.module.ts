import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { MetricsModule } from "../metrics/metrics.module"
import { CrmModule } from "../crm/crm.module"
import { CapacityModule } from "../dcim/capacity.module"
import { ReportingService } from "./reporting.service"
import { ReportingController } from "./reporting.controller"

// D3 — composes the existing per-module engines. Importing MetricsModule / CrmModule /
// CapacityModule gives us their exported services (MetricsService, CrmService,
// CapacityService) as the same singletons — no metric logic is duplicated here.
@Module({
  imports: [PrismaModule, MetricsModule, CrmModule, CapacityModule],
  providers: [ReportingService],
  controllers: [ReportingController]
})
export class ReportingModule {}
