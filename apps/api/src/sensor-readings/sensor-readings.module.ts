import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { SensorReadingsController } from "./sensor-readings.controller"
import { SensorReadingsService } from "./sensor-readings.service"

@Module({
  imports: [PrismaModule],
  controllers: [SensorReadingsController],
  providers: [SensorReadingsService],
  exports: [SensorReadingsService],
})
export class SensorReadingsModule {}
