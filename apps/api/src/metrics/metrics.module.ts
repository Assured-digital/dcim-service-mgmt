import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  // Exported so the Reporting module (D3) can compose MTTR/SLA into the summary.
  exports: [MetricsService]
})
export class MetricsModule {}
