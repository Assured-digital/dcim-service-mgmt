import { Module } from "@nestjs/common"
import { SitesController } from "./sites.controller"
import { SitesService } from "./sites.service"
import { RoomsController } from "./rooms.controller"
import { RoomsService } from "./rooms.service"
import { PrismaModule } from "../prisma/prisma.module"

@Module({
  imports: [PrismaModule],
  controllers: [SitesController, RoomsController],
  providers: [SitesService, RoomsService],
  exports: [SitesService, RoomsService]
})
export class SitesModule {}