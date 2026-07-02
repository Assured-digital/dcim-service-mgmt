import { Module } from "@nestjs/common"
import { PrismaModule } from "../prisma/prisma.module"
import { DeviceTypesController, ManufacturersController } from "./device-types.controller"
import { DeviceTypesService } from "./device-types.service"

// StorageService comes from the @Global() StorageModule — no import needed here.
@Module({
  imports: [PrismaModule],
  controllers: [DeviceTypesController, ManufacturersController],
  providers: [DeviceTypesService],
  exports: [DeviceTypesService],
})
export class DeviceTypesModule {}
