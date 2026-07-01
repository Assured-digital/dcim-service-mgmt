import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { DeviceTypesController } from "./device-types.controller"
import { DeviceTypesService } from "./device-types.service"

@Module({
  imports: [PrismaModule],
  controllers: [DeviceTypesController],
  providers: [DeviceTypesService],
  exports: [DeviceTypesService],
})
export class DeviceTypesModule {}
