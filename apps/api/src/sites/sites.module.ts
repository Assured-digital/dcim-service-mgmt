import { Module } from "@nestjs/common"
import { SitesController } from "./sites.controller"
import { SitesService } from "./sites.service"
import { RoomsController } from "./rooms.controller"
import { RoomsService } from "./rooms.service"
import { GeocodingService } from "./geocoding.service"
import { PrismaModule } from "../prisma/prisma.module"

@Module({
  imports: [PrismaModule],
  controllers: [SitesController, RoomsController],
  providers: [SitesService, RoomsService, GeocodingService],
  exports: [SitesService, RoomsService, GeocodingService]
})
export class SitesModule {}